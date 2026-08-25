import { Tool, ToolCallState } from "../../..";
import { SystemMessageToolsFramework } from "../types";
import { handleToolCallBuffer } from "./parseSystemToolCall";

export class SystemMessageToolCodeblocksFramework
  implements SystemMessageToolsFramework
{
  acceptedToolCallStarts: [string, string][] = [
    ["```tool\n", "```tool\n"],
    // Non-standard but observed in the wild: the model skips the codeblock
    // fence and starts directly with the tool-name line. Normalize it into
    // the canonical shape so the parser can take over from there.
    ["tool_name:", "```tool\ntool_name:"],
  ];

  toolCallStateToSystemToolCall(state: ToolCallState): string {
    let parts = ["```tool"];
    parts.push(`TOOL_NAME: ${state.toolCall.function.name}`);
    try {
      for (const arg in state.parsedArgs) {
        parts.push(`BEGIN_ARG: ${arg}`);
        parts.push(JSON.stringify(state.parsedArgs[arg]));
        parts.push(`END_ARG`);
      }
    } catch (e) {
      console.log("Failed to stringify json args", state.parsedArgs);
    }
    // TODO - include tool call id for parallel. Confuses dumb models
    parts.push("```");
    return parts.join("\n");
  }

  handleToolCallBuffer = handleToolCallBuffer;

  toolToSystemToolDefinition(tool: Tool): string {
    let toolDefinition = `\`\`\`tool_definition\nTOOL_NAME: ${tool.function.name}\n`;

    if (tool.function.description) {
      toolDefinition += `TOOL_DESCRIPTION:\n${tool.function.description}\n`;
    }

    if (tool.function.parameters && "properties" in tool.function.parameters) {
      for (const [key, value] of Object.entries(
        tool.function.parameters.properties as object,
      )) {
        const isRequired = tool.function.parameters.required?.includes(key);
        const requiredText = isRequired ? "required" : "optional";

        let argType = "string";
        if ("type" in value) {
          argType = value.type;
        }
        let argDescription = "";
        if ("description" in value) {
          argDescription = value.description;
        }

        toolDefinition += `TOOL_ARG: ${key} (${argType}, ${requiredText})\n`;
        if (argDescription) {
          toolDefinition += argDescription + "\n";
        }
        toolDefinition += `END_ARG\n`;
      }
    }

    toolDefinition += `\`\`\``;
    return toolDefinition.trim();
  }

  systemMessagePrefix = `To call a tool, respond with EXACTLY the format shown below. Do not use XML, JSON, or any other format. Only call tools listed above — do not invent or guess tool names. Every "required" argument MUST have a real value between BEGIN_ARG and END_ARG — leaving it empty will cause an error.`;

  systemMessageSuffix = `RULES FOR TOOL USE:
1. NEVER use XML, JSON, or any other format — ONLY the tool code block format shown above.
2. Tool call MUST be the last thing in your response. Stop immediately after the closing fence. Only call ONE tool at a time.
3. CRITICAL: NEVER use the keywords END_ARG, BEGIN_ARG, TOOL_NAME, or TOOL_ARG in any text — these are ONLY for actual tool call code blocks. Violating this will break the system.
4. CRITICAL: ALL required arguments MUST have a non-empty value between BEGIN_ARG and END_ARG. Empty or whitespace-only arguments will cause errors.
5. If codebaseTool fails because LanceDB is missing, use runTerminalCommand to install dependencies (e.g., npm install, pip install, download native addons).`;

  exampleDynamicToolDefinition = `
\`\`\`tool_definition
TOOL_NAME: example_tool
TOOL_ARG: arg_1 (string, required)
Description of the first argument
END_ARG
TOOL_ARG: arg_2 (number, optional)
END_ARG
\`\`\``.trim();

  exampleDynamicToolCall = `
\`\`\`tool
TOOL_NAME: example_tool
BEGIN_ARG: arg_1
The value
of arg 1
END_ARG
BEGIN_ARG: arg_2
3
END_ARG
\`\`\``.trim();

  createSystemMessageExampleCall(
    toolName: string,
    prefix: string,
    exampleArgs: Array<[string, string | number]> = [],
  ) {
    let callExample = `\`\`\`tool
TOOL_NAME: ${toolName}`;

    // Add each argument dynamically
    for (const [argName, argValue] of exampleArgs) {
      callExample += `
BEGIN_ARG: ${argName}
${argValue}
END_ARG`;
    }

    callExample += `
\`\`\``;

    return `${prefix.trim()}
${callExample}`;
  }
}
