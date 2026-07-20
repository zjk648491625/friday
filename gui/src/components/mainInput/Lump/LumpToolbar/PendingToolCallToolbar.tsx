import { ChevronUpIcon, EllipsisHorizontalIcon, ClockIcon, CheckBadgeIcon, ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks";
import { selectPendingToolCalls } from "../../../../redux/selectors/selectToolCalls";
import { callToolById } from "../../../../redux/thunks/callToolById";
import { cancelToolCallThunk } from "../../../../redux/thunks/cancelToolCall";
import { getMetaKeyLabel } from "../../../../util";
import { Button } from "../../../ui";
import { useMainEditor } from "../../TipTapEditor";
import { T } from "../../../../util/i18n";

type SessionAction = "always_allow" | "always_ask" | "block_1min";

interface SessionOverride {
  action: SessionAction;
  timestamp: number;
}

// Session-level overrides (component-life scoped, resets on reload)
const sessionOverrides = new Map<string, SessionOverride>();
const BLOCK_DURATION_MS = 60_000; // 1 minute

export const generateToolCallButtonTestId = (action: "accept" | "reject", toolCallId: string) =>
  `${action}-tool-call-button-${toolCallId}`;

export function PendingToolCallToolbar() {
  const dispatch = useAppDispatch();
  const pendingToolCalls = useAppSelector(selectPendingToolCalls);
  const editor = useMainEditor();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const processedRef = useRef<Set<string>>(new Set());

  // Auto-process pending tool calls based on session overrides
  useEffect(() => {
    const now = Date.now();
    for (const tc of pendingToolCalls) {
      if (processedRef.current.has(tc.toolCallId)) continue;
      const toolName = tc.tool?.function.name ?? "";
      const override = sessionOverrides.get(toolName);
      if (!override) continue;

      if (override.action === "always_allow") {
        processedRef.current.add(tc.toolCallId);
        void dispatch(callToolById({ toolCallId: tc.toolCallId }));
      } else if (override.action === "block_1min" && now - override.timestamp < BLOCK_DURATION_MS) {
        processedRef.current.add(tc.toolCallId);
        void dispatch(cancelToolCallThunk({ toolCallId: tc.toolCallId }));
      }
    }
  }, [pendingToolCalls, dispatch]);

  if (pendingToolCalls.length === 0) return null;

  const handleAccept = (toolCallId: string) => {
    void dispatch(callToolById({ toolCallId }));
  };

  const handleReject = (toolCallId: string) => {
    if (pendingToolCalls.length === 1) {
      editor.mainEditor?.commands.focus();
    }
    void dispatch(cancelToolCallThunk({ toolCallId }));
  };

  const handleSessionAction = (toolName: string, action: SessionAction, toolCallId: string) => {
    if (action === "always_allow") {
      sessionOverrides.set(toolName, { action, timestamp: Date.now() });
      void dispatch(callToolById({ toolCallId }));
    } else if (action === "block_1min") {
      sessionOverrides.set(toolName, { action, timestamp: Date.now() });
      void dispatch(cancelToolCallThunk({ toolCallId }));
    } else {
      // "always_ask" — reset to default (remove override)
      sessionOverrides.delete(toolName);
    }
    setOpenIdx(null);
  };

  return (
    <div className="flex w-full flex-col pb-0.5">
      {pendingToolCalls.map((tc, idx) => {
        const toolName = tc.tool?.function.name ?? "";
        const override = sessionOverrides.get(toolName);
        const isBlocked = override?.action === "block_1min"
          && Date.now() - override.timestamp < BLOCK_DURATION_MS;

        return (
          <div key={tc.toolCallId} className="border-input bg-input flex items-center gap-2 rounded border">
            <span className="text-description flex-1 truncate text-xs italic">
              {tc.tool?.displayTitle ?? tc.toolCall.function.name}
              {isBlocked && <span className="text-description-muted ml-1 text-[10px]">({T("blocked")})</span>}
            </span>

            <div className="flex items-center gap-1">
              {/* ⋮▴ dropdown: session-level controls */}
              {!isBlocked && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-description-muted my-1 gap-0.5 !px-1.5 font-medium"
                    onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                  >
                    <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
                    <ChevronUpIcon className="h-2.5 w-2.5" />
                  </Button>

                  {openIdx === idx && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenIdx(null)} />
                      <div
                        className="bg-vsc-input-background absolute right-0 top-full z-[200000] mt-1 flex w-max min-w-[160px] max-w-[400px] flex-col overflow-auto rounded-lg border border-command-border px-0 py-0.5 shadow-lg"
                      >
                        <button
                          type="button"
                          className="text-foreground hover:bg-gray-200/70 dark:hover:bg-gray-600/70 flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors first:rounded-t-md"
                          onClick={() => handleSessionAction(toolName, "always_allow", tc.toolCallId)}
                        >
                          <CheckBadgeIcon className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
                          <span className="flex-1 text-left">{T("Always allow this session")}</span>
                        </button>
                        <button
                          type="button"
                          className="text-foreground hover:bg-gray-200/70 dark:hover:bg-gray-600/70 flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors"
                          onClick={() => handleSessionAction(toolName, "always_ask", tc.toolCallId)}
                        >
                          <ChatBubbleLeftIcon className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
                          <span className="flex-1 text-left">{T("Ask each time")}</span>
                        </button>
                        <button
                          type="button"
                          className="text-foreground hover:bg-gray-200/70 dark:hover:bg-gray-600/70 flex w-full items-center gap-2 rounded-b-md px-2 py-1.5 text-xs transition-colors"
                          onClick={() => handleSessionAction(toolName, "block_1min", tc.toolCallId)}
                        >
                          <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                          <span className="flex-1 text-left">{T("Block for 1 minute")}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Reject (one-time) */}
              {!isBlocked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-description-muted my-1 font-medium hover:text-foreground"
                  onClick={() => handleReject(tc.toolCallId)}
                  data-testid={generateToolCallButtonTestId("reject", tc.toolCallId)}
                >
                  <span>{T("Reject")}</span>
                </Button>
              )}

              {/* Accept (one-time) */}
              {!isBlocked && (
                <Button
                  variant="primary"
                  size="sm"
                  className="my-1 font-medium text-foreground"
                  onClick={() => handleAccept(tc.toolCallId)}
                  data-testid={generateToolCallButtonTestId("accept", tc.toolCallId)}
                >
                  {idx === 0 && <span className="text-2xs mr-1">{getMetaKeyLabel()} + Enter</span>}
                  <span>{T("Accept")}</span>
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
