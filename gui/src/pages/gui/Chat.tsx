import {
  ArrowLeftIcon,
  ChatBubbleOvalLeftIcon,
} from "@heroicons/react/24/outline";
import { Editor, JSONContent } from "@tiptap/react";
import { ChatHistoryItem, InputModifiers } from "core";
import { renderChatMessage } from "core/util/messageContent";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "react-error-boundary";
import styled from "styled-components";
import { Button, lightGray, vscBackground } from "../../components";
import { useFindWidget } from "../../components/find/FindWidget";
import TimelineItem from "../../components/gui/TimelineItem";
import { NewSessionButton } from "../../components/mainInput/belowMainInput/NewSessionButton";
import ThinkingBlockPeek from "../../components/mainInput/belowMainInput/ThinkingBlockPeek";
import FridayInputBox from "../../components/mainInput/FridayInputBox";
import { useOnboardingCard } from "../../components/OnboardingCard";
import StepContainer from "../../components/StepContainer";
import { TabBar } from "../../components/TabBar/TabBar";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectDoneApplyStates,
  selectPendingToolCalls,
} from "../../redux/selectors/selectToolCalls";
import {
  cancelToolCall,
  ChatHistoryItemWithMessageId,
  newSession,
  setMainEditorContentTrigger,
  updateToolCallOutput,
} from "../../redux/slices/sessionSlice";
import { streamEditThunk } from "../../redux/thunks/edit";
import { loadLastSession } from "../../redux/thunks/session";
import { streamResponseThunk } from "../../redux/thunks/streamResponse";
import { isJetBrains, isMetaEquivalentKeyPressed } from "../../util";
import { ToolTip } from "../../components/gui/Tooltip";
import { ToolCallDiv } from "./ToolCallDiv";

import { useStore } from "react-redux";
import FeedbackDialog from "../../components/dialogs/FeedbackDialog";

import { DeprecationBanner } from "../../components/DeprecationBanner";
import { FatalErrorIndicator } from "../../components/config/FatalErrorNotice";
import InlineErrorMessage from "../../components/mainInput/InlineErrorMessage";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import { setDialogMessage, setShowDialog } from "../../redux/slices/uiSlice";
import { RootState } from "../../redux/store";
import { cancelStream } from "../../redux/thunks/cancelStream";
import { getLocalStorage, setLocalStorage } from "../../util/localStorage";
import { EmptyChatBody } from "./EmptyChatBody";
import { ExploreDialogWatcher } from "./ExploreDialogWatcher";
import { useAutoScroll } from "./useAutoScroll";
import { T } from "../../util/i18n";

// Helper function to find the index of the latest conversation summary
function findLatestSummaryIndex(history: ChatHistoryItem[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].conversationSummary) {
      return i;
    }
  }
  return -1; // No summary found
}

const TotalTokenBar = ({ filteredHistory }: { filteredHistory: ChatHistoryItem[] }) => {
  const [expanded, setExpanded] = useState(false);
  let totalIn = 0, totalOut = 0, totalCached = 0, totalCacheWrite = 0;
  let totalReasoning = 0;
  for (const item of filteredHistory) {
    if (item.promptLogs) {
      for (const log of item.promptLogs) {
        // Prefer real API usage, fallback to text-length estimation (~3.5 chars per token)
        const inp = log.usage?.promptTokens ?? Math.round((log.prompt?.length || 0) / 3.5);
        const out = log.usage?.completionTokens ?? Math.round((log.completion?.length || 0) / 3.5);
        const cached = log.usage?.promptTokensDetails?.cachedTokens;
        const cacheWrite = log.usage?.promptTokensDetails?.cacheWriteTokens;
        const reasoning = log.usage?.completionTokensDetails?.reasoningTokens;
        totalIn += inp;
        totalOut += out;
        if (typeof cached === "number") totalCached += cached;
        if (typeof cacheWrite === "number") totalCacheWrite += cacheWrite;
        if (typeof reasoning === "number") totalReasoning += reasoning;
      }
    }
  }
  const totalContent = Math.max(0, totalOut - totalReasoning);
  const total = totalIn + totalOut;
  if (total === 0 && totalOut === 0) return null;

  // Total elapsed = first user message → last message
  const firstUser = filteredHistory.find((x: any) => x?.message?.role === "user");
  const lastMsg = filteredHistory[filteredHistory.length - 1];
  const totalMs =
    firstUser?.timestamp && lastMsg?.timestamp ? lastMsg.timestamp - firstUser.timestamp : 0;
  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rs = Math.floor(s % 60);
    return `${m}m${rs}s`;
  };

  const cacheMiss = Math.max(0, totalIn - totalCached);
  const cacheHitRate = totalIn > 0 ? (totalCached / totalIn) * 100 : 0;

  return (
    <div className="border-t" style={{ borderColor: "var(--vscode-panel-border)" }}>
      <div className="flex items-center gap-2 py-1.5 px-3" style={{ fontSize: "10px", opacity: 0.75 }}>
        {/* Capsule: total */}
        <button
          onClick={() => setExpanded((v) => !v)}
          title="点击查看 Token 消耗明细"
          className="flex items-center gap-1.5"
          style={{
            padding: "1px 8px",
            borderRadius: "10px",
            background: "rgba(59,130,246,0.12)",
            color: "#93c5fd",
            border: "none",
            cursor: "pointer",
            fontSize: "10px",
          }}
        >
          <span>🪙</span>
          <span>{total.toLocaleString()}</span>
          <span style={{ opacity: 0.6, fontSize: "9px" }}>{expanded ? "▴" : "▾"}</span>
        </button>
        {/* Time capsule */}
        {totalMs > 0 && (
          <span
            style={{
              padding: "1px 8px",
              borderRadius: "10px",
              background: "rgba(128,128,128,0.08)",
              color: "var(--vscode-descriptionForeground)",
              fontSize: "10px",
            }}
            title="总会话耗时"
          >
            🕐 {formatMs(totalMs)}
          </span>
        )}
        {expanded && (
          <span style={{ color: "var(--vscode-descriptionForeground)", fontSize: "10px" }}>
            Token 消耗明细
          </span>
        )}
      </div>

      {expanded && (
        <div
          className="mx-3 mb-2 p-3 rounded"
          style={{
            background: "var(--vscode-editor-background)",
            border: "1px solid var(--vscode-panel-border)",
            fontSize: "11px",
          }}
        >
          {/* Header row: 总计 */}
          <div className="flex justify-between items-center mb-2 pb-2" style={{ borderBottom: "1px solid var(--vscode-panel-border)" }}>
            <span style={{ color: "var(--vscode-descriptionForeground)" }}>总计</span>
            <span style={{ fontWeight: 600, color: "#93c5fd" }}>{total.toLocaleString()}</span>
          </div>
          {/* 输入 section */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6", display: "inline-block" }} />
              <span style={{ color: "var(--vscode-foreground)", fontWeight: 500 }}>输入</span>
            </div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: "1fr auto", paddingLeft: 16 }}>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>缓存命中</span>
              <span>{totalCached.toLocaleString()}</span>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>缓存未命中</span>
              <span>{cacheMiss.toLocaleString()}</span>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>缓存写入</span>
              <span>{totalCacheWrite.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-1 pt-1" style={{ borderTop: "1px dashed var(--vscode-panel-border)" }}>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>输入小计</span>
              <span style={{ fontWeight: 500 }}>{totalIn.toLocaleString()}</span>
            </div>
          </div>
          {/* 输出 section */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#8b5cf6", display: "inline-block" }} />
              <span style={{ color: "var(--vscode-foreground)", fontWeight: 500 }}>输出</span>
            </div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: "1fr auto", paddingLeft: 16 }}>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>思考过程</span>
              <span>{totalReasoning.toLocaleString()}</span>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>回复内容</span>
              <span>{totalContent.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-1 pt-1" style={{ borderTop: "1px dashed var(--vscode-panel-border)" }}>
              <span style={{ color: "var(--vscode-descriptionForeground)" }}>输出小计</span>
              <span style={{ fontWeight: 500 }}>{totalOut.toLocaleString()}</span>
            </div>
          </div>
          {/* Cache hit rate + progress bar */}
          {totalIn > 0 && (
            <div className="pt-2" style={{ borderTop: "1px solid var(--vscode-panel-border)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  <span style={{ color: "#f59e0b" }}>⚡</span>
                  <span style={{ color: "var(--vscode-foreground)" }}>缓存命中率</span>
                </span>
                <span style={{ color: "#6ee7b7", fontWeight: 600 }}>{cacheHitRate.toFixed(1)}%</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(128,128,128,0.15)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, cacheHitRate)}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #10b981, #6ee7b7)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div className="flex items-center gap-3 mt-2" style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)" }}>
                <span className="flex items-center gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: "#10b981", display: "inline-block" }} />
                  命中
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: "#f59e0b", display: "inline-block" }} />
                  写入
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: "#ef4444", display: "inline-block" }} />
                  未命中
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StepsDiv = styled.div`
  position: relative;
  background-color: transparent;
  padding: 0 20px;

  & > * {
    position: relative;
  }

  .thread-message {
    margin: 0 0 0 1px;
  }

  /* AI message row — tight blocks, avatar only on first of a sequence */
  .msg-row {
    display: flex;
    align-items: flex-start;
  }

  .msg-row.with-avatar {
    gap: 10px;
    margin-top: 20px;
  }

  .msg-row.no-avatar {
    gap: 0;
    margin-left: 20px;
  }

  /* User message row — right side, auto-width */
  .msg-row.user {
    justify-content: flex-end;
    margin-top: 24px;
    margin-bottom: 12px;
    flex-direction: row;
  }

  .msg-row.user:first-child {
    margin-top: 0;
  }

  /* Avatar column */
  .msg-avatar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 28px;
    opacity: 0.75;
  }

  .msg-avatar-col.right {
    order: 2;
  }

  .msg-avatar-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }

  .msg-avatar-icon.ai {
    background: rgba(128,128,128,0.15);
  }

  .msg-avatar-icon.user {
    background: rgba(59,130,246,0.15);
  }

  .msg-avatar-label {
    font-size: 15px;
    margin-top: 2px;
    color: var(--vscode-foreground);
    white-space: nowrap;
  }

  /* Message body */
  .msg-body {
    min-width: 0;
  }

  .msg-body.ai-body {
    flex: 1;
    margin-right: 20px;
  }

  .msg-body.user-body {
    max-width: 75%;
  }
`;

export const MAIN_EDITOR_INPUT_ID = "main-editor-input";

function fallbackRender({ error, resetErrorBoundary }: any) {
  // Call resetErrorBoundary() to reset the error boundary and retry the render.

  return (
    <div
      role="alert"
      className="px-2"
      style={{ backgroundColor: vscBackground }}
    >
      <p>{T("Something went wrong:")}</p>
      <pre style={{ color: "red" }}>{error.message}</pre>
      <pre style={{ color: lightGray }}>{error.stack}</pre>

      <div className="text-center">
        <Button onClick={resetErrorBoundary}>{T("Restart")}</Button>
      </div>
    </div>
  );
}

export function Chat() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const reduxStore = useStore<RootState>();
  const onboardingCard = useOnboardingCard();
  const showSessionTabs = useAppSelector(
    (store) => store.config.config.ui?.showSessionTabs,
  );
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const [stepsOpen] = useState<(boolean | undefined)[]>([]);
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  const historyPopupRef = useRef<HTMLDivElement>(null);
  const mainTextInputRef = useRef<HTMLInputElement>(null);
  const stepsDivRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const history = useAppSelector((state) => state.session.history);

  const currentSessionId = useAppSelector((state) => state.session.id);

  // Message queue: persisted per session, auto-send when streaming ends
  type QueuedItem = { content: JSONContent; modifiers: InputModifiers };
  const queuesRef = useRef<Map<string, QueuedItem[]>>(new Map());
  const [renderTick, setRenderTick] = useState(0);
  const [queueTip, setQueueTip] = useState(false);
  const prevStreaming = useRef(isStreaming);
  const prevSessionRef = useRef(currentSessionId);
  const sendInputRef = useRef<any>(null);

  // Derive current session's queue from the Map
  const queuedMessages = queuesRef.current.get(currentSessionId) || [];
  const setQueuedMessages = (fn: QueuedItem[] | ((prev: QueuedItem[]) => QueuedItem[])) => {
    const prev = queuesRef.current.get(currentSessionId) || [];
    const next = typeof fn === "function" ? (fn as any)(prev) : fn;
    queuesRef.current.set(currentSessionId, next);
    setRenderTick((t) => t + 1);
  };
  // Keep a ref to the latest setQueuedMessages so sendInput (useCallback) always has the current version
  const setQueuedMessagesRef = useRef(setQueuedMessages);
  setQueuedMessagesRef.current = setQueuedMessages;

  // Auto-send first queued message when streaming ends (for current session)
  useEffect(() => {
    if (prevStreaming.current && !isStreaming && queuedMessages.length > 0) {
      const [next, ...rest] = queuedMessages;
      queuesRef.current.set(currentSessionId, rest);
      setRenderTick((t) => t + 1);
      if (sendInputRef.current) {
        sendInputRef.current(next.content, next.modifiers, undefined, undefined as any);
      }
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, queuedMessages.length, currentSessionId]);

  const filteredHistory = useMemo(
    () => history.filter((item) => item.message.role !== "system"),
    [history],
  );

  useEffect(() => {
    if (!showHistoryPopup) return;
    const handler = (e: MouseEvent) => {
      if (historyPopupRef.current && !historyPopupRef.current.contains(e.target as Node)) {
        setShowHistoryPopup(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHistoryPopup]);
  const showChatScrollbar = useAppSelector(
    (state) => state.config.config.ui?.showChatScrollbar,
  );
  const configFontSize = useAppSelector(
    (state) => state.config.config.ui?.fontSize,
  );
  const codeToEdit = useAppSelector((state) => state.editModeState.codeToEdit);
  const isInEdit = useAppSelector((store) => store.session.isInEdit);

  const lastSessionId = useAppSelector((state) => state.session.lastSessionId);
  const hasDismissedExploreDialog = useAppSelector(
    (state) => state.ui.hasDismissedExploreDialog,
  );
  const jetbrains = useMemo(() => {
    return isJetBrains();
  }, []);

  useAutoScroll(stepsDivRef, history);

  useEffect(() => {
    // Cmd + Backspace to delete current step
    const listener = (e: KeyboardEvent) => {
      if (
        e.key === "Backspace" &&
        (jetbrains ? e.altKey : isMetaEquivalentKeyPressed(e)) &&
        !e.shiftKey
      ) {
        void dispatch(cancelStream());
      }
    };
    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [isStreaming, jetbrains, isInEdit]);

  const { widget, highlights } = useFindWidget(
    stepsDivRef,
    tabsRef,
    isStreaming,
  );

  const sendInput = useCallback(
    (
      editorState: JSONContent,
      modifiers: InputModifiers,
      index?: number,
      editorToClearOnSend?: Editor,
    ) => {
      const stateSnapshot = reduxStore.getState();
      const latestPendingToolCalls = selectPendingToolCalls(stateSnapshot);
      const latestPendingApplyStates = selectDoneApplyStates(stateSnapshot);
      const isCurrentlyInEdit = stateSnapshot.session.isInEdit;
      const codeToEditSnapshot = stateSnapshot.editModeState.codeToEdit;
      const selectedModelByRole =
        stateSnapshot.config.config.selectedModelByRole;
      const currentMode = stateSnapshot.session.mode;

      // If currently streaming, queue this message instead of sending
      if (stateSnapshot.session.isStreaming) {
        if (setQueuedMessagesRef.current) {
          setQueuedMessagesRef.current((prev: QueuedItem[]) => [...prev, { content: editorState, modifiers }]);
        }
        setQueueTip(true);
        setTimeout(() => setQueueTip(false), 2500);
        if (editorToClearOnSend) {
          editorToClearOnSend.commands.clearContent();
        }
        return;
      }

      // Cancel all pending tool calls
      latestPendingToolCalls.forEach((toolCallState) => {
        dispatch(
          cancelToolCall({
            toolCallId: toolCallState.toolCallId,
          }),
        );
      });

      // Reject all pending apply states
      latestPendingApplyStates.forEach((applyState) => {
        if (applyState.status !== "closed") {
          ideMessenger.post("rejectDiff", applyState);
        }
      });
      const model = isCurrentlyInEdit
        ? (selectedModelByRole.edit ?? selectedModelByRole.chat)
        : selectedModelByRole.chat;

      if (!model) {
        return;
      }

      if (isCurrentlyInEdit && codeToEditSnapshot.length === 0) {
        return;
      }

      if (isCurrentlyInEdit) {
        void dispatch(
          streamEditThunk({
            editorState,
            codeToEdit: codeToEditSnapshot,
          }),
        );
      } else {
        void dispatch(streamResponseThunk({ editorState, modifiers, index }));

        if (editorToClearOnSend) {
          editorToClearOnSend.commands.clearContent();
        }
      }

      // Increment localstorage counter for popup
      const currentCount = getLocalStorage("mainTextEntryCounter");
      if (currentCount) {
        setLocalStorage("mainTextEntryCounter", currentCount + 1);
        if (currentCount === 300) {
          dispatch(setDialogMessage(<FeedbackDialog />));
          dispatch(setShowDialog(true));
        }
      } else {
        setLocalStorage("mainTextEntryCounter", 1);
      }
    },
    [dispatch, ideMessenger, reduxStore],
  );
  sendInputRef.current = sendInput;

  useWebviewListener(
    "newSession",
    async () => {
      // unwrapResult(response) // errors if session creation failed
      mainTextInputRef.current?.focus?.();
    },
    [mainTextInputRef],
  );

  // Handle partial tool call output for streaming updates
  useWebviewListener(
    "toolCallPartialOutput",
    async (data) => {
      // Update tool call output in Redux store
      dispatch(
        updateToolCallOutput({
          toolCallId: data.toolCallId,
          contextItems: data.contextItems,
        }),
      );
    },
    [dispatch],
  );

  const isLastUserInput = useCallback(
    (index: number): boolean => {
      return !history
        .slice(index + 1)
        .some((entry) => entry.message.role === "user");
    },
    [history],
  );

  const renderChatHistoryItem = useCallback(
    (item: ChatHistoryItemWithMessageId, index: number) => {
      const {
        message,
        editorState,
        contextItems,
        appliedRules,
        toolCallStates,
      } = item;

      // Calculate once for the entire function
      const latestSummaryIndex = findLatestSummaryIndex(history);
      const isBeforeLatestSummary =
        latestSummaryIndex !== -1 && index < latestSummaryIndex;

      if (message.role === "user") {
        return (
          <div className="msg-row user">
            <div className="msg-body user-body">
              <FridayInputBox
                onEnter={(editorState, modifiers) =>
                  sendInput(editorState, modifiers, index)
                }
                isLastUserInput={isLastUserInput(index)}
                isMainInput={false}
                editorState={editorState ?? item.message.content}
                contextItems={contextItems}
                appliedRules={appliedRules}
                inputId={message.id}
              />
              {item.timestamp && (
                <div className="mr-2 mt-0.5 text-right text-[10px] text-gray-500 opacity-60">
                  {new Date(item.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
            <span className="msg-avatar-label" style={{ fontSize: configFontSize || undefined }}>{T("User")}</span>
            <div className="msg-avatar-col right">
              <div className="msg-avatar-icon user" title="You">👤</div>
            </div>
          </div>
        );
      }

      if (message.role === "tool") {
        return null;
      }

      if (message.role === "assistant") {
        // Only show avatar on the first AI block after a user message.
        // Skip tool messages when checking previous for avatar grouping.
        let showAvatar = index === 0;
        if (!showAvatar) {
          let prevWasAssistant = false;
          for (let j = index - 1; j >= 0; j--) {
            const prev = filteredHistory[j];
            if (!prev) continue;
            if (prev.message.role === "assistant") { prevWasAssistant = true; break; }
            if (prev.message.role === "user") break;
          }
          showAvatar = !prevWasAssistant;
        }

        return (
          <div className={`msg-row ${showAvatar ? "with-avatar" : "no-avatar"}`}>
            {showAvatar && (
              <div className="msg-avatar-col">
                <div className="msg-avatar-icon ai" title="Friday AI">🤖</div>
              </div>
            )}
            {showAvatar && (
              <span className="msg-avatar-label" style={{ fontSize: configFontSize || undefined }}>Friday</span>
            )}
            <div className="msg-body ai-body">
              {/* Always render assistant content through normal path */}
              <div className="thread-message">
                <TimelineItem
                  item={item}
                  iconElement={
                    <ChatBubbleOvalLeftIcon width="16px" height="16px" />
                  }
                  open={
                    typeof stepsOpen[index] === "undefined"
                      ? true
                      : stepsOpen[index]!
                  }
                  onToggle={() => {}}
                >
                  <StepContainer
                    index={index}
                    isLast={index === history.length - 1}
                    item={item}
                    latestSummaryIndex={latestSummaryIndex}
                    timestamp={item.timestamp}
                    leftSlot={
                      item.promptLogs && item.promptLogs.length > 0
                        ? (() => {
                            const logs = item.promptLogs;
                            const lastUsg = logs[logs.length - 1]?.usage;
                            const inp = lastUsg?.promptTokens ?? Math.round(logs.reduce((s: number, l: any) => s + (l.prompt?.length || 0), 0) / 3.5);
                            const out = lastUsg?.completionTokens ?? Math.round(logs.reduce((s: number, l: any) => s + (l.completion?.length || 0), 0) / 3.5);
                            const cached = lastUsg?.promptTokensDetails?.cachedTokens;
                            const prevUser = filteredHistory.slice(0, index).reverse().find((x: any) => x?.message?.role === "user");
                            const elapsed = prevUser?.timestamp && item.timestamp ? ((item.timestamp - prevUser.timestamp) / 1000).toFixed(1) : "";
                            if (inp === 0 && out === 0) return null;
                            return (
                              <span style={{ fontSize: "10px", userSelect: "none", opacity: 0.75, display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <span style={{ padding: "1px 8px", borderRadius: "10px", background: "rgba(128,128,128,0.12)", color: "var(--vscode-descriptionForeground)" }}>⬇ {inp.toLocaleString()}</span>
                                <span style={{ padding: "1px 8px", borderRadius: "10px", background: "rgba(59,130,246,0.12)", color: "#93c5fd" }}>⬆ {out.toLocaleString()}</span>
                                {typeof cached === "number" && cached > 0 && (
                                  <span style={{ padding: "1px 8px", borderRadius: "10px", background: "rgba(16,185,129,0.12)", color: "#6ee7b7" }}>🗲 {cached.toLocaleString()}</span>
                                )}
                                {elapsed && (
                                  <span style={{ padding: "1px 8px", borderRadius: "10px", background: "rgba(128,128,128,0.08)", color: "var(--vscode-descriptionForeground)" }}>🕐 {elapsed}s</span>
                                )}
                              </span>
                            );
                          })()
                        : undefined
                    }
                  />
                </TimelineItem>
              </div>

              {toolCallStates && (
                <ToolCallDiv
                  toolCallStates={toolCallStates}
                  historyIndex={index}
                />
              )}
            </div>
          </div>
        );
      }

      if (message.role === "thinking") {
        const thinkingContent = renderChatMessage(message);
        if (!thinkingContent?.trim()) {
          return null;
        }
        return (
          <div className={isBeforeLatestSummary ? "opacity-50" : ""} style={{ marginLeft: "20px" }}>
            <ThinkingBlockPeek
              content={thinkingContent}
              redactedThinking={message.redactedThinking}
              index={index}
              prevItem={index > 0 ? history[index - 1] : null}
              inProgress={index === history.length - 1 && isStreaming}
              signature={message.signature}
            />
          </div>
        );
      }

      // Default case - regular assistant message
      return (
        <div className="thread-message">
          <TimelineItem
            item={item}
            iconElement={<ChatBubbleOvalLeftIcon width="16px" height="16px" />}
            open={
              typeof stepsOpen[index] === "undefined" ? true : stepsOpen[index]!
            }
            onToggle={() => {}}
          >
            <StepContainer
              index={index}
              isLast={index === history.length - 1}
              item={item}
              latestSummaryIndex={latestSummaryIndex}
              timestamp={item.timestamp}
            />
          </TimelineItem>
        </div>
      );
    },
    [sendInput, isLastUserInput, history, filteredHistory, stepsOpen, isStreaming],
  );

  const showScrollbar = showChatScrollbar ?? window.innerHeight > 5000;

  // ---- Scroll navigation helpers ----
  const scrollToTop = useCallback(() => {
    stepsDivRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = stepsDivRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const scrollToUserMsg = useCallback((dir: "prev" | "next") => {
    const el = stepsDivRef.current;
    if (!el) return;
    const items = el.querySelectorAll("[data-user-msg]");
    if (items.length === 0) return;
    // Find first visible user message index
    const containerTop = el.scrollTop;
    const containerBottom = containerTop + el.clientHeight;
    let currentIdx = dir === "prev" ? items.length - 1 : 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as HTMLElement;
      const itemTop = item.offsetTop;
      if (itemTop >= containerTop && itemTop < containerBottom) {
        currentIdx = i;
        break;
      }
      if (itemTop < containerTop) currentIdx = i;
    }
    const targetIdx = dir === "prev"
      ? Math.max(0, currentIdx - 1)
      : Math.min(items.length - 1, currentIdx + 1);
    (items[targetIdx] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  // ----

  return (
    <>
      {!!showSessionTabs && !isInEdit && <TabBar ref={tabsRef} />}
      {widget}

      <div className="relative flex min-h-0 flex-1">
        <StepsDiv
          ref={stepsDivRef}
          className={`pt-[8px] ${showScrollbar ? "thin-scrollbar" : "no-scrollbar"} min-h-0 flex-1 overflow-y-scroll overflow-x-hidden`}
        >
          <DeprecationBanner />
          {highlights}
          {history.length === 0 ? (
            <EmptyChatBody showOnboardingCard={onboardingCard.show} />
          ) : (
            history
              .filter((item) => item.message.role !== "system")
              .map((item, index: number) => (
                <div
                  key={item.message.id}
                  {...(item.message.role === "user" ? { "data-user-msg": "true" } : {})}
                  style={{
                    minHeight: index === filteredHistory.length - 1 ? "200px" : 0,
                  }}
                >
                  <ErrorBoundary
                    FallbackComponent={fallbackRender}
                    onReset={() => {
                      dispatch(newSession());
                    }}
                  >
                    {renderChatHistoryItem(item, index)}
                  </ErrorBoundary>
                  {index === filteredHistory.length - 1 && <InlineErrorMessage />}
                </div>
              ))
          )}
        </StepsDiv>

        {/* Scroll navigation buttons — floating emoji */}
        <style>{`
          @keyframes fadeOut { 0%,70%{opacity:1} 100%{opacity:0} }
          .queue-action-btn { background:none;border:none;cursor:pointer;font-size:14px;
            color:var(--vscode-descriptionForeground);padding:2px 6px;border-radius:4px;
            opacity:0.75;transition:opacity 0.15s,background 0.15s; }
          .queue-action-btn:hover { opacity:1;background:rgba(128,128,128,0.15); }
          @keyframes float-up-down { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
          @keyframes float-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
          .scroll-btn { display:flex;align-items:center;justify-content:center;
            width:26px;height:26px;border-radius:50%;cursor:pointer;
            background:rgba(128,128,128,0.18);font-size:13px;line-height:1;
            opacity:0.4;transition:all 0.2s;backdrop-filter:blur(4px);
            animation:float-up-down 3s ease-in-out infinite; }
          .scroll-btn:hover { opacity:1;background:rgba(128,128,128,0.4);animation:float-pulse 0.6s ease-in-out; }
          .scroll-btn:nth-child(2){animation-delay:0.2s}
          .scroll-btn:nth-child(3){animation-delay:0.4s}
          .scroll-btn:nth-child(4){animation-delay:0.6s}
          .scroll-btn:nth-child(5){animation-delay:0.8s}
          .scroll-tip { position:relative }
          .scroll-tip::after {
            content:attr(data-tip);
            position:absolute;right:110%;top:50%;transform:translateY(-50%);
            background:rgba(0,0,0,0.75);color:#fff;font-size:10px;
            padding:2px 6px;border-radius:4px;white-space:nowrap;
            opacity:0;pointer-events:none;transition:opacity 0.15s;
          }
          .scroll-tip:hover::after { opacity:1 }
          .history-popup { position:absolute;right:40px;top:0;width:280px;max-height:400px;
            overflow-y:auto;background:var(--vscode-sideBar-background);border:1px solid var(--vscode-panel-border);
            border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);z-index:50;padding:8px 0; }
          .history-popup-item { padding:6px 12px;cursor:pointer;font-size:12px;
            color:var(--vscode-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
          .history-popup-item:hover { background:var(--vscode-list-hoverBackground); }
        `}</style>
        {filteredHistory.length > 0 && (
          <div className="absolute right-1.5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
            <button onClick={scrollToTop} data-tip={T("Scroll to top")} className="scroll-btn scroll-tip">🔝</button>
            <button onClick={() => scrollToUserMsg("prev")} data-tip={T("Previous user message")} className="scroll-btn scroll-tip">⬆️</button>
            <button onClick={() => setShowHistoryPopup(!showHistoryPopup)} data-tip={T("History")} className="scroll-btn scroll-tip" style={{fontSize:"16px",fontWeight:"bold"}}>☰</button>
            <button onClick={() => scrollToUserMsg("next")} data-tip={T("Next user message")} className="scroll-btn scroll-tip">⬇️</button>
            <button onClick={scrollToBottom} data-tip={T("Scroll to bottom")} className="scroll-btn scroll-tip">⏬</button>
            {showHistoryPopup && (
              <div className="history-popup" ref={historyPopupRef}>
                {filteredHistory.filter((item: any) => item.message.role === "user").map((item: any, i: number) => (
                  <div key={i} className="history-popup-item" onClick={() => {
                    const all = document.querySelectorAll("[data-user-msg]");
                    if (all[i]) (all[i] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
                    setShowHistoryPopup(false);
                  }}>{renderChatMessage(item.message).substring(0, 50)}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <TotalTokenBar filteredHistory={filteredHistory} />
      {/* Message queue — only shown when there are queued messages */}
      {queuedMessages.length > 0 && (
        <div
          className="flex flex-col gap-1.5 px-3 py-2"
          style={{
            borderTop: "1px solid var(--vscode-panel-border)",
            background: "var(--vscode-editor-background)",
            fontSize: "12px",
          }}
        >
          {queueTip && (
            <div className="text-center" style={{ color: "#6ee7b7", fontSize: "11px", animation: "fadeOut 2.5s ease forwards" }}>
              ✓ 已加入队列，当前任务完成后自动发送
            </div>
          )}
          <div style={{ color: "var(--vscode-descriptionForeground)", fontSize: "10px", marginBottom: 2 }}>
            队列 ({queuedMessages.length})
          </div>
          {queuedMessages.map((item, i) => {
            const text = (() => {
              try {
                return item.content?.content
                  ?.map((node: any) => node?.content?.map((n: any) => n?.text || "").join("") || "")
                  .join(" ") || "(空消息)";
              } catch { return "(消息)"; }
            })();
            return (
              <div
                key={i}
                className="flex items-center justify-between rounded px-2 py-1"
                style={{
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(59,130,246,0.15)",
                  fontSize: "11px",
                }}
              >
                <span className="truncate flex-1" style={{ color: "var(--vscode-foreground)" }}>
                  <span style={{ color: "var(--vscode-descriptionForeground)", marginRight: 4 }}>
                    {i + 1}.
                  </span>
                  {text.substring(0, 80)}{text.length > 80 ? "…" : ""}
                </span>
                <span style={{ display: "flex", gap: 4 }}>
                  <ToolTip place="top" content="撤回编辑">
                    <button
                      onClick={() => {
                        setQueuedMessages((prev) => prev.filter((_, j) => j !== i));
                        dispatch(setMainEditorContentTrigger(item.content));
                      }}
                      className="queue-action-btn"
                    >
                      ↩️
                    </button>
                  </ToolTip>
                  <ToolTip place="top" content="移除">
                    <button
                      onClick={() => setQueuedMessages((prev) => prev.filter((_, j) => j !== i))}
                      className="queue-action-btn"
                    >
                      🗑️
                    </button>
                  </ToolTip>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className={"relative shrink-0"}>
        <FridayInputBox
          isMainInput
          isLastUserInput={false}
          onEnter={(editorState, modifiers, editor) =>
            sendInput(editorState, modifiers, undefined, editor)
          }
          inputId={MAIN_EDITOR_INPUT_ID}
        />

        <div
          style={{
            pointerEvents: isStreaming ? "none" : "auto",
          }}
        >
          <div className="flex flex-row items-center justify-between pb-1 pl-0.5 pr-2">
            <div className="xs:inline hidden">
              {history.length === 0 && lastSessionId && !isInEdit && (
                <NewSessionButton
                  onClick={async () => {
                    await dispatch(loadLastSession());
                  }}
                  className="flex items-center gap-2"
                >
                  <ArrowLeftIcon className="h-3 w-3" />
                  <span className="text-xs">{T("Last Session")}</span>
                </NewSessionButton>
              )}
            </div>
          </div>
          <FatalErrorIndicator />
          {!hasDismissedExploreDialog && <ExploreDialogWatcher />}
        </div>
      </div>
    </>
  );
}
