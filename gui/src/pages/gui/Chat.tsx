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
  updateToolCallOutput,
} from "../../redux/slices/sessionSlice";
import { streamEditThunk } from "../../redux/thunks/edit";
import { loadLastSession } from "../../redux/thunks/session";
import { streamResponseThunk } from "../../redux/thunks/streamResponse";
import { isJetBrains, isMetaEquivalentKeyPressed } from "../../util";
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
    margin-left: 38px; /* indent to align with avatar column */
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
    font-size: 9px;
    margin-top: 2px;
    color: var(--vscode-descriptionForeground, #888);
    white-space: nowrap;
  }

  /* Message body */
  .msg-body {
    min-width: 0;
  }

  .msg-body.ai-body {
    flex: 1;
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
  const mainTextInputRef = useRef<HTMLInputElement>(null);
  const stepsDivRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const history = useAppSelector((state) => state.session.history);
  const showChatScrollbar = useAppSelector(
    (state) => state.config.config.ui?.showChatScrollbar,
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
            <div className="msg-avatar-col right">
              <div className="msg-avatar-icon user" title="You">👤</div>
              <span className="msg-avatar-label">{T("User")}</span>
            </div>
          </div>
        );
      }

      if (message.role === "tool") {
        return null;
      }

      if (message.role === "assistant") {
        // Only show avatar on the first AI block after a user message
        const visibleHistory = history.filter((h) => h.message.role !== "system");
        const prevVisible = visibleHistory[visibleHistory.indexOf(item) - 1];
        const showAvatar = !prevVisible || prevVisible.message.role !== "assistant";

        return (
          <div className={`msg-row ${showAvatar ? "with-avatar" : "no-avatar"}`}>
            {showAvatar && (
              <div className="msg-avatar-col">
                <div className="msg-avatar-icon ai" title="Friday AI">🤖</div>
                <span className="msg-avatar-label">Friday</span>
              </div>
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
          <div className={isBeforeLatestSummary ? "opacity-50" : ""}>
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
    [sendInput, isLastUserInput, history, stepsOpen, isStreaming],
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

  const filteredHistory = useMemo(
    () => history.filter((item) => item.message.role !== "system"),
    [history],
  );
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
        `}</style>
        {filteredHistory.length > 0 && (
          <div className="absolute right-1.5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
            <button onClick={scrollToTop} title={T("Scroll to top")} className="scroll-btn">🔝</button>
            <button onClick={() => scrollToUserMsg("prev")} title={T("Previous user message")} className="scroll-btn">⬆️</button>
            <button onClick={() => scrollToUserMsg("next")} title={T("Next user message")} className="scroll-btn">⬇️</button>
            <button onClick={scrollToBottom} title={T("Scroll to bottom")} className="scroll-btn">⏬</button>
          </div>
        )}
      </div>
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
