import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ChatMessage, LLMFullCompletionOptions, ModelDescription, PromptLog } from "core";
import { getRuleId } from "core/llm/rules/getSystemMessageWithRules";
import { ToCoreProtocol } from "core/protocol";
import { BUILT_IN_GROUP_NAME } from "core/tools/builtIn";
import { selectActiveTools } from "../selectors/selectActiveTools";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  abortStream,
  addPromptCompletionPair,
  errorToolCall,
  setActive,
  setAppliedRulesAtIndex,
  setContextPercentage,
  setInactive,
  setInlineErrorMessage,
  setIsPruned,
  setTaskStatus,
  setToolGenerated,
  streamUpdate,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { constructMessages } from "../util/constructMessages";

import { modelSupportsNativeTools } from "core/llm/toolSupport";
import { applyToolOverrides } from "core/tools/applyToolOverrides";
import { addSystemMessageToolsToSystemMessage } from "core/tools/systemMessageTools/buildToolsSystemMessage";
import { interceptSystemToolCalls } from "core/tools/systemMessageTools/interceptSystemToolCalls";
import { SystemMessageToolCodeblocksFramework } from "core/tools/systemMessageTools/toolCodeblocks";

import {
  selectCurrentToolCalls,
  selectPendingToolCalls,
} from "../selectors/selectToolCalls";
import { getBaseSystemMessage } from "../util/getBaseSystemMessage";
import { getEnvironmentSection } from "../util/environmentInfo";
import { callToolById } from "./callToolById";
import { evaluateToolPolicies } from "./evaluateToolPolicies";
import { preprocessToolCalls } from "./preprocessToolCallArgs";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";

/**
 * Builds completion options with reasoning configuration based on session state and model capabilities.
 *
 * @param baseOptions - Base completion options to extend
 * @param hasReasoningEnabled - Whether reasoning is enabled in the session
 * @param model - The selected model with provider and completion options
 * @returns Completion options with reasoning configuration
 */

/**
 * Stream-output classification helpers for the auto-retry logic.
 *
 * A stream is only considered "complete" when it produced an ANSWER
 * (assistant text content or a tool call). Reasoning ("thinking") is a
 * preliminary phase, not an answer: a response that ends after thinking alone
 * is interrupted and must be retried / warned about, not silently accepted.
 */
function isThinkingMessage(m: ChatMessage): boolean {
  return m.role === "thinking";
}

// An "answer" is user-visible assistant content or a tool call. Reasoning
// ("thinking") alone is NOT an answer: a stream that ends after only producing
// reasoning is an interrupted/incomplete response. It must be retried, not
// silently accepted — previously thinking counted as output, so a stream that
// died mid-thinking neither retried nor warned, producing the "no reaction"
// symptom with no error.
function hasAnswerOutput(m: ChatMessage): boolean {
  if (m.role !== "assistant") return false;
  if (m.toolCalls?.length) return true;
  if (Array.isArray(m.content)) {
    return m.content.some(
      (part) => part.type === "text" && !!part.text.trim(),
    );
  }
  return !!String(m.content ?? "").trim();
}

function buildReasoningCompletionOptions(
  baseOptions: LLMFullCompletionOptions,
  hasReasoningEnabled: boolean | undefined,
  model: ModelDescription,
): LLMFullCompletionOptions {
  if (hasReasoningEnabled === undefined) {
    return baseOptions;
  }

  const reasoningOptions: LLMFullCompletionOptions = {
    ...baseOptions,
    reasoning: !!hasReasoningEnabled,
  };

  // Add reasoning budget tokens if reasoning is enabled and provider supports it
  if (hasReasoningEnabled && model.underlyingProviderName !== "ollama") {
    // Ollama doesn't support limiting reasoning tokens at this point
    reasoningOptions.reasoningBudgetTokens =
      model.completionOptions?.reasoningBudgetTokens ?? 2048;
  }

  return reasoningOptions;
}

export const streamNormalInput = createAsyncThunk<
  void,
  {
    legacySlashCommandData?: ToCoreProtocol["llm/streamChat"][0]["legacySlashCommandData"];
    depth?: number;
  },
  ThunkApiType
>(
  "chat/streamNormalInput",
  async (
    { legacySlashCommandData, depth = 0 },
    { dispatch, extra, getState },
  ) => {
    if (process.env.NODE_ENV === "test" && depth > 50) {
      const message = `Max stream depth of ${50} reached in test`;
      console.error(message, JSON.stringify(getState(), null, 2));
      throw new Error(message);
    }
    const state = getState();
    const selectedChatModel = selectSelectedChatModel(state);

    if (!selectedChatModel) {
      throw new Error("No chat model selected");
    }

    // Get tools and apply model-level overrides (disabled, description, etc.)
    let activeTools = selectActiveTools(state);
    if (selectedChatModel.toolOverrides?.length) {
      const { tools: overriddenTools, errors } = applyToolOverrides(
        activeTools,
        selectedChatModel.toolOverrides,
      );
      activeTools = overriddenTools;
      for (const error of errors) {
        if (!error.fatal) {
          console.warn(`Tool override warning: ${error.message}`);
        }
      }
    }

    // Use the centralized selector to determine if system message tools should be used
    const useNativeTools = state.config.config.experimental
      ?.onlyUseSystemMessageTools
      ? false
      : modelSupportsNativeTools(selectedChatModel);
    const systemToolsFramework = !useNativeTools
      ? new SystemMessageToolCodeblocksFramework()
      : undefined;

    // Construct completion options
    let completionOptions: LLMFullCompletionOptions = {};
    if (useNativeTools && activeTools.length > 0) {
      completionOptions = {
        tools: activeTools,
      };
    }

    completionOptions = buildReasoningCompletionOptions(
      completionOptions,
      state.session.hasReasoningEnabled,
      selectedChatModel,
    );

    // Construct messages (excluding system message)
    let baseSystemMessage = getBaseSystemMessage(
      state.session.mode,
      selectedChatModel,
      activeTools,
    );

    // Append real machine/environment info (OS, shell, IDE, mode) so the
    // model makes correct assumptions about paths and command syntax.
    // Fetched once and cached; failure never blocks the chat.
    try {
      const envSection = await getEnvironmentSection(
        extra.ideMessenger,
        state.session.mode,
      );
      if (envSection) {
        baseSystemMessage += "\n\n" + envSection;
      }
    } catch (e) {
      console.warn("Failed to append environment info:", e);
    }

    const systemMessage = systemToolsFramework
      ? addSystemMessageToolsToSystemMessage(
          systemToolsFramework,
          baseSystemMessage,
          activeTools,
        )
      : baseSystemMessage;

    const withoutMessageIds = state.session.history.map((item) => {
      const { id, ...messageWithoutId } = item.message;
      return { ...item, message: messageWithoutId };
    });

    const { messages, appliedRules, appliedRuleIndex } = constructMessages(
      withoutMessageIds,
      systemMessage,
      state.config.config.rules,
      state.ui.ruleSettings,
      systemToolsFramework,
    );

    // TODO parallel tool calls will cause issues with this
    // because there will be multiple tool messages, so which one should have applied rules?
    dispatch(
      setAppliedRulesAtIndex({
        index: appliedRuleIndex,
        appliedRules: appliedRules,
      }),
    );

    dispatch(setActive());
    dispatch(setInlineErrorMessage(undefined));
    // Step prefix preserved throughout streaming: "第1轮" / "第2轮" ...
    const stepPrefix = depth === 0 ? "" : `🔄 第${depth + 1}轮 `;
    dispatch(setTaskStatus(depth === 0 ? "🤖 AI 思考中..." : `${stepPrefix}调用工具中...`));

    const precompiledRes = await extra.ideMessenger.request("llm/compileChat", {
      messages,
      options: completionOptions,
    });

    if (precompiledRes.status === "error") {
      if (precompiledRes.error.includes("Not enough context")) {
        dispatch(setInlineErrorMessage("out-of-context"));
        dispatch(setInactive());
        return;
      } else {
        throw new Error(precompiledRes.error);
      }
    }

    const { compiledChatMessages, didPrune, contextPercentage } =
      precompiledRes.content;

    dispatch(setIsPruned(didPrune));
    dispatch(setContextPercentage(contextPercentage));

    const start = Date.now();
    const streamAborter = state.session.streamAborter;

    // Auto-retry on stream error or fully-empty response.
    // Configured via config.json: experimental.maxAutoRetries (default 2, 0 disables).
    // Never retries after a user abort. If partial output already streamed
    // before the error, we do NOT retry to avoid duplicated transcript content.
    const maxAutoRetries = Math.max(
      0,
      state.config.config.experimental?.maxAutoRetries ?? 2,
    );

    let sawAnyAnswer = false;
    let sawAnyThinking = false;
    let attempt = 0;
    let completedPromptLog: PromptLog | undefined = undefined;

    while (true) {
      attempt++;
      let heartbeatTick = 0;
      let sawAnswerThisAttempt = false;
      let sawThinkingThisAttempt = false;
      let pendingNext: Promise<any> | null = null;

      let gen = extra.ideMessenger.llmStreamChat(
        {
          completionOptions,
          title: selectedChatModel.title,
          messages: compiledChatMessages,
          legacySlashCommandData,
          messageOptions: { precompiled: true },
        },
        streamAborter.signal,
      );
      if (systemToolsFramework && activeTools.length > 0) {
        gen = interceptSystemToolCalls(
          gen,
          streamAborter,
          systemToolsFramework,
          activeTools.map((tool) => tool.function.name),
        );
      }

      // Helper: race gen.next() against heartbeat timeout.
      // IMPORTANT: keep a reference to the in-flight next() promise and reuse
      // it across heartbeats. Issuing a fresh gen.next() after every heartbeat
      // queues an extra request on the async generator; queued requests consume
      // stream chunks FIFO, so every heartbeat that fires before a chunk
      // arrives silently DROPPED that chunk. That is what used to eat the
      // beginning of responses (first-token latency > 600ms), random middle
      // chunks during thinking pauses, and entire non-streamed responses
      // (the "empty response" bug).
      const genNextWithHeartbeat = async (gen: any) => {
        while (true) {
          if (!pendingNext) {
            pendingNext = gen.next();
          }
          // Non-null by construction; TS cannot narrow a closure-captured let
          const activeNext = pendingNext as Promise<any>;
          const race: { type: string; value?: any } = await Promise.race([
            activeNext.then((r: any) => ({ type: "done", value: r })),
            new Promise<{ type: string }>((resolve) =>
              setTimeout(() => resolve({ type: "hb" }), 600),
            ),
          ]);
          if (race.type === "hb") {
            if (!getState().session.isStreaming) {
              return { done: true, value: undefined };
            }
            heartbeatTick++;
            const dots = ".".repeat((heartbeatTick % 3) + 1);
            dispatch(setTaskStatus(`${stepPrefix}💭 思考中${dots}`));
            continue;
          }
          pendingNext = null;
          return race.value;
        }
      };

      try {
        let next = await genNextWithHeartbeat(gen);
        while (!next.done) {
          if (!getState().session.isStreaming) {
            dispatch(abortStream());
            break;
          }

          const msgs = next.value as ChatMessage[];
          if (msgs.some(hasAnswerOutput)) {
            sawAnswerThisAttempt = true;
          }
          if (msgs.some(isThinkingMessage)) {
            sawThinkingThisAttempt = true;
          }
          dispatch(streamUpdate(msgs));

          next = await genNextWithHeartbeat(gen);
        }

        if (next.done && next.value) {
          completedPromptLog = next.value as PromptLog;
        }
        sawAnyAnswer = sawAnyAnswer || sawAnswerThisAttempt;
        sawAnyThinking = sawAnyThinking || sawThinkingThisAttempt;

        // Empty-response retry: nothing visible produced this attempt and
        // nothing earlier either. User aborts never retry.
        const abortedAfterStream =
          streamAborter.signal.aborted || !getState().session.isStreaming;
        if (
          !sawAnyAnswer &&
          !abortedAfterStream &&
          attempt <= maxAutoRetries
        ) {
          const kind = sawAnyThinking ? "thinking-only" : "empty";
          const label = sawAnyThinking ? "思考后无回答" : "空响应";
          console.warn(
            `[stream] ${kind} response, auto-retry ${attempt}/${maxAutoRetries}`,
          );
          dispatch(setTaskStatus(`${stepPrefix}⚠️ ${label}，自动重试 ${attempt}/${maxAutoRetries}...`));
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        break;
      } catch (e) {
        const toolCallsToCancel = selectCurrentToolCalls(getState());
        if (
          toolCallsToCancel.length > 0 &&
          e instanceof Error &&
          e.message.toLowerCase().includes("premature close")
        ) {
          for (const tc of toolCallsToCancel) {
            dispatch(
              errorToolCall({
                toolCallId: tc.toolCallId,
                output: [
                  {
                    name: "Tool Call Error",
                    description: "Premature Close",
                    content: `"Premature Close" error: this tool call was aborted mid-stream because the arguments took too long to stream or there were network issues. Please re-attempt by breaking the operation into smaller chunks or trying something else`,
                    icon: "problems",
                  },
                ],
              }),
            );
          }
          break;
        }

        const abortedOnError =
          streamAborter.signal.aborted || !getState().session.isStreaming;
        if (
          !sawAnswerThisAttempt &&
          !abortedOnError &&
          attempt <= maxAutoRetries
        ) {
          console.warn(
            `[stream] attempt ${attempt} failed, auto-retrying:`,
            e,
          );
          dispatch(setTaskStatus(`${stepPrefix}⚠️ 流式出错，自动重试 ${attempt}/${maxAutoRetries}...`));
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw e;
      }
    }

    // Attach prompt log and end thinking for reasoning models
    if (completedPromptLog) {
      dispatch(addPromptCompletionPair([completedPromptLog]));

      try {
        const log = completedPromptLog;
        extra.ideMessenger.post("devdata/log", {
          name: "chatInteraction",
          data: {
            prompt: log.prompt,
            completion: log.completion,
            modelProvider: selectedChatModel.underlyingProviderName,
            modelName: selectedChatModel.title,
            modelTitle: selectedChatModel.title,
            sessionId: state.session.id,
            ...(!!activeTools.length && {
              tools: activeTools.map((tool) => tool.function.name),
            }),
            ...(appliedRules.length > 0 && {
              rules: appliedRules.map((rule) => ({
                id: getRuleId(rule),
                slug: rule.slug,
              })),
            }),
          },
        });
      } catch (e) {
        console.error("Failed to send dev data interaction log", e);
      }
    }


    // Tool call sequence:
    // 1. Mark generating tool calls as generated
    const state1 = getState();
    if (streamAborter.signal.aborted || !state1.session.isStreaming) {
      return;
    }
    const originalToolCalls = selectCurrentToolCalls(state1);
    const generatingCalls = originalToolCalls.filter(
      (tc) => tc.status === "generating",
    );
    for (const { toolCallId } of generatingCalls) {
      dispatch(
        setToolGenerated({
          toolCallId,
          tools: state1.config.config.tools,
        }),
      );
    }

    // 2. Pre-process args to catch invalid args before checking policies
    const state2 = getState();
    if (streamAborter.signal.aborted || !state2.session.isStreaming) {
      return;
    }
    const generatedCalls2 = selectPendingToolCalls(state2);
    await preprocessToolCalls(dispatch, extra.ideMessenger, generatedCalls2);

    // 3. Security check: evaluate updated policies based on args
    const state3 = getState();
    if (streamAborter.signal.aborted || !state3.session.isStreaming) {
      return;
    }
    const generatedCalls3 = selectPendingToolCalls(state3);
    const toolPolicies = state3.ui.toolSettings;
    const policies = await evaluateToolPolicies(
      dispatch,
      extra.ideMessenger,
      activeTools,
      generatedCalls3,
      toolPolicies,
    );
    const autoApprovedPolicies = policies.filter(
      ({ policy }) => policy === "allowedWithoutPermission",
    );
    const needsApprovalPolicies = policies.filter(
      ({ policy }) => policy === "allowedWithPermission",
    );

    // 4. Execute remaining tool calls
    if (originalToolCalls.length === 0) {
      dispatch(setInactive());
    } else if (needsApprovalPolicies.length > 0) {
      const builtInReadonlyAutoApproved = autoApprovedPolicies.filter(
        ({ toolCallState }) =>
          toolCallState.tool?.group === BUILT_IN_GROUP_NAME &&
          toolCallState.tool?.readonly,
      );

      if (builtInReadonlyAutoApproved.length > 0) {
        const state4 = getState();
        if (streamAborter.signal.aborted || !state4.session.isStreaming) {
          return;
        }
        await Promise.all(
          builtInReadonlyAutoApproved.map(async ({ toolCallState }) => {
            unwrapResult(
              await dispatch(
                callToolById({
                  toolCallId: toolCallState.toolCallId,
                  isAutoApproved: true,
                  depth: depth + 1,
                }),
              ),
            );
          }),
        );
      }

      dispatch(setInactive());
    } else {
      // auto stream cases increase thunk depth by 1 for debugging
      const state4 = getState();
      const generatedCalls4 = selectPendingToolCalls(state4);
      if (streamAborter.signal.aborted || !state4.session.isStreaming) {
        return;
      }
      if (generatedCalls4.length > 0) {
        await Promise.all(
          generatedCalls4.map(async ({ toolCallId }) => {
            unwrapResult(
              await dispatch(
                callToolById({
                  toolCallId,
                  isAutoApproved: true,
                  depth: depth + 1,
                }),
              ),
            );
          }),
        );
      } else {
        for (const { toolCallId } of originalToolCalls) {
          unwrapResult(
            await dispatch(
              streamResponseAfterToolCall({
                toolCallId,
                depth: depth + 1,
              }),
            ),
          );
        }
      }
    }
  },
);
