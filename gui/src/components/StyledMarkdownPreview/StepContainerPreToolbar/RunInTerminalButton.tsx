// Modified by Friday AI Team - Rebranded from Continue
import { CommandLineIcon } from "@heroicons/react/24/outline";
import { useContext } from "react";
import { lightGray, vscForeground } from "../..";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { extractCommand } from "../utils/commandExtractor";

interface RunInTerminalButtonProps {
  command: string;
}

export function RunInTerminalButton({ command }: RunInTerminalButtonProps) {
  const ideMessenger = useContext(IdeMessengerContext);

  function runInTerminal() {
    // Extract just the command line
    const extractedCommand = extractCommand(command);
    void ideMessenger.post("runCommand", { command: extractedCommand });
  }

  return (
    <div
      className={`flex cursor-pointer items-center border-none bg-transparent text-xs text-description outline-none hover:brightness-125`}
      onClick={runInTerminal}
    >
      <div
        className="max-2xs:hidden flex items-center gap-1 transition-colors duration-200 hover:brightness-125"
        style={{ color: lightGray }}
      >
        <>
          <CommandLineIcon className="h-3 w-3 hover:brightness-125" />
          <span className="max-sm:hidden">Run</span>
        </>
      </div>
    </div>
  );
}
