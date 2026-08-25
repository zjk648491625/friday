import { beforeEach, describe, expect, it } from "vitest";
import { SystemMessageToolCodeblocksFramework } from ".";
import { AssistantChatMessage, ChatMessage, PromptLog } from "../../..";
import { interceptSystemToolCalls } from "../interceptSystemToolCalls";

const BT = "```";

describe("interceptSystemToolCalls", () => {
  let abortController: AbortController;
  let framework = new SystemMessageToolCodeblocksFramework();

  beforeEach(() => {
    abortController = new AbortController();
  });

  const createAsyncGenerator = async function* (
    messages: ChatMessage[][],
  ): AsyncGenerator<ChatMessage[], PromptLog | undefined> {
    for (const messageGroup of messages) {
      yield messageGroup;
    }
    return undefined;
  };

  it("passes through non-assistant messages unchanged", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "user", content: "Hello" }],
      [{ role: "system", content: "System message" }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    let result = await generator.next();
    expect(result.value).toEqual([{ role: "user", content: "Hello" }]);

    result = await generator.next();
    expect(result.value).toEqual([
      { role: "system", content: "System message" },
    ]);

    result = await generator.next();
    expect(result.done).toBe(true);
  });

  it("passes through assistant messages with existing tool calls", async () => {
    const messages: ChatMessage[][] = [
      [
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              type: "function",
              function: {
                name: "existing_tool",
                arguments: '{"arg1":"value1"}',
              },
              id: "existing_call_id",
            },
          ],
        },
      ],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    const result = await generator.next();
    expect(result.value).toEqual(messages[0]);
  });

  it("passes through assistant messages with image URLs unchanged", async () => {
    const messages: ChatMessage[][] = [
      [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Here's an image:" },
            {
              type: "imageUrl",
              imageUrl: {
                url: "https://example.com/image.png",
              },
            },
          ],
        },
      ],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    const result = await generator.next();
    expect(result.value).toEqual(messages[0]);
  });

  it("processes standard tool call format", async () => {
    const messages: ChatMessage[][] = [
      [
        {
          role: "assistant",
          content: "I'll help you with that. Let me use a tool:\n",
        },
      ],
      [{ role: "assistant", content: "```tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: arg1\n" }],
      [{ role: "assistant", content: "value1\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: "```" }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    // First chunk should be normal text
    let result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I'll help you with that. Let me use a tool:",
          },
        ],
      },
    ]);

    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "\n",
          },
        ],
      },
    ]);

    // Tool name detection
    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function?.name,
    ).toBe("test_tool");

    // Begin argument
    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toContain('{"arg1":');

    // Argument value
    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe('"value1"');

    // End of tool call
    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe("}");
  });

  it("processes tool_name without codeblock format", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: "I'll help you with that.\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: arg1\n" }],
      [{ role: "assistant", content: "value1\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    // First chunk should be normal text
    let result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "I'll help you with that." }],
      },
    ]);

    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "\n",
          },
        ],
      },
    ]);

    // The system should detect the tool_name format and convert it
    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function?.name,
    ).toBe("test_tool");

    // Rest of processing should work as normal
    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe('{"arg1":');

    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe('"value1"');

    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe("}");
  });

  it("preserves content after a tool call", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: "```tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: arg1\n" }],
      [{ role: "assistant", content: "value1\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: "```\n" }],
      [{ role: "assistant", content: "This content should be preserved" }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    let result;
    // Process through all the tool call deltas (name, arg prefix, arg value, closing brace)
    for (let i = 0; i < 4; i++) {
      result = await generator.next();
    }

    // The trailing newline from "```\n" is yielded as text after the tool call ends
    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "\n" }],
      },
    ]);

    // The content after the tool call should be preserved
    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "This content should be preserved" }],
      },
    ]);
  });

  it("parses a tool call that appears mid-message and preserves trailing content", async () => {
    const messages: ChatMessage[][] = [
      [
        {
          role: "assistant",
          content:
            "Before tool\n```tool\nTOOL_NAME: test_tool\nBEGIN_ARG: arg1\nvalue1\nEND_ARG\n```\nAfter tool",
        },
      ],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    let result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "Before tool" }],
      },
    ]);

    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "\n" }],
      },
    ]);

    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function?.name,
    ).toBe("test_tool");

    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toContain('{"arg1":');

    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe('"value1"');

    result = await generator.next();
    expect(
      (result.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe("}");

    // The newline between the closing ``` and "After tool" is a separate chunk
    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "\n" }],
      },
    ]);

    result = await generator.next();
    expect(result.value).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "After tool" }],
      },
    ]);
  });

  it("stops processing when aborted", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: "```tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\n" }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    // Process the first part
    let result = await generator.next();

    // Abort before processing the second part
    abortController.abort();

    // The next value should be undefined
    result = await generator.next();
    expect(result.value).toBeUndefined();
  });

  it("handles JSON parsing for argument values", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: "```tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: number_arg\n" }],
      [{ role: "assistant", content: "123\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: boolean_arg\n" }],
      [{ role: "assistant", content: "true\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: "```" }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    // Skip to number arg end
    await generator.next();
    await generator.next();
    let result;
    result = await generator.next();

    expect(
      (result?.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe("123");

    // Skip to boolean arg end
    await generator.next();
    result = await generator.next();

    expect(
      (result?.value as AssistantChatMessage[])[0].toolCalls?.[0].function
        ?.arguments,
    ).toBe("true");
  });
// ---- Regression tests: CRLF, keyword-in-value, content preservation ----

  it("parses tool calls streamed with Windows CRLF line endings", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: "I'll read that.\r\n" }],
      [{ role: "assistant", content: BT + "tool\r\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\r\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: arg1\r\n" }],
      [{ role: "assistant", content: "value1\r\n" }],
      [{ role: "assistant", content: "END_ARG\r\n" }],
      [{ role: "assistant", content: BT }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    const deltas: any[] = [];
    let result = await generator.next();
    while (!result.done) {
      for (const msg of result.value as AssistantChatMessage[]) {
        if (msg.toolCalls?.length) deltas.push(msg.toolCalls[0].function);
        else if (typeof (msg as any).content === "string") {
          // no plain-string content expected inside the tool block
        }
      }
      result = await generator.next();
    }

    const name = deltas.find((d) => d.name)?.name;
    expect(name).toBe("test_tool");
    const args = deltas.map((d) => d.arguments ?? "").join("");
    expect(JSON.parse(args)).toEqual({ arg1: "value1" });
  });

  it("does not terminate an argument when its value contains END_ARG", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: BT + "tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME: test_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: code\n" }],
      [{ role: "assistant", content: 'const s = "END_ARG";\n' }],
      [{ role: "assistant", content: "// more code\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: BT }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    const deltas: any[] = [];
    let result = await generator.next();
    while (!result.done) {
      for (const msg of result.value as AssistantChatMessage[]) {
        if (msg.toolCalls?.length) deltas.push(msg.toolCalls[0].function);
      }
      result = await generator.next();
    }

    const args = deltas.map((d) => d.arguments ?? "").join("");
    expect(JSON.parse(args)).toEqual({
      code: 'const s = "END_ARG";\n// more code',
    });
  });

  it("parses tool calls that use full-width colons", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: BT + "tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME\uff1atest_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG\uff1aarg1\n" }],
      [{ role: "assistant", content: "value1\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: BT }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
    );

    const deltas: any[] = [];
    let result = await generator.next();
    while (!result.done) {
      for (const msg of result.value as AssistantChatMessage[]) {
        if (msg.toolCalls?.length) deltas.push(msg.toolCalls[0].function);
      }
      result = await generator.next();
    }

    const name = deltas.find((d) => d.name)?.name;
    expect(name).toBe("test_tool");
    const args = deltas.map((d) => d.arguments ?? "").join("");
    expect(JSON.parse(args)).toEqual({ arg1: "value1" });
  });

  it("preserves already-consumed text when discarding a hallucinated tool name", async () => {
    const messages: ChatMessage[][] = [
      [{ role: "assistant", content: "Working on it...\n" }],
      [{ role: "assistant", content: BT + "tool\n" }],
      [{ role: "assistant", content: "TOOL_NAME: fake_hallucinated_tool\n" }],
      [{ role: "assistant", content: "BEGIN_ARG: x\n" }],
      [{ role: "assistant", content: "1\n" }],
      [{ role: "assistant", content: "END_ARG\n" }],
      [{ role: "assistant", content: BT }],
    ];

    const generator = interceptSystemToolCalls(
      createAsyncGenerator(messages),
      abortController,
      framework,
      ["test_tool"], // known tools — fake_hallucinated_tool is not among them
    );

    const texts: string[] = [];
    let result = await generator.next();
    while (!result.done) {
      for (const msg of result.value as AssistantChatMessage[]) {
        const parts = Array.isArray(msg.content)
          ? msg.content
          : [{ type: "text", text: String((msg as any).content ?? "") }];
        for (const part of parts as any[]) {
          if (part.type === "text") texts.push(part.text);
        }
      }
      result = await generator.next();
    }

    const all = texts.join("");
    expect(all).toContain("Working on it...");
    // The consumed portion of the discarded block must NOT be swallowed
    expect(all).toContain(BT + "tool");
    expect(all).toContain("fake_hallucinated_tool");
    expect(all).toContain("END_ARG");
  });
});