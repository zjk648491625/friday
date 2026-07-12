import { ChatHistoryItem, ILLM, ToolResultChatMessage } from "..";
import { HistoryManager } from "./history";
import { stripImages } from "./messageContent";

export interface CompactionParams {
  sessionId: string;
  index: number;
  historyManager: HistoryManager;
  currentModel: ILLM;
}

/**
 * Compacts conversation history up to a specified index by generating a summary.
 * This helper function extracts the compaction logic from the main core handler.
 *
 * @param params - Object containing sessionId, index, historyManager, and currentModel
 * @returns Promise<void> - Updates the session with the conversation summary
 */
export async function compactConversation({
  sessionId,
  index,
  historyManager,
  currentModel,
}: CompactionParams): Promise<void> {
  // Get the current session
  const session = historyManager.load(sessionId);
  const historyUpToIndex = session.history.slice(0, index + 1);

  // Apply the same filtering logic as in constructMessages, but exclude the target message
  // if it already has a summary (we're re-compacting)
  let summaryContent = "";
  let filteredHistory = historyUpToIndex;

  // First, check if the target message already has a summary and ignore it
  const targetMessageHasSummary = historyUpToIndex[index].conversationSummary;
  const searchHistory = targetMessageHasSummary
    ? historyUpToIndex.slice(0, index)
    : historyUpToIndex;

  // Find the most recent conversation summary (excluding target if it has one)
  for (let i = searchHistory.length - 1; i >= 0; i--) {
    const summary = searchHistory[i].conversationSummary;
    if (summary) {
      summaryContent = summary;
      // Only include messages that come AFTER the message with the summary
      filteredHistory = historyUpToIndex.slice(i + 1);
      break;
    }
  }

  const messages: ChatHistoryItem["message"][] = [];

  // add cancelled chat messages explicitly for cancelled tool calls
  filteredHistory.forEach((item) => {
    messages.push(item.message);
    // toolcalls only exist in an assistant message
    if (item.message.role === "assistant" && item.message.toolCalls) {
      // for every toolcall, if there is no tool message with a tool call id already, add a chat message saying that it is empty
      item.message.toolCalls.forEach((toolCall) => {
        if (
          !filteredHistory.find(
            (item) =>
              item.message.role === "tool" &&
              item.message.toolCallId === toolCall.id,
          )
        ) {
          messages.push({
            role: "tool",
            content: "Tool cancelled",
            toolCallId: toolCall.id,
          } as ToolResultChatMessage);
        }
      });
    }
  });

  // If there's a previous summary, include it as a user message at the beginning
  if (summaryContent) {
    messages.unshift({
      role: "user",
      content: `Previous conversation summary:\n\n${summaryContent}`,
    });
  }

  const compactionPrompt = {
    role: "user" as const,
    content:
      "Summarize this conversation, preserving all technical details needed to continue work. Include: (1) file paths modified, code patterns used, and key changes made; (2) problems encountered and solutions applied; (3) incomplete tasks and next steps. If there's a previous summary, integrate its relevant information while removing outdated details. Use specific identifiers (file paths, function names, etc.) and write in third person.",
  };

  // Generate the summary using the current model
  const response = await currentModel.chat(
    [...messages, compactionPrompt],
    new AbortController().signal,
    {},
  );

  // Update the target message with the conversation summary
  const updatedHistory = [...session.history];
  updatedHistory[index] = {
    ...updatedHistory[index],
    conversationSummary: stripImages(response.content),
  };

  // Update the session with the new history
  const updatedSession = {
    ...session,
    history: updatedHistory,
  };

  historyManager.save(updatedSession);
}
