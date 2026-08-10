import { useCallback, useContext, useMemo, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppSelector } from "../redux/hooks";
import { selectSelectedChatModel } from "../redux/slices/configSlice";
import { isJetBrains } from "../util";
import { T } from "../util/i18n";
import {
  buildSummaryPrompt,
  selectShareItems,
  toShareMarkdown,
  toSharePlainText,
  type ShareScope,
} from "../util/shareSession";

export type ShareAction = "markdown" | "plaintext" | "summary";

/** 递归在响应对象里找第一个非空字符串，作为兜底的取值方式 */
function findStringValue(obj: any, depth = 0): string {
  if (depth > 4 || obj == null || typeof obj !== "object") {
    return "";
  }
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) {
      return v;
    }
    if (typeof v === "object") {
      const found = findStringValue(v, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return "";
}

/**
 * 会话分享。范围由调用方通过 ShareScope 决定，本 hook 不关心范围怎么来的，
 * 后续增加「选择历史会话」只需传入不同的 scope。
 */
export function useShareSession() {
  const ideMessenger = useContext(IdeMessengerContext);
  const history = useAppSelector((state) => state.session.history);
  const title = useAppSelector((state) => state.session.title);
  const chatModel = useAppSelector(selectSelectedChatModel);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const copyText = useCallback(
    (text: string) => {
      if (isJetBrains()) {
        ideMessenger.post("copyText", { text });
      } else {
        void navigator.clipboard.writeText(text);
      }
    },
    [ideMessenger],
  );

  const toast = useCallback(
    (type: "info" | "warning" | "error", message: string) => {
      ideMessenger.post("showToast", [type, message]);
    },
    [ideMessenger],
  );

  const countItems = useCallback(
    (scope: ShareScope) => selectShareItems(history, scope).length,
    [history],
  );

  const share = useCallback(
    async (action: ShareAction, scope: ShareScope) => {
      const items = selectShareItems(history, scope);
      if (!items.length) {
        toast("warning", T("No content to share"));
        return;
      }

      const renderOptions = { title, exportedAt: new Date() };

      if (action === "markdown" || action === "plaintext") {
        const content =
          action === "markdown"
            ? toShareMarkdown(items, renderOptions)
            : toSharePlainText(items, renderOptions);
        copyText(content);
        toast("info", T("Copied to clipboard"));
        return;
      }

      const modelTitle = chatModel?.title;
      if (!modelTitle) {
        toast("warning", T("Configure a chat model first"));
        return;
      }

      // 提示词构建单独包一层，区分「构建失败」与「模型调用失败」两种不同根因
      let prompt: string;
      try {
        prompt = buildSummaryPrompt(items, renderOptions);
      } catch (e: any) {
        const m = e?.message || String(e);
        console.error("[shareSession] summary prompt build failed:", e);
        toast("error", `总结提示词生成失败: ${m.slice(0, 160)}`);
        return;
      }

      setIsSummarizing(true);
      try {
        // deepseek-v4-flash 等模型在 llm/complete 上会间歇性返回空（core.log: "result length: 0"），
        // 与内容无关。对空响应 / 抛错做有限重试即可稳定成功。
        const MAX_ATTEMPTS = 3;
        let text = "";
        let lastRaw: any = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const result = await ideMessenger.request("llm/complete", {
              prompt,
              completionOptions: { maxTokens: 1024, temperature: 0.2 },
              title: modelTitle,
            } as any);
            lastRaw = result;

            // ideMessenger 会把 core 的响应包成 { done, content }，协议类型却是 string，
            // 这里按 usePromptOptimizer 的方式做兼容取值，并加递归兜底
            if (typeof result === "string") {
              text = result;
            } else if (result && typeof result === "object") {
              const obj = result as Record<string, any>;
              text =
                obj["content"] ||
                obj["completion"] ||
                obj["text"] ||
                obj["response"] ||
                findStringValue(obj) ||
                "";
            }

            if (text.trim()) break;
            console.warn(
              `[shareSession] AI summary empty (attempt ${attempt}/${MAX_ATTEMPTS}), retrying...`,
            );
          } catch (error: any) {
            console.error(
              `[shareSession] AI summary request failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
              error,
            );
            lastRaw = error;
          }
        }

        if (!text.trim()) {
          // 重试后仍为空：打日志便于确认是模型拒绝 / 超时 / 返回结构未覆盖
          console.error(
            "[shareSession] AI summary still empty after retries. model=",
            modelTitle,
            "lastRaw=",
            lastRaw,
          );
          toast("warning", T("Failed to generate summary"));
          return;
        }
        copyText(text.trim());
        toast("info", T("Summary copied to clipboard"));
      } catch (error: any) {
        const message = error?.message || String(error);
        // 便于在开发者工具里定位失败原因（provider 报错 / 超时）
        console.error("[shareSession] AI summary failed:", error);
        toast(
          "error",
          `${T("Failed to generate summary")}: ${message.slice(0, 200)}`,
        );
      } finally {
        setIsSummarizing(false);
      }
    },
    [history, title, chatModel, ideMessenger, copyText, toast],
  );

  return useMemo(
    () => ({ share, isSummarizing, countItems }),
    [share, isSummarizing, countItems],
  );
}
