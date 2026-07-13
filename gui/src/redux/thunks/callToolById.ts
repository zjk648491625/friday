import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ContextItem, McpUiState } from "core";
import { CLIENT_TOOLS_IMPLS } from "core/tools/builtIn";
import { FridayError, FridayErrorReason } from "core/util/errors";

import { callClientTool } from "../../util/clientTools/callClientTool";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  acceptToolCall,
  errorToolCall,
  setInactive,
  setToolCallCalling,
  updateToolCallOutput,
  updateToolCallProgress,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { findToolCallById, logToolUsage } from "../util";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export const callToolById = createAsyncThunk<
  void,
  { toolCallId: string; isAutoApproved?: boolean; depth?: number },
  ThunkApiType
>("chat/callTool", async (inputs, { dispatch, extra, getState, signal }) => {
  const { toolCallId, isAutoApproved, depth = 0 } = inputs;

  const state = getState();
  const toolCallState = findToolCallById(state.session.history, toolCallId);
  if (!toolCallState) {
    console.warn(`Tool call with ID ${toolCallId} not found`);
    return;
  }

  if (toolCallState.status !== "generated") {
    return;
  }

  const selectedChatModel = selectSelectedChatModel(state);

  if (!selectedChatModel) {
    throw new Error("No model selected");
  }

  dispatch(
    setToolCallCalling({
      toolCallId,
    }),
  );

  const toolName = toolCallState.toolCall.function.name;
  let output: ContextItem[] | undefined = undefined;
  let mcpUiState: McpUiState | undefined = undefined;
  let error: FridayError | undefined = undefined;
  let streamResponse: boolean;

  // Progress message
  const sendProgress = (msg: string) => {
    dispatch(updateToolCallProgress({ toolCallId, progressMessage: msg }));
  };

  // Execute tool call with retry (only retry on IPC/network errors, not tool business errors)
  const executeToolCall = async (): Promise<{
    output?: ContextItem[];
    mcpUiState?: McpUiState;
    error?: FridayError;
    streamResponse: boolean;
  }> => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Check abort signal before each attempt
      if (signal.aborted) {
        throw new Error("Tool call aborted by user");
      }

      try {
        if (attempt > 0) {
          sendProgress(`重试 ${toolName} (${attempt}/${MAX_RETRIES})...`);
          await new Promise((r, reject) => {
            const timeout = setTimeout(r, RETRY_DELAY_MS * attempt);
            const onAbort = () => { clearTimeout(timeout); reject(new Error("Aborted")); };
            signal.addEventListener("abort", onAbort, { once: true });
          });
        } else {
          sendProgress(`执行: ${toolName}`);
        }

        if (CLIENT_TOOLS_IMPLS.find((t) => t === toolName)) {
          const result = await callClientTool(toolCallState, {
            dispatch,
            ideMessenger: extra.ideMessenger,
            getState,
          });
          // Client tool business errors are NOT retried
          sendProgress(result.error ? `${toolName} 失败` : `${toolName} 完成`);
          return {
            output: result.output,
            mcpUiState: undefined,
            error: result.error,
            streamResponse: result.respondImmediately,
          };
        } else {
          const result = await extra.ideMessenger.request("tools/call", {
            toolCall: toolCallState.toolCall,
          });
          // Only retry on IPC-level errors (core process crash, timeout)
          if (result.status === "error") {
            lastError = new Error(result.error);
            if (attempt < MAX_RETRIES) continue;
            throw lastError;
          }
          // Tool business errors (invalid args, etc) are NOT retried
          const hasError = !!result.content.errorMessage;
          sendProgress(hasError ? `${toolName} 失败` : `${toolName} 完成`);
          return {
            output: result.content.contextItems,
            mcpUiState: result.content.mcpUiState,
            error: hasError
              ? new FridayError(
                  result.content.errorReason || FridayErrorReason.Unspecified,
                  result.content.errorMessage!,
                )
              : undefined,
            streamResponse: true,
          };
        }
      } catch (e: any) {
        if (e.message === "Aborted") throw e;
        lastError = e;
        if (attempt < MAX_RETRIES) {
          console.warn(`Tool ${toolName} failed (attempt ${attempt + 1}): ${e.message}, retrying...`);
          continue;
        }
      }
    }
    // All retries exhausted
    throw lastError || new Error(`Tool ${toolName} failed after ${MAX_RETRIES} retries`);
  };

  // IMPORTANT:
  // Errors that occur while calling tool call implementations
  // Are caught and passed in output as context items
  try {
    const result = await executeToolCall();
    output = result.output;
    mcpUiState = result.mcpUiState;
    error = result.error;
    streamResponse = result.streamResponse;
  } catch (e: any) {
    error = new FridayError(
      FridayErrorReason.Unspecified,
      `${toolName} 执行失败 (已重试${MAX_RETRIES}次): ${e.message}`,
    );
    streamResponse = true;
    sendProgress(`${toolName} 失败`);
  }

  if (error) {
    dispatch(
      updateToolCallOutput({
        toolCallId,
        contextItems: [
          {
            icon: "problems",
            name: "Tool Call Error",
            description: "Tool Call Failed",
            content: `${toolCallState.toolCall.function.name} failed with the message: ${error.message}\n\nPlease try something else or request further instructions.`,
            hidden: false,
          },
        ],
      }),
    );
  } else if (output?.length) {
    dispatch(
      updateToolCallOutput({
        toolCallId,
        contextItems: output,
        mcpUiState,
      }),
    );
  }

  if (streamResponse) {
    if (error) {
      logToolUsage(toolCallState, false, false, extra.ideMessenger, output);
      dispatch(
        errorToolCall({
          toolCallId,
        }),
      );
    } else {
      logToolUsage(toolCallState, true, true, extra.ideMessenger, output);
      dispatch(
        acceptToolCall({
          toolCallId,
        }),
      );
    }

    // Send to the LLM to friday the conversation
    const wrapped = await dispatch(
      streamResponseAfterToolCall({
        toolCallId,
        depth: depth + 1,
      }),
    );
    unwrapResult(wrapped);
  } else {
    dispatch(setInactive());
  }
});
