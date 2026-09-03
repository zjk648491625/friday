import { AssistantChatMessage, MessagePart, ToolCallDelta } from "../..";
import { normalizeToMessageParts } from "../../util/messageContent";
import { createDelta, generateOpenAIToolCallId } from "./systemToolUtils";

/*
 * Kimi K2 / Moonshot & some GLM-family models served through OpenAI-compatible
 * proxies occasionally emit their *native* tool-call markup (special tokenizer
 * tokens) directly into the assistant \`content\` text, instead of the requested
 * code-block protocol or proper OpenAI \`tool_calls\`. When that raw text reaches
 * the GUI it is displayed verbatim and the agent turn silently ends, because
 * the code-block parser never sees a tool call.
 *
 * This module provides:
 *  1. parseKimiToolCallSection()  - converts a leaked
 *     "<|tool_calls_section_begin|>...<|tool_calls_section_end|>" block into
 *     real ToolCallDeltas, so the leaked call can be executed like a normal
 *     tool call.
 *  2. sanitizeAssistantText()      - strips leaked control tokens
 *     ("<|...|>", think markers) from assistant text used for display/history,
 *     so past leaks stop being replayed verbatim into the next request.
 *
 * NOTE: all marker handling here intentionally uses plain string search /
 * slicing rather than regexes, because these marker tokens contain characters
 * that are awkward to escape correctly in RegExp literals.
 */

const KIMI_SECTION_BEGIN = "<|tool_calls_section_begin|>";
const KIMI_CALL_BEGIN = "<|tool_call_begin|>";
const KIMI_CALL_END = "<|tool_call_end|>";
const KIMI_ARG_BEGIN = "<|tool_call_argument_begin|>";

/** Stray thinking markers some thinking models leak into visible content. */
const THINK_MARKERS = [
  "<think>",
  "</think>",
  "<thinking>",
  "</thinking>",
  "<|think_start|>",
  "<|think_end|>",
];

export function containsKimiToolSection(text: string): boolean {
  return text.includes(KIMI_SECTION_BEGIN) || text.includes(KIMI_CALL_BEGIN);
}

/**
 * Maps a leaked Kimi tool name back to the Friday tool name.
 * Moonshot/Kimi emits e.g. "functions.read_file:0" or "read_file:0".
 */
export function normalizeKimiToolName(rawName: string): string {
  let name = rawName.trim();
  // Strip trailing ":<index>" (Kimi call index)
  name = name.replace(/:\d+\s*$/, "");
  // Strip ANY vendor/namespace prefix up to the last "." or ":" segment
  // separator (functions.read_file, function.read_file, tools.read_file,
  // namespace.read_file, moonshot:read_file, ...). Friday tool names never
  // contain "." or ":", so keeping the last segment is safe.
  const lastSep = Math.max(name.lastIndexOf("."), name.lastIndexOf(":"));
  if (lastSep !== -1 && lastSep < name.length - 1) {
    name = name.slice(lastSep + 1);
  }
  return name.trim();
}

/**
 * Parses a leaked Kimi native tool-call section into ToolCallDeltas.
 *
 * @param section raw text that begins either with "<|tool_calls_section_begin|>"
 *                or with "<|tool_call_begin|>"
 * @param knownToolNames optional allow-list; when provided, ANY call whose
 *                normalized name is unknown aborts parsing (returns undefined)
 * @returns list of parsed deltas, or undefined when the section is not a valid
 *                parseable Kimi tool section (caller then surfaces it as text)
 */
export function parseKimiToolCallSection(
  section: string,
  knownToolNames?: string[],
): ToolCallDelta[] | undefined {
  if (!containsKimiToolSection(section)) {
    return undefined;
  }

  const deltas: ToolCallDelta[] = [];
  let pos = 0;

  while (true) {
    const callStart = section.indexOf(KIMI_CALL_BEGIN, pos);
    if (callStart === -1) {
      break;
    }
    const argStart = section.indexOf(
      KIMI_ARG_BEGIN,
      callStart + KIMI_CALL_BEGIN.length,
    );
    if (argStart === -1) {
      return undefined;
    }
    const callEnd = section.indexOf(
      KIMI_CALL_END,
      argStart + KIMI_ARG_BEGIN.length,
    );
    if (callEnd === -1) {
      return undefined;
    }

    const rawName = section
      .slice(callStart + KIMI_CALL_BEGIN.length, argStart)
      .trim();
    const argsText = section
      .slice(argStart + KIMI_ARG_BEGIN.length, callEnd)
      .trim();

    const name = normalizeKimiToolName(rawName);
    if (!name) {
      return undefined;
    }
    if (knownToolNames?.length && !knownToolNames.includes(name)) {
      // Do not silently discard: abort so the caller surfaces the raw text.
      return undefined;
    }

    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(argsText);
    } catch {
      return undefined;
    }
    if (parsedArgs === undefined || parsedArgs === null) {
      return undefined;
    }

    // Canonicalize the JSON so the argument string is always valid JSON
    // (the model may have emitted non-standard quoting/whitespace).
    deltas.push(
      createDelta(name, JSON.stringify(parsedArgs), generateOpenAIToolCallId()),
    );

    pos = callEnd + KIMI_CALL_END.length;
  }

  return deltas.length > 0 ? deltas : undefined;
}

/** Removes every occurrence of [begin...end] (inclusive) from text.
 *  Only strips when the closing marker is actually present: an unterminated
 *  marker (network cut / token-cap truncation) leaves the original text in
 *  place so no user-visible content is swallowed. */
function stripBetween(text: string, begin: string, end: string): string {
  let out = text;
  let startIdx = out.indexOf(begin);
  while (startIdx !== -1) {
    const endIdx = out.indexOf(end, startIdx + begin.length);
    if (endIdx === -1) {
      // No closing marker yet: stop and keep the remaining text as-is.
      break;
    }
    out = out.slice(0, startIdx) + out.slice(endIdx + end.length);
    startIdx = out.indexOf(begin);
  }
  return out;
}

/** Removes stray "<|...|>" control tokens (no inner-text preservation). */
function removeControlTokens(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<" && text[i + 1] === "|") {
      const close = text.indexOf("|>", i + 2);
      if (close !== -1) {
        i = close + 2;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function cleanWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strips leaked Kimi native tool-call markup and thinking markers from
 * assistant text. Used both for on-screen fallback text and for history
 * replay so leaks do not keep reinforcing model drift.
 */
export function sanitizeAssistantText(text: string): string {
  if (!text.includes("<|") && !text.includes("</think") && !text.includes("<think")) {
    return text;
  }
  let cleaned = text;
  cleaned = stripBetween(cleaned, KIMI_SECTION_BEGIN, "<|tool_calls_section_end|>");
  cleaned = stripBetween(cleaned, KIMI_CALL_BEGIN, KIMI_CALL_END);
  cleaned = removeControlTokens(cleaned);
  for (const marker of THINK_MARKERS) {
    cleaned = cleaned.split(marker).join("");
  }
  return cleanWhitespace(cleaned);
}

function sanitizeContentPart(part: MessagePart): MessagePart {
  if (part.type === "text") {
    return { ...part, text: sanitizeAssistantText(part.text) };
  }
  return part;
}

/**
 * Returns a copy of the assistant message whose text content has been cleaned
 * of leaked Kimi/think control tokens. Used when replaying history into a new
 * request so past leaks do not reinforce model drift.
 */
export function sanitizeAssistantMessage(
  message: AssistantChatMessage,
): AssistantChatMessage {
  if (typeof message.content === "string") {
    return { ...message, content: sanitizeAssistantText(message.content) };
  }
  return {
    ...message,
    content: normalizeToMessageParts(message).map(sanitizeContentPart),
  };
}