import { Editor } from "@tiptap/react";
import { useCallback, useContext, useRef, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppSelector } from "../redux/hooks";
import { selectSelectedChatModel } from "../redux/slices/configSlice";

const PROMPT_OPTIMIZE_MODEL_KEY = "friday-prompt-optimize-model";

function getStoredOptimizeModel(): string | null {
  try {
    return localStorage.getItem(PROMPT_OPTIMIZE_MODEL_KEY);
  } catch {
    return null;
  }
}

export function getPromptOptimizeModel(): string | null {
  return getStoredOptimizeModel();
}

export function setPromptOptimizeModel(title: string | null) {
  try {
    if (title) {
      localStorage.setItem(PROMPT_OPTIMIZE_MODEL_KEY, title);
    } else {
      localStorage.removeItem(PROMPT_OPTIMIZE_MODEL_KEY);
    }
    window.dispatchEvent(new Event("promptOptimizeModelChanged"));
  } catch {}
}

export function usePromptOptimizer() {
  const ideMessenger = useContext(IdeMessengerContext);
  const chatModel = useAppSelector(selectSelectedChatModel);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const optimizePrompt = useCallback(async (editor: Editor | null) => {
    if (!editor) return;

    const originalText = editor.getText();
    if (!originalText.trim()) {
      console.log("[OPTIMIZE] empty text, skip");
      return;
    }

    // Use dedicated prompt optimize model if set, otherwise fallback to chat model
    const storedTitle = getStoredOptimizeModel();
    const modelTitle = storedTitle || chatModel?.title;
    console.log("[OPTIMIZE] storedTitle:", storedTitle, "chatTitle:", chatModel?.title, "final:", modelTitle);
    if (!modelTitle) {
      ideMessenger.post("showToast", ["warning", "请先配置提示词优化模型"]);
      return;
    }

    editorRef.current = editor;
    setIsOptimizing(true);

    try {
      const optimizationPrompt = `You are a prompt refinement expert. Think carefully about the user's input and rewrite it into a clearer, more effective prompt that an AI can immediately understand and act on.

Guidelines:
- Preserve ALL original requirements, constraints, and intent — do not drop or add anything.
- If the original is vague or rambling, tighten it up. If it's already terse, expand with necessary precision.
- Choose the form that works best: concise and direct, or structured and detailed — use your judgment.
- Remove noise: filler words, tangents, polite fluff. Keep substance.
- Maintain the original language.
- Return ONLY the refined prompt, no explanation.

User input:
"""${originalText}"""

Refined:`;

      console.log("[OPTIMIZE] sending llm/complete request, model:", modelTitle, "prompt len:", optimizationPrompt.length);
      const result = await ideMessenger.request("llm/complete", {
        prompt: optimizationPrompt,
        completionOptions: {
          maxTokens: Math.min(originalText.length * 2 + 200, 4096),
          temperature: 0.3,
        },
        title: modelTitle,
      } as any);
      // ideMessenger wraps core responses as { done, content }, but protocol type is string|ErrorWebviewMessage
      // Use bracket notation + Record cast to avoid TS2339 on dynamic properties
      let text = "";
      if (typeof result === "string") {
        text = result;
      } else if (result && typeof result === "object") {
        const obj = result as Record<string, any>;
        text = obj["content"] || obj["completion"] || obj["text"] || obj["response"] || "";
      }
      if (text.trim()) {
        editorRef.current?.commands.setContent(text.trim());
      } else {
        console.log("[OPTIMIZE] empty result, typeof:", typeof result, "value:", result);
        ideMessenger.post("showToast", ["warning", "优化返回为空，请重试"]);
      }
    } catch (error: any) {
      console.error("[OPTIMIZE] caught error:", error?.message || error);
      const msg = error?.message || String(error);
      ideMessenger.post("showToast", ["error", msg.length > 100 ? "优化失败：" + msg.slice(0, 100) + "..." : "优化失败：" + msg]);
    } finally {
      setIsOptimizing(false);
    }
  }, [ideMessenger, chatModel]);

  return { optimizePrompt, isOptimizing };
}
