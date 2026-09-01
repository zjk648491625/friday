import { ChatHistoryItem } from "core";
import { renderChatMessage, stripImages } from "core/util/messageContent";
import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { selectUIConfig } from "../../redux/slices/configSlice";
import { T } from "../../util/i18n";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  EMPTY_RESPONSE_WARNING,
  THINKING_ONLY_WARNING,
  deleteMessage,
} from "../../redux/slices/sessionSlice";
import { streamResponseThunk } from "../../redux/thunks/streamResponse";
import ThinkingBlockPeek from "../mainInput/belowMainInput/ThinkingBlockPeek";
import StyledMarkdownPreview from "../StyledMarkdownPreview";
import ConversationSummary from "./ConversationSummary";
import ResponseActions from "./ResponseActions";

interface StepContainerProps {
  item: ChatHistoryItem;
  index: number;
  isLast: boolean;
  latestSummaryIndex?: number;
  timestamp?: number;
  leftSlot?: React.ReactNode;
  onFork?: (index: number) => void;
}

export default function StepContainer(props: StepContainerProps) {
  const dispatch = useAppDispatch();
  const [isTruncated, setIsTruncated] = useState(false);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const uiConfig = useAppSelector(selectUIConfig);
  const history = useAppSelector((state) => state.session.history);

  // Calculate dimming and indicator state based on latest summary index
  const latestSummaryIndex = props.latestSummaryIndex ?? -1;
  const isBeforeLatestSummary =
    latestSummaryIndex !== -1 && props.index <= latestSummaryIndex;
  const isLatestSummary =
    latestSummaryIndex !== -1 && props.index === latestSummaryIndex;

  const historyItemAfterThis = useAppSelector(
    (state) => state.session.history[props.index + 1],
  );
  const showResponseActions =
    (props.isLast || historyItemAfterThis?.message.role === "user") &&
    !(props.isLast && (isStreaming || props.item.toolCallStates));

  // The turn finished but produced no visible content: offer the raw
  // model response (stored in promptLogs) for diagnosis.
  const isEmptyResponse =
    props.item.message.role === "assistant" &&
    (props.item.message.content === EMPTY_RESPONSE_WARNING ||
      props.item.message.content === THINKING_ONLY_WARNING);

  // Resubmit the user/tool message that preceded this empty assistant reply.
  function handleEmptyResponseRetry() {
    let targetIndex = -1;
    for (let i = props.index - 1; i >= 0; i--) {
      const role = history[i].message.role;
      if (role === "user" || role === "tool") {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex < 0) {
      return;
    }
    const editorState = history[targetIndex].editorState;
    if (!editorState) {
      return;
    }
    void dispatch(
      streamResponseThunk({
        editorState,
        modifiers: { noContext: true, useCodebase: false },
        index: targetIndex,
      }),
    );
  }

  useEffect(() => {
    if (!isStreaming) {
      const content = renderChatMessage(props.item.message).trim();
      const endingPunctuation = [".", "?", "!", "```", ":", "END_ARG"];
    
      // A reply ending in punctuation, an emoji, or a completed tool-call block
      // (END_ARG) is treated as complete and is not flagged as truncated.
      const hasValidEnd = endingPunctuation.some(p => content.endsWith(p));
      const endsWithEmoji = /\p{Emoji}/u.test(content.slice(-2));
    
      if (
        content.trim() !== "" &&
        !hasValidEnd &&
        !endsWithEmoji
      ) {
        setIsTruncated(true);
      } else {
        setIsTruncated(false);
      }
    }
  }, [props.item.message.content, isStreaming]);

  function onDelete() {
    dispatch(deleteMessage(props.index));
  }

  function onFridayGeneration() {
    window.postMessage(
      {
        messageType: "userInput",
        data: {
          input: T("Continue your response exactly where you left off:"),
        },
      },
      "*",
    );
  }

  return (
    <div>
      <div
        className={`bg-background p-1 px-1.5 ${isBeforeLatestSummary ? "opacity-35" : ""}`}
      >
        {uiConfig?.displayRawMarkdown ? (
          <pre className="text-2xs max-w-full overflow-x-auto whitespace-pre-wrap break-words p-4">
            {renderChatMessage(props.item.message)}
          </pre>
        ) : (
          <>
            {props.item.reasoning?.text?.trim() && (
              <ThinkingBlockPeek
                content={props.item.reasoning.text}
                index={props.index}
                prevItem={props.index > 0 ? props.item : null}
                inProgress={!props.item.reasoning?.endAt}
              />
            )}

            <StyledMarkdownPreview
              isRenderingInStepContainer
              source={stripImages(props.item.message.content)}
              itemIndex={props.index}
            />

            {isEmptyResponse && (
              <EmptyResponseDetails
                item={props.item}
                onRetry={handleEmptyResponseRetry}
              />
            )}
          </>
        )}
      </div>

      {/* Token badge row — always visible, aligned with text */}
      {props.leftSlot && (
        <div className="mt-1 flex items-center" style={{ paddingLeft: 14, paddingRight: 14 }}>
          {props.leftSlot}
        </div>
      )}
      {showResponseActions && (
        <div
          className={`mt-2 h-7 transition-opacity duration-300 ease-in-out ${isBeforeLatestSummary || isStreaming ? "opacity-35" : ""} ${isStreaming && "pointer-events-none cursor-not-allowed"}`}
        >
          <ResponseActions
            isTruncated={isTruncated}
            onDelete={onDelete}
            onFridayGeneration={onFridayGeneration}
            index={props.index}
            item={props.item}
            isLast={props.isLast}
            timestamp={props.timestamp}
            onFork={props.onFork}
          />
        </div>
      )}

      {/* Show compaction indicator for the latest summary */}
      {isLatestSummary && (
        <div className="mx-1.5 my-5">
          <div className="flex items-center">
            <div className="border-border flex-1 border-t border-solid"></div>
            <span className="text-description mx-3 text-xs">
              Previous Conversation Compacted
            </span>
            <div className="border-border flex-1 border-t border-solid"></div>
          </div>
        </div>
      )}

      {/* ConversationSummary is outside the dimmed container so it's always at full opacity */}
      <ConversationSummary item={props.item} index={props.index} />
    </div>
  );
}

/**
 * Collapsed diagnostic block shown when a turn produced no visible content.
 * It surfaces the raw model output (`completion`) and raw request (`prompt`)
 * that Friday persisted in `item.promptLogs`, so the user can see exactly what
 * the model returned (or confirm it returned nothing).
 */
function EmptyResponseDetails({
  item,
  onRetry,
}: {
  item: ChatHistoryItem;
  onRetry?: () => void;
}) {
  const logs = item.promptLogs ?? [];
  return (
    <div
      style={{
        margin: "8px 14px 0",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid var(--vscode-button-border, transparent)",
            background: "var(--vscode-button-background, #0e639c)",
            color: "var(--vscode-button-foreground, #ffffff)",
            fontSize: 12,
          }}
        >
          <ArrowPathIcon style={{ width: 14, height: 14 }} />
          重试 (Resend)
        </button>
      )}
      <details
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid var(--vscode-panel-border, #333)",
          background: "var(--vscode-editor-background, #1e1e1e)",
          fontSize: 12,
        }}
      >
      <summary style={{ cursor: "pointer", color: "#93c5fd", userSelect: "none" }}>
        查看模型原始返回 (Raw response)
      </summary>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {logs.length === 0 && (
          <span style={{ color: "var(--vscode-descriptionForeground)" }}>
            （没有捕获到原始返回数据）
          </span>
        )}
        {logs.map((log, i) => (
          <div key={i}>
            <div
              style={{
                color: "var(--vscode-descriptionForeground)",
                marginBottom: 2,
              }}
            >
              模型原始输出 (completion)：
            </div>
            {log.completion?.trim() ? (
              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  borderRadius: 6,
                  background:
                    "var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1))",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 260,
                  overflow: "auto",
                  fontFamily: "var(--vscode-editor-font-family, monospace)",
                }}
              >
                {log.completion}
              </pre>
            ) : (
              <em style={{ color: "var(--vscode-descriptionForeground)" }}>
                （模型确实没有返回任何文本内容）
              </em>
            )}
            <details style={{ marginTop: 6 }}>
              <summary
                style={{
                  cursor: "pointer",
                  color: "var(--vscode-descriptionForeground)",
                }}
              >
                原始请求 (prompt)
              </summary>
              <pre
                style={{
                  margin: "6px 0 0",
                  padding: 8,
                  borderRadius: 6,
                  background:
                    "var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1))",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 260,
                  overflow: "auto",
                  fontFamily: "var(--vscode-editor-font-family, monospace)",
                }}
              >
                {log.prompt}
              </pre>
            </details>
          </div>
        ))}
      </div>
      </details>
    </div>
  );
}
