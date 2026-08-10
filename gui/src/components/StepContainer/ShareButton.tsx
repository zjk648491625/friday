import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  ArrowUpOnSquareIcon,
  Bars3BottomLeftIcon,
  DocumentTextIcon,
  LinkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { vscCommandCenterInactiveBorder } from "..";
import { useShareSession, type ShareAction } from "../../hooks/useShareSession";
import { T, Tfmt } from "../../util/i18n";
import type { ShareScope } from "../../util/shareSession";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";

interface ShareButtonProps {
  index: number;
  testId?: string;
}

interface ShareMenuItemProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function ShareMenuItem({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: ShareMenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-foreground flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs ${
        disabled
          ? "cursor-default opacity-50"
          : "hover:bg-list-active hover:text-list-active-foreground cursor-pointer"
      }`}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-description-muted text-[10px]">{hint}</span>}
    </button>
  );
}

export default function ShareButton({ index, testId }: ShareButtonProps) {
  const { share, isSummarizing, countItems } = useShareSession();

  // B 方案：不提供范围选择界面，默认取「当前会话截至该条」。
  // 后续支持选择/过滤历史会话时，只需换掉这里的 scope，下游渲染完全复用。
  const scope: ShareScope = { kind: "upToIndex", index };
  const count = countItems(scope);

  const run = async (action: ShareAction, close: () => void) => {
    if (action === "summary") {
      // 总结要等模型返回，保持面板打开以展示 loading
      await share(action, scope);
      close();
      return;
    }
    close();
    void share(action, scope);
  };

  return (
    <Popover className="relative">
      <PopoverButton as="div" className="flex items-center">
        <HeaderButtonWithToolTip
          testId={testId ?? `share-button-${index}`}
          text={T("Share conversation")}
          tabIndex={-1}
        >
          <ArrowUpOnSquareIcon className="text-description-muted h-3.5 w-3.5" />
        </HeaderButtonWithToolTip>
      </PopoverButton>

      <PopoverPanel
        anchor="bottom end"
        className="bg-vsc-input-background flex w-max min-w-[180px] flex-col overflow-hidden py-1"
        style={{
          border: `1px solid ${vscCommandCenterInactiveBorder}`,
          borderRadius: "0.5rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)",
          zIndex: 200000,
        }}
      >
        {({ close }) => (
          <>
            <div className="text-description-muted px-3 pb-1 pt-0.5 text-[10px]">
              {Tfmt("Up to here · {count} messages", { count: String(count) })}
            </div>

            <ShareMenuItem
              icon={<DocumentTextIcon className="h-3.5 w-3.5" />}
              label={T("Copy as Markdown")}
              onClick={() => void run("markdown", close)}
            />
            <ShareMenuItem
              icon={<Bars3BottomLeftIcon className="h-3.5 w-3.5" />}
              label={T("Copy as plain text")}
              onClick={() => void run("plaintext", close)}
            />
            <ShareMenuItem
              icon={<LinkIcon className="h-3.5 w-3.5" />}
              label={T("Online link")}
              hint={T("Coming soon")}
              disabled
            />
            <ShareMenuItem
              icon={
                isSummarizing ? (
                  <div className="border-description-muted h-3 w-3 animate-spin rounded-full border border-solid border-t-transparent" />
                ) : (
                  <SparklesIcon className="h-3.5 w-3.5" />
                )
              }
              label={isSummarizing ? T("Generating summary...") : T("AI summary")}
              disabled={isSummarizing}
              onClick={() => void run("summary", close)}
            />
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
