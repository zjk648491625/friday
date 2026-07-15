import {
  AtSymbolIcon,
  LightBulbIcon as LightBulbIconOutline,
  PhotoIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { LightBulbIcon as LightBulbIconSolid } from "@heroicons/react/24/solid";
import { InputModifiers } from "core";
import {
  modelSupportsImages,
  modelSupportsReasoning,
} from "core/llm/autodetect";
import { memo, useContext, useRef } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { selectUseActiveFile } from "../../redux/selectors";
import { selectSelectedChatModel } from "../../redux/slices/configSlice";
import { setHasReasoningEnabled } from "../../redux/slices/sessionSlice";
import { setReasoningSetting } from "../../redux/slices/uiSlice";
import { exitEdit } from "../../redux/thunks/edit";
import { getMetaKeyLabel, isMetaEquivalentKeyPressed } from "../../util";
import { usePromptOptimizer } from "../../hooks/usePromptOptimizer";
import { ToolTip } from "../gui/Tooltip";
import ModelSelect from "../modelSelection/ModelSelect";
import { ModeSelect } from "../ModeSelect";
import { Button } from "../ui";
import { useFontSize } from "../ui/font";
import ContextStatus from "./ContextStatus";
import HoverItem from "./InputToolbar/HoverItem";
import { T } from "../../util/i18n";

export interface ToolbarOptions {
  hideUseCodebase?: boolean;
  hideImageUpload?: boolean;
  hideAddContext?: boolean;
  enterText?: string;
  hideSelectModel?: boolean;
}

interface InputToolbarProps {
  onEnter?: (modifiers: InputModifiers) => void;

  onImageFileSelected?: (file: File) => void;
  onOptimizePrompt?: () => void;
  isOptimizing?: boolean;
  hidden?: boolean;
  activeKey: string | null;
  toolbarOptions?: ToolbarOptions;
  disabled?: boolean;
  isMainInput?: boolean;
}

function InputToolbar(props: InputToolbarProps) {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const defaultModel = useAppSelector(selectSelectedChatModel);
  const useActiveFile = useAppSelector(selectUseActiveFile);
  const isInEdit = useAppSelector((store) => store.session.isInEdit);
  const codeToEdit = useAppSelector((store) => store.editModeState.codeToEdit);
  const hasReasoningEnabled = useAppSelector(
    (store) => store.session.hasReasoningEnabled,
  );
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const isEnterDisabled =
    props.disabled || (isInEdit && codeToEdit.length === 0);

  const supportsImages =
    defaultModel &&
    modelSupportsImages(
      defaultModel.provider,
      defaultModel.model,
      defaultModel.title,
      defaultModel.capabilities,
    );

  const supportsReasoning = modelSupportsReasoning(defaultModel);

  const smallFont = useFontSize(-2);
  const tinyFont = useFontSize(-3);

  return (
    <>
      <div
        onClick={props.onClick}
        className={`find-widget-skip bg-vsc-input-background flex select-none flex-row items-center justify-between gap-1 pt-1 ${props.hidden ? "pointer-events-none h-0 cursor-default opacity-0" : "pointer-events-auto mt-2 cursor-text opacity-100"}`}
        style={{
          fontSize: smallFont,
        }}
      >
        <div className="xs:gap-1.5 flex flex-row items-center gap-1">
          {!isInEdit && (
            <ToolTip place="top" content={T("Select Mode")}>
              <HoverItem className="!p-0">
                <ModeSelect />
              </HoverItem>
            </ToolTip>
          )}
          <ToolTip place="top" content={T("Select Model")}>
            <HoverItem className="!p-0">
              <ModelSelect />
            </HoverItem>
          </ToolTip>
          <div className="xs:flex text-description -mb-1 hidden items-center transition-colors duration-200">
            {props.toolbarOptions?.hideImageUpload ||
              (supportsImages && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept=".jpg,.jpeg,.png,.gif,.svg,.webp"
                    onChange={(e) => {
                      const files = e.target?.files ?? [];
                      for (const file of files) {
                        props.onImageFileSelected?.(file);
                      }
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  />

                  <ToolTip place="top" content={T("Attach Image")}>
                    <HoverItem className="">
                      <PhotoIcon
                        className="h-3 w-3 hover:brightness-125"
                        onClick={(e) => {
                          fileInputRef.current?.click();
                        }}
                      />
                    </HoverItem>
                  </ToolTip>
                </>
              ))}
            {props.toolbarOptions?.hideAddContext || (
              <ToolTip place="top" content={T("Attach Context")}>
                <HoverItem onClick={props.onAddContextItem}>
                  <AtSymbolIcon className="h-3 w-3 hover:brightness-125" />
                </HoverItem>
              </ToolTip>
            )}
            {supportsReasoning && (
              <HoverItem
                onClick={() => {
                  dispatch(setHasReasoningEnabled(!hasReasoningEnabled));
                  if (defaultModel?.title) {
                    dispatch(
                      setReasoningSetting({
                        modelTitle: defaultModel.title,
                        enabled: !hasReasoningEnabled,
                      }),
                    );
                  }
                }}
              >
                <ToolTip
                  place="top"
                  content={
                    hasReasoningEnabled
                      ? T("Disable model reasoning")
                      : T("Enable model reasoning")
                  }
                >
                  {hasReasoningEnabled ? (
                    <LightBulbIconSolid className="h-3 w-3 brightness-200 hover:brightness-150" />
                  ) : (
                    <LightBulbIconOutline className="h-3 w-3 hover:brightness-150" />
                  )}
                </ToolTip>
              </HoverItem>
            )}
          </div>
        </div>

        <div
          className="text-description flex min-w-0 items-center gap-2 whitespace-nowrap overflow-hidden"
          style={{
            fontSize: tinyFont,
          }}
        >
          {!isInEdit && <ContextStatus />}
          {props.onOptimizePrompt && props.isMainInput && (
            <ToolTip place="top" content={props.isOptimizing ? T("Optimizing...") : T("Optimize Prompt")}>
              <Button
                variant="ghost"
                size="sm"
                onClick={props.isOptimizing ? undefined : props.onOptimizePrompt}
                disabled={props.isOptimizing}
                className="hover:enabled:text-foreground my-0 h-6 px-2 py-0"
              >
                <SparklesIcon className={`h-4 w-4 ${props.isOptimizing ? "animate-pulse text-blue-400" : "text-description-muted hover:brightness-150"}`} />
              </Button>
            </ToolTip>
          )}
          
          {isInEdit && (
            <HoverItem
              className="hidden hover:underline sm:flex"
              onClick={async () => {
                void dispatch(exitEdit({}));
                ideMessenger.post("focusEditor", undefined);
              }}
            >
              <span>{T("Esc to exit Edit")}</span>
            </HoverItem>
          )}
          <ToolTip place="top" content={isStreaming ? T("加入队列 (⏎)") : T("Send (⏎)")}>
            <Button
              variant={isStreaming ? "secondary" : (props.isMainInput ? "primary" : "secondary")}
              size="sm"
              data-testid="submit-input-button"
              className={isStreaming ? "!bg-[rgba(245,158,11,0.15)] !text-[#fbbf24] hover:!bg-[rgba(245,158,11,0.25)]" : ""}
              onClick={() => {
                if (props.onEnter) {
                  props.onEnter({ useCodebase: false, noContext: false });
                }
              }}
              disabled={isEnterDisabled}
            >
              <span className="hidden md:inline">
                {isStreaming ? (
                  <>📥 {T("入队")}</>
                ) : (
                  <>⏎ {props.toolbarOptions?.enterText ?? T("Enter")}</>
                )}
              </span>
              <span className="md:hidden">{isStreaming ? "📥" : "⏎"}</span>
            </Button>
          </ToolTip>
        </div>
      </div>
    </>
  );
}

function shallowToolbarOptionsEqual(a?: ToolbarOptions, b?: ToolbarOptions) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.hideAddContext === b.hideAddContext &&
    a.hideImageUpload === b.hideImageUpload &&
    a.hideUseCodebase === b.hideUseCodebase &&
    a.hideSelectModel === b.hideSelectModel &&
    a.enterText === b.enterText
  );
}

export default memo(
  InputToolbar,
  (prev, next) =>
    prev.hidden === next.hidden &&
    prev.disabled === next.disabled &&
    prev.isMainInput === next.isMainInput &&
    prev.activeKey === next.activeKey &&
    prev.isOptimizing === next.isOptimizing &&
    shallowToolbarOptionsEqual(prev.toolbarOptions, next.toolbarOptions),
);
