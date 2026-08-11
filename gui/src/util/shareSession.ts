import type { ChatHistoryItem } from "core";
import { stripImages } from "core/util/messageContent";
import { getLanguage } from "./i18n";

/**
 * 会话分享 —— 通用渲染管线。
 *
 * 设计原则：所有格式化函数只接受一个「已经选好的消息数组」(ChatHistoryItem[])，
 * 不关心这个数组是怎么来的。因此：
 *   - 当前（B 方案）：ShareScope = { kind: "upToIndex" }，无交互界面，默认取当前会话截至该条；
 *   - 后续（C 方案）：新增会话选择/过滤 UI，只要最终产出同样的 ChatHistoryItem[]，
 *     渲染、纯文本、AI 总结全部复用，无需改动本文件的输出逻辑。
 */

export type ShareFormat = "markdown" | "plaintext";

/** 分享范围。upToIndex 为当前唯一使用的分支，其余为后续选择/过滤功能预留。 */
export type ShareScope =
  | { kind: "upToIndex"; index: number }
  | { kind: "wholeSession" }
  | { kind: "range"; start: number; end: number }
  | { kind: "pickedIndices"; indices: number[] };

/** 唯一的「范围 -> 数组」入口，后续扩展只需在这里加分支。 */
export function selectShareItems<T extends ChatHistoryItem>(
  history: T[],
  scope: ShareScope,
): T[] {
  if (!history?.length) {
    return [];
  }
  switch (scope.kind) {
    case "upToIndex":
      return history.slice(0, Math.min(scope.index + 1, history.length));
    case "range":
      return history.slice(
        Math.max(scope.start, 0),
        Math.min(scope.end + 1, history.length),
      );
    case "pickedIndices": {
      const picked = new Set(scope.indices);
      return history.filter((_, i) => picked.has(i));
    }
    case "wholeSession":
    default:
      return history.slice();
  }
}

export interface ShareToolCall {
  name: string;
  args: string;
  status?: string;
  output?: string;
}

export interface ShareEntry {
  kind: "user" | "assistant" | "summary";
  text: string;
  thinking?: string;
  toolCalls: ShareToolCall[];
}

export interface ShareRenderOptions {
  /** 会话标题，仅用于文件头 */
  title?: string;
  exportedAt?: Date;
  /** 是否输出标题/导出时间头部，默认 true */
  includeHeader?: boolean;
  /** 是否输出工具调用行，默认 true */
  includeToolCalls?: boolean;
  /** 是否输出工具返回内容，默认 false（通常很长且对读者无用） */
  includeToolOutput?: boolean;
  /** 是否输出思考过程，默认 false */
  includeThinking?: boolean;
  maxToolArgLength?: number;
  maxToolOutputLength?: number;
}

const DEFAULT_TOOL_ARG_LEN = 300;
const DEFAULT_TOOL_OUTPUT_LEN = 500;
/** AI 总结时喂给模型的会话正文上限（字符），超出则保留尾部 */
const SUMMARY_TRANSCRIPT_LIMIT = 24000;

function labels() {
  const en = getLanguage() === "en";
  return en
    ? {
        doc: "Conversation transcript",
        exported: "Exported",
        count: "messages",
        user: "User",
        assistant: "Friday",
        tool: "Tool",
        summary: "Conversation summary",
        output: "Output",
        omitted: "…(earlier content omitted)…",
        bracket: (s: string) => `[${s}]`,
      }
    : {
        doc: "会话记录",
        exported: "导出时间",
        count: "条消息",
        user: "用户",
        assistant: "Friday",
        tool: "工具",
        summary: "对话摘要",
        output: "输出",
        omitted: "…（前文已省略）…",
        bracket: (s: string) => `【${s}】`,
      };
}

function collapse(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function escapeInline(text: string): string {
  return text.replace(/`/g, "'");
}

/**
 * 去掉可能让 LLM 请求/解析失败的控制字符（NUL、退格、ESC 序列等），
 * 但保留正常换行 / 制表符。终端工具输出常含此类脏字符。
 */
function sanitizeForPrompt(text: string): string {
  let result = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 保留制表符(9)/换行(10)/回车(13)；其余控制字符(0-31, 127)剔除
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      continue;
    }
    result += ch;
  }
  return result;
}

/** 判断是否为 UTF-16 高位代理（避免从代理对中间截断 emoji / 生僻 CJK） */
function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** 从尾部截取 max 个字符，且不会把代理对（emoji 等）拦腰截断 */
function tailSlice(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  let start = text.length - max;
  while (start < text.length && isHighSurrogate(text.charCodeAt(start))) {
    start++;
  }
  return text.slice(start);
}

function safeParseArgs(raw?: string): any {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * 把原始 history 项归一化成「可渲染条目」。
 * 这是过滤规则的唯一出处：system / tool 结果消息、空白 assistant 占位都在此剔除。
 */
export function toShareEntries(
  items: ChatHistoryItem[],
  options: ShareRenderOptions = {},
): ShareEntry[] {
  const {
    includeToolCalls = true,
    includeToolOutput = false,
    includeThinking = false,
    maxToolArgLength = DEFAULT_TOOL_ARG_LEN,
    maxToolOutputLength = DEFAULT_TOOL_OUTPUT_LEN,
  } = options;

  const entries: ShareEntry[] = [];

  for (const item of items) {
    const role = item?.message?.role;
    if (!role || role === "system" || role === "tool") {
      // tool 结果通过 assistant 的 toolCallStates 附着输出，避免重复
      continue;
    }

    const text = stripImages(item.message.content ?? "").trim();

    if (role === "thinking") {
      if (includeThinking && text) {
        entries.push({ kind: "assistant", text, toolCalls: [] });
      }
      continue;
    }

    const toolCalls: ShareToolCall[] = [];
    if (includeToolCalls && item.toolCallStates?.length) {
      for (const state of item.toolCallStates) {
        const name = state.toolCall?.function?.name ?? "unknown";
        const parsed =
          state.parsedArgs ?? safeParseArgs(state.toolCall?.function?.arguments);
        const hasArgs =
          parsed && typeof parsed === "object" && Object.keys(parsed).length > 0;
        toolCalls.push({
          name,
          args: hasArgs ? collapse(JSON.stringify(parsed), maxToolArgLength) : "",
          status: state.status,
          output:
            includeToolOutput && state.output?.length
              ? collapse(
                  state.output.map((o) => o.content ?? "").join("\n"),
                  maxToolOutputLength,
                )
              : undefined,
        });
      }
    }

    const thinking = includeThinking ? item.reasoning?.text?.trim() : undefined;

    if (text || toolCalls.length || thinking) {
      entries.push({
        kind: role === "user" ? "user" : "assistant",
        text,
        thinking: thinking || undefined,
        toolCalls,
      });
    }

    if (item.conversationSummary?.trim()) {
      entries.push({
        kind: "summary",
        text: item.conversationSummary.trim(),
        toolCalls: [],
      });
    }
  }

  return entries;
}

export function toShareMarkdown(
  items: ChatHistoryItem[],
  options: ShareRenderOptions = {},
): string {
  const L = labels();
  const entries = toShareEntries(items, options);
  const lines: string[] = [];

  if (options.includeHeader !== false) {
    lines.push(`# ${L.doc}${options.title ? `: ${options.title}` : ""}`);
    lines.push("");
    lines.push(
      `> ${L.exported}: ${(options.exportedAt ?? new Date()).toLocaleString()} · ${entries.length} ${L.count}`,
    );
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  entries.forEach((entry, idx) => {
    // 复刻页面规则：一轮问话（user 后跟随的连续 assistant）只在开头展示一次头像/名称，
    // 后续 assistant 块归属同一组，不再重复标题。
    const isContinuation =
      entry.kind === "assistant" &&
      idx > 0 &&
      entries[idx - 1].kind === "assistant";

    if (entry.kind === "summary") {
      lines.push(`### 📝 ${L.summary}`, "", entry.text, "", "---", "");
      return;
    }

    if (!isContinuation) {
      lines.push(
        `### ${entry.kind === "user" ? `👤 ${L.user}` : `🤖 ${L.assistant}`}`,
      );
      lines.push("");
    }

    if (entry.thinking) {
      lines.push("<details><summary>thinking</summary>", "", entry.thinking, "", "</details>", "");
    }
    if (entry.text) {
      lines.push(entry.text, "");
    }
    for (const call of entry.toolCalls) {
      lines.push(
        `> 🔧 \`${call.name}\`${call.args ? ` ${escapeInline(call.args)}` : ""}`,
      );
      if (call.output) {
        lines.push(`>`, `> ${L.output}: ${escapeInline(call.output)}`);
      }
      lines.push("");
    }
  });

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*```.*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toSharePlainText(
  items: ChatHistoryItem[],
  options: ShareRenderOptions = {},
): string {
  const L = labels();
  const entries = toShareEntries(items, options);
  const separator = "────────────────────────────";
  const lines: string[] = [];

  if (options.includeHeader !== false) {
    lines.push(`${L.doc}${options.title ? `: ${options.title}` : ""}`);
    lines.push(
      `${L.exported}: ${(options.exportedAt ?? new Date()).toLocaleString()} · ${entries.length} ${L.count}`,
    );
    lines.push(separator);
  }

  entries.forEach((entry, idx) => {
    // 同页面：一轮问话只在开头展示一次「助手」标签，后续连续 assistant 块不再重复。
    const isContinuation =
      entry.kind === "assistant" &&
      idx > 0 &&
      entries[idx - 1].kind === "assistant";

    if (entry.kind === "summary") {
      lines.push(L.bracket(L.summary), stripMarkdown(entry.text), separator);
      return;
    }

    if (!isContinuation) {
      lines.push(L.bracket(entry.kind === "user" ? L.user : L.assistant));
    }
    if (entry.text) {
      lines.push(stripMarkdown(entry.text));
    }
    for (const call of entry.toolCalls) {
      lines.push(
        `${L.bracket(L.tool)} ${call.name}${call.args ? ` ${call.args}` : ""}`,
      );
      if (call.output) {
        lines.push(`  ${L.output}: ${call.output}`);
      }
    }
    lines.push(separator);
  });

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function toShareContent(
  items: ChatHistoryItem[],
  format: ShareFormat,
  options: ShareRenderOptions = {},
): string {
  return format === "markdown"
    ? toShareMarkdown(items, options)
    : toSharePlainText(items, options);
}

export function buildSummaryPrompt(
  items: ChatHistoryItem[],
  options: ShareRenderOptions = {},
): string {
  const L = labels();
  const transcript = toShareMarkdown(items, {
    ...options,
    includeHeader: false,
    includeThinking: false,
  });
  // 清洗控制字符 + 从尾部安全截断（编程会话常见 Python 三引号/终端转义序列，
  // 既会破坏提示词边界，也可能被 provider 直接拒绝）
  const sanitized = sanitizeForPrompt(transcript);
  const clipped =
    sanitized.length > SUMMARY_TRANSCRIPT_LIMIT
      ? `${L.omitted}\n\n${tailSlice(sanitized, SUMMARY_TRANSCRIPT_LIMIT)}`
      : sanitized;

  // 用极不可能在代码中出现的哨兵做分隔，避免 `"""` 之类与转录内容冲突。
  const startMarker = "===== TRANSCRIPT START =====";
  const endMarker = "===== TRANSCRIPT END =====";

  if (getLanguage() === "en") {
    return `You are a senior engineering assistant. Read the AI coding session transcript below and write a concise, hand-off ready summary.

Requirements:
- Output in English, using Markdown.
- Use exactly these five sections; write "None" for empty ones:
  ## Goal
  ## Key decisions
  ## Files and changes
  ## Current status
  ## Next steps / risks
- State only facts present in the transcript. Do not speculate or add advice that was never discussed.
- Keep it under 300 words.

${startMarker}
${clipped}
${endMarker}

Summary:`;
  }

  return `你是一名资深研发助理。请阅读下面的 AI 编程会话记录，输出一份简洁、可直接交接的总结。

要求：
- 用中文输出，使用 Markdown。
- 严格按以下五个小节组织，没有内容的小节写「无」：
  ## 目标
  ## 关键决策
  ## 涉及文件与改动
  ## 当前状态
  ## 待办 / 风险
- 只陈述会话记录里出现过的事实，不要推测，不要补充记录之外的建议。
- 控制在 400 字以内。

${startMarker}
${clipped}
${endMarker}

总结：`;
}
