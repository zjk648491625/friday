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
    if (!originalText.trim()) return;

    // Use dedicated prompt optimize model if set, otherwise fallback to chat model
    const storedTitle = getStoredOptimizeModel();
    const modelTitle = storedTitle || chatModel?.title;
    if (!modelTitle) {
      ideMessenger.post("showToast", ["warning", "请先配置提示词优化模型"]);
      return;
    }

    editorRef.current = editor;
    setIsOptimizing(true);

    try {
      const optimizationPrompt = `You are a prompt optimization assistant. Improve this prompt to be clearer and more effective, preserving its original language and intent. Return ONLY the optimized text with no explanation.

Prompt to optimize: """${originalText}"""

Optimized:`;

      const result = await ideMessenger.request("llm/complete", {
        prompt: optimizationPrompt,
        completionOptions: {
          maxTokens: Math.min(originalText.length * 2 + 200, 4096),
          temperature: 0.3,
        },
        title: modelTitle,
      } as any);

      const text = typeof result === "string" ? result : "";
      if (text.trim()) {
        editorRef.current?.commands.setContent(text.trim());
        ideMessenger.post("showToast", ["info", "提示词优化完成"]);
      } else {
        ideMessenger.post("showToast", ["warning", "优化返回为空，请重试"]);
      }
    } catch (error: any) {
      console.error("Failed to optimize prompt:", error);
      const msg = error?.message || String(error);
      ideMessenger.post("showToast", ["error", msg.length > 100 ? "优化失败：" + msg.slice(0, 100) + "..." : "优化失败：" + msg]);
    } finally {
      setIsOptimizing(false);
    }
  }, [ideMessenger, chatModel]);

  return { optimizePrompt, isOptimizing };
}
