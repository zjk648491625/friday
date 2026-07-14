import { getAltKeyLabel, getMetaKeyLabel, isJetBrains } from "../../../../util";
import { GeneratingIndicator } from "./GeneratingIndicator";

interface StreamingToolbarProps {
  onStop: () => void;
  displayText?: string;
}

export function StreamingToolbar({
  onStop,
  displayText = "Stop",
}: StreamingToolbarProps) {
  const jetbrains = isJetBrains();

  return (
    <div className="flex w-full items-center justify-between">
      <GeneratingIndicator />
      <div
        onClick={onStop}
        className="cursor-pointer rounded px-2 py-1 hover:bg-[rgba(239,68,68,0.15)] transition-colors"
        style={{ fontSize: "13px", fontWeight: 600 }}
        title="停止当前任务"
      >
        <span style={{ color: "#f87171" }}>🛑 {displayText}</span>
        <span style={{ color: "var(--vscode-descriptionForeground)", fontSize: "10px", fontWeight: 400, marginLeft: 6, opacity: 0.6 }}>
          {jetbrains ? getAltKeyLabel() : getMetaKeyLabel()}⌫
        </span>
      </div>
    </div>
  );
}
