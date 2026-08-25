import { ToolCallDelta } from "../../..";
import { createDelta } from "../systemToolUtils";
import { ToolCallParseState } from "../types";

/*
  Efficiently applies chunks to a tool call state as they come in
  Expects chunks to be broken so that new lines and codeblocks are alone
  For now, this parser collects entire arg before
  This is because support for JSON booleans is tricky otherwise
*/

// Structural tag lines must match the WHOLE line. Substring matching made any
// arg value that merely CONTAINS "END_ARG"/"BEGIN_ARG:" (e.g. code samples)
// prematurely terminate the argument and corrupt the generated JSON.
const END_ARG_LINE = /^end_?arg\s*$/i;
const BEGIN_ARG_LINE = /^begin_?arg\s*[:\uff1a]/i;
// Tolerate full-width colons (\uff1a) which Chinese-localized models emit often
const TOOL_NAME_SPLIT = /tool_?name\s*[:\uff1a]/i;
const BEGIN_ARG_SPLIT = /begin_?arg\s*[:\uff1a]/i;

export function handleToolCallBuffer(
  chunk: string,
  state: ToolCallParseState,
): ToolCallDelta | undefined {
  // Add chunks
  const lineIndex = state.currentLineIndex;
  if (!state.lineChunks[lineIndex]) {
    state.lineChunks[lineIndex] = [];
  }
  state.lineChunks[lineIndex].push(chunk);

  const isNewLine = chunk === "\n";
  if (isNewLine) {
    state.currentLineIndex++;
  }

  const line = state.lineChunks[lineIndex].join("");

  switch (lineIndex) {
    // The first line will be skipped (e.g. ```tool\n)
    case 0:
      // non-standard start sequences will sometimes include stuff in the tool_name line
      const splitBuffer = line.split("\n");
      if (splitBuffer[0]) {
        state.lineChunks[0] = [splitBuffer[0], "\n"];
      }
      if (splitBuffer[1]) {
        state.lineChunks[1] = [splitBuffer[1]];
      }

      state.currentLineIndex = 1;
    // Tool name line - process once line 2 is reached
    case 1:
      if (isNewLine) {
        const name = (line.split(TOOL_NAME_SPLIT)[1] ?? "").trim();
        if (!name) {
          throw new Error("Invalid tool name");
        }
        return createDelta(name, "", state.toolCallId);
      }
      return;
    default:
      if (state.isWithinArgStart) {
        if (isNewLine) {
          const argName = (line.split(BEGIN_ARG_SPLIT)[1] ?? "").trim();
          if (!argName) {
            throw new Error("Invalid begin arg line");
          }
          state.currentArgName = argName;
          state.isWithinArgStart = false;
          const argPrefix = state.processedArgNames.size === 0 ? "{" : ",";
          return createDelta("", `${argPrefix}"${argName}":`, state.toolCallId);
        }
      } else if (state.currentArgName) {
        if (isNewLine) {
          // Anchored match: only a bare END_ARG line closes the argument,
          // not a value line that merely contains the keyword
          const isEndArgTag = END_ARG_LINE.test(line);
          if (isEndArgTag) {
            let trimmedValue = state.currentArgChunks.join("").trim();
            state.currentArgChunks.length = 0;
            state.processedArgNames.add(state.currentArgName);
            state.currentArgName = undefined;

            try {
              if (
                trimmedValue.startsWith("[") ||
                trimmedValue.startsWith("{")
              ) {
                trimmedValue = trimmedValue.replace(
                  /"((?:\\[\s\S]|[^"\\])*?)"/g,
                  (match) => {
                    const content = match.slice(1, -1);
                    // Replace unescaped newlines
                    return (
                      '"' +
                      content
                        .replace(/([^\\])\n/g, "$1\\n")
                        .replace(/^\n/g, "\\n") +
                      '"'
                    );
                  },
                );
              }
              const parsed = JSON.parse(trimmedValue);
              const stringifiedArg = JSON.stringify(parsed);
              return createDelta("", stringifiedArg, state.toolCallId);
            } catch (e) {
              const stringifiedArg = JSON.stringify(trimmedValue);
              return createDelta("", stringifiedArg, state.toolCallId);
            }
          } else {
            state.currentArgChunks.push(line);
          }
        }
      } else {
        // Check for entry into arg (anchored to whole line)
        const isBeginArgLine = BEGIN_ARG_LINE.test(line);
        if (isBeginArgLine) {
          state.isWithinArgStart = true;
        }

        // Check for exit
        if (line === "```" || isNewLine) {
          state.done = true;
          // finish args JSON if applicable
          if (state.processedArgNames.size > 0) {
            return createDelta("", "}", state.toolCallId);
          }
        }
      }
  }
}
