// Modified by Friday AI Team - Rebranded from Continue
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { vscForeground } from "../..";
import { ToolTip } from "../../gui/Tooltip";
import HoverItem from "../../mainInput/InputToolbar/HoverItem";
import { T } from "../../../util/i18n";

interface CreateFileButtonProps {
  onClick: () => void;
}

export function CreateFileButton({ onClick }: CreateFileButtonProps) {
  return (
    <ToolTip place="top" content={T("Create File with Code")}>
      <HoverItem className="!p-0">
        <button
          data-testid="codeblock-toolbar-create"
          className={`flex cursor-pointer items-center border-none bg-transparent pl-0 text-xs text-description outline-none hover:brightness-125`}
          onClick={onClick}
        >
          <div className="flex items-center gap-1">
            <DocumentPlusIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-1 select-none break-all">{T("Create file")}</span>
          </div>
        </button>
      </HoverItem>
    </ToolTip>
  );
}
