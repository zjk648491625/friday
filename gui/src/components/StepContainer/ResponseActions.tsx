import {
  ArrowsPointingInIcon,
  BarsArrowDownIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { ChatHistoryItem } from "core";
import { renderChatMessage } from "core/util/messageContent";
import type { ReactNode } from "react";
import { useAppSelector } from "../../redux/hooks";
import { useCompactConversation } from "../../util/compactConversation";
import { FeedbackButtons } from "../FeedbackButtons";
import { CopyIconButton } from "../gui/CopyIconButton";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";
import { T } from "../../util/i18n";
import ShareButton from "./ShareButton";

function ForkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="5" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M12 17 V11" />
      <path d="M12 11 L6.5 6.5" />
      <path d="M12 11 L17.5 6.5" />
    </svg>
  );
}

export interface ResponseActionsProps {
  isTruncated: boolean;
  onFridayGeneration: () => void;
  index: number;
  onDelete: () => void;
  item: ChatHistoryItem;
  isLast: boolean;
  timestamp?: number;
  leftSlot?: ReactNode;
  onFork?: (index: number) => void;
}

export default function ResponseActions({
  onFridayGeneration,
  index,
  item,
  isTruncated,
  onDelete,
  timestamp,
  isLast,
  leftSlot,
  onFork,
}: ResponseActionsProps) {
  const contextPercentage = useAppSelector(
    (state) => state.session.contextPercentage,
  );
  const isPruned = useAppSelector((state) => state.session.isPruned);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);

  const percent = Math.round((contextPercentage ?? 0) * 100);
  const buttonColorClass =
    isLast && (isPruned || percent > 80)
      ? "text-warning"
      : "text-description-muted";

  const showLabel = isLast && (isPruned || percent >= 60);

  const compactConversation = useCompactConversation();

  return (
    <div className="text-description-muted mx-2 flex cursor-default items-center justify-between bg-transparent pb-0 text-xs">
      <div className="flex-1">{leftSlot}</div>
      <div className="flex items-center space-x-1">
        {timestamp && (
          <span className="mr-2 text-[10px] text-gray-500">
            {new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <HeaderButtonWithToolTip
          testId={`compact-button-${index}`}
          text={
            showLabel
              ? T("Summarize conversation to reduce context length")
              : T("Compact conversation")
          }
          tabIndex={-1}
          onClick={() => compactConversation(index)}
        >
          <div className="flex items-center space-x-1">
            <ArrowsPointingInIcon
              className={`h-3.5 w-3.5 ${buttonColorClass || "text-description-muted"}`}
            />
            {showLabel && (
              <span
                className={`text-xs ${buttonColorClass || "text-description-muted"}`}
              >
                {T("Compact conversation")}
              </span>
            )}
          </div>
        </HeaderButtonWithToolTip>

        {isTruncated && (
          <HeaderButtonWithToolTip
            tabIndex={-1}
            text={T("Continue generation")}
            onClick={onFridayGeneration}
          >
            <BarsArrowDownIcon className="text-description-muted h-3.5 w-3.5" />
          </HeaderButtonWithToolTip>
        )}

        <HeaderButtonWithToolTip
          testId={`delete-button-${index}`}
          text={T("Delete")}
          tabIndex={-1}
          onClick={onDelete}
        >
          <TrashIcon className="text-description-muted h-3.5 w-3.5" />
        </HeaderButtonWithToolTip>

        {item.message.role === "assistant" && onFork && !isStreaming && (
          <HeaderButtonWithToolTip
            testId={`fork-button-${index}`}
            text={T("Fork this conversation from here")}
            tabIndex={-1}
            onClick={() => onFork(index)}
          >
            <ForkIcon className="text-description-muted h-3.5 w-3.5" />
          </HeaderButtonWithToolTip>
        )}

        <CopyIconButton
          tabIndex={-1}
          text={renderChatMessage(item.message)}
          clipboardIconClassName="h-3.5 w-3.5 text-description-muted"
          checkIconClassName="h-3.5 w-3.5 text-success"
        />

        <FeedbackButtons item={item} />

        <ShareButton index={index} />
      </div>
    </div>
  );
}
