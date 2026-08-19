import { ChatMessage, PromptLog, TextMessagePart } from "../..";
import { normalizeToMessageParts } from "../../util/messageContent";
import { detectToolCallStart } from "./detectToolCallStart";
import { createDelta, splitAtCodeblocksAndNewLines } from "./systemToolUtils";
import {
  getInitialToolCallParseState,
  SystemMessageToolsFramework,
  ToolCallParseState,
} from "./types";

/*
    Function to intercept tool calls in markdown code blocks format from a chat message stream
    1. Skips non-assistant messages
    2. Intercepts text that looks like a tool call in a markdown code block format:
    ```tool
    TOOL_NAME: example_tool
    BEGIN_ARG: arg1
    value
    END_ARG
    ```
    3. Parses tool calls line by line and generates proper tool call deltas
    4. Once the tool call is complete, resets state for potential future tool calls
*/
export async function* interceptSystemToolCalls(
  messageGenerator: AsyncGenerator<ChatMessage[], PromptLog | undefined>,
  abortController: AbortController,
  systemToolFramework: SystemMessageToolsFramework,
  knownToolNames?: string[],
): AsyncGenerator<ChatMessage[], PromptLog | undefined> {
  let buffer = "";
  let parseState: ToolCallParseState | undefined;
  let toolNameParsed = false;

  while (true) {
    const result = await messageGenerator.next();
    if (result.done) {
      // Case: non-standard tool termination causes hanging args
      if (parseState && !parseState.done && parseState.processedArgNames.size) {
        yield [
          {
            role: "assistant",
            content: "",
            toolCalls: [createDelta("", "}", parseState.toolCallId)],
          },
        ];
      }

      return result.value;
    } else {
      for await (const message of result.value) {
        if (abortController.signal.aborted) {
          break;
        }
        // Skip non-assistant messages or messages with native tool calls
        if (message.role !== "assistant" || message.toolCalls) {
          yield [message];
          continue;
        }

        const parts = normalizeToMessageParts(message);

        // Image output cannot be combined with tools
        if (parts.find((part) => part.type === "imageUrl")) {
          yield [message];
          continue;
        }

        const chunks = (parts as TextMessagePart[])
          .map((part) => splitAtCodeblocksAndNewLines(part.text))
          .flat();

        for (const chunk of chunks) {
          buffer += chunk;
          if (!parseState) {
            const { isInPartialStart, isInToolCall, modifiedBuffer } =
              detectToolCallStart(buffer, systemToolFramework);

            if (isInPartialStart) {
              continue;
            }
            if (isInToolCall) {
              parseState = getInitialToolCallParseState();
              toolNameParsed = false;
              buffer = modifiedBuffer;
            }
          }

          if (parseState && !parseState.done) {
            let delta: any;
            try {
              delta = systemToolFramework.handleToolCallBuffer(
                buffer,
                parseState,
              );
            } catch (e) {
              // Malformed tool call (e.g. AI hallucinated END_ARG/BEGIN_ARG in text)
              // Discard the broken parse state and yield buffer as normal content
              console.warn(
                "[interceptSystemToolCalls] tool call parse error, resetting:",
                (e as Error).message,
              );
              parseState = undefined;
              toolNameParsed = false;
              yield [
                {
                  ...message,
                  content: [{ type: "text", text: buffer }],
                },
              ];
              buffer = "";
              continue;
            }
            // Track if we've successfully parsed a tool name
            if (delta && delta.function?.name && !toolNameParsed) {
              toolNameParsed = true;
            }
            if (delta) {
              // Validate tool name against known tools — if AI hallucinated
              // a tool block (e.g. in a plan), discard it as normal text
              if (
                knownToolNames?.length &&
                delta.function?.name &&
                !knownToolNames.includes(delta.function.name)
              ) {
                console.warn("[interceptSystemToolCalls] unknown tool:", delta.function.name, "discarding fake tool call");
                parseState = undefined;
                toolNameParsed = false;
                yield [
                  {
                    ...message,
                    content: [{ type: "text", text: buffer }],
                  },
                ];
                buffer = "";
                continue;
              }
              // Additional protection: if we completed a tool call (parseState.done)
              // but never successfully parsed a tool name, it's likely a false positive
              if (parseState.done && !toolNameParsed) {
                console.warn("[interceptSystemToolCalls] completed tool call without valid tool name, discarding");
                parseState = undefined;
                toolNameParsed = false;
                yield [
                  {
                    ...message,
                    content: [{ type: "text", text: buffer }],
                  },
                ];
                buffer = "";
                continue;
              }
              yield [
                {
                  ...message,
                  content: "",
                  toolCalls: [delta],
                },
              ];
            }
            // Completed tool calls should not terminate parsing for subsequent
            // chunks/messages; reset state so normal content (or another tool
            // call) can be handled.
            if (parseState.done) {
              parseState = undefined;
              toolNameParsed = false;
            }
          } else {
            // Yield normal assistant message
            yield [
              {
                ...message,
                content: [{ type: "text", text: buffer }],
              },
            ];
          }
          buffer = "";
        }
      }
    }
  }
}
