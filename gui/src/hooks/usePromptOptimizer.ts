import { Editor } from "@tiptap/react";
import { useCallback, useContext, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppSelector } from "../redux/hooks";
import { selectSelectedChatModel } from "../redux/slices/configSlice";

export function usePromptOptimizer() {
  const ideMessenger = useContext(IdeMessengerContext);
  const defaultModel = useAppSelector(selectSelectedChatModel);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const optimizePrompt = useCallback(async (editor: Editor | null) => {
    if (!editor || !defaultModel) return;

    const originalText = editor.getText();
    if (!originalText.trim()) return;

    setIsOptimizing(true);

    try {
      const prompt = `You are a prompt optimization assistant. Your task is to improve the following prompt to make it clearer, more specific, and more effective while preserving the original intent and language (Chinese or English).

Original prompt:
"""
${originalText}
"""

Return ONLY the optimized prompt text. Do not include any explanations, prefixes, or additional text.
Optimized prompt:`;

      const response = await ideMessenger.request("llm/complete", {
        prompt,
        completionOptions: {
          maxTokens: Math.min(originalText.length * 2 + 200, 4096),
          temperature: 0.3,
        } as any,
        title: defaultModel.title,
      });

      const result = typeof response === "string" ? response : "";
      if (result.trim()) {
        editor.commands.setContent(result.trim());
      }
    } catch (error) {
      console.error("Failed to optimize prompt:", error);
    } finally {
      setIsOptimizing(false);
    }
  }, [ideMessenger, defaultModel]);

  return { optimizePrompt, isOptimizing };
}
