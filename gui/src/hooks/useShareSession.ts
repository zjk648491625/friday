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

      setIsSummarizing(true);
      try {
        const result = await ideMessenger.request("llm/complete", {
          prompt: buildSummaryPrompt(items, renderOptions),
          completionOptions: { maxTokens: 1024, temperature: 0.2 },
          title: modelTitle,
        } as any);

        // ideMessenger 会把 core 的响应包成 { done, content }，协议类型却是 string，
        // 这里按 usePromptOptimizer 的方式做兼容取值
        let text = "";
        if (typeof result === "string") {
          text = result;
        } else if (result && typeof result === "object") {
          const obj = result as Record<string, any>;
          text =
            obj["content"] ||
            obj["completion"] ||
            obj["text"] ||
            obj["response"] ||
            "";
        }

        if (!text.trim()) {
          toast("warning", T("Failed to generate summary"));
          return;
        }
        copyText(text.trim());
        toast("info", T("Summary copied to clipboard"));
      } catch (error: any) {
        const message = error?.message || String(error);
        toast(
          "error",
          `${T("Failed to generate summary")}: ${message.slice(0, 120)}`,
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
