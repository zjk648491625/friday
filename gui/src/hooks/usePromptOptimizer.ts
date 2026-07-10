import { Editor } from "@tiptap/react";
import { useCallback, useContext, useRef, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppSelector } from "../redux/hooks";
import { selectSelectedChatModel } from "../redux/slices/configSlice";

export function usePromptOptimizer() {
  const ideMessenger = useContext(IdeMessengerContext);
  const defaultModel = useAppSelector(selectSelectedChatModel);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const optimizePrompt = useCallback(async (editor: Editor | null) => {
    if (!editor || !defaultModel) return;

    const originalText = editor.getText();
    if (!originalText.trim()) return;

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
        } as any,
        title: defaultModel.title,
      });

      const text = typeof result === "string" ? result : "";
      if (text.trim()) {
        editorRef.current?.commands.setContent(text.trim());
        setIsOptimizing(false);
      } else {
        setIsOptimizing(false);
        ideMessenger.post("showToast", ["warning", "优化返回为空，请重试"]);
      }
    } catch (error: any) {
      console.error("Failed to optimize prompt:", error);
      setIsOptimizing(false);
      const msg = error?.message || String(error);
      ideMessenger.post("showToast", ["error", msg.length > 100 ? "优化失败：" + msg.slice(0, 100) + "..." : "优化失败：" + msg]);
    }
  }, [ideMessenger, defaultModel]);

  return { optimizePrompt, isOptimizing };
}
