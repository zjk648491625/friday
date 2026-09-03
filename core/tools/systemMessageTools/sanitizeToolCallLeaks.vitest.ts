import { describe, expect, it } from "vitest";
import {
  normalizeKimiToolName,
  parseKimiToolCallSection,
  sanitizeAssistantMessage,
  sanitizeAssistantText,
} from "./sanitizeToolCallLeaks";

const SECTION = (name: string, json: string) =>
  "<|tool_calls_section_begin|><|tool_call_begin|>" +
  name +
  "<|tool_call_argument_begin|>" +
  json +
  "<|tool_call_end|><|tool_calls_section_end|>";

describe("normalizeKimiToolName", () => {
  it("strips functions. prefix and :index suffix", () => {
    expect(normalizeKimiToolName("functions.read_file:0")).toBe("read_file");
    expect(normalizeKimiToolName("read_file:1")).toBe("read_file");
    expect(normalizeKimiToolName("functions.edit_existing_file:2")).toBe(
      "edit_existing_file",
    );
    expect(normalizeKimiToolName("tool.search_web:0")).toBe("search_web");
  });
});

describe("parseKimiToolCallSection", () => {
  it("parses a single leaked read_file call", () => {
    const calls = parseKimiToolCallSection(
      SECTION(
        "functions.read_file:0",
        '{"filepath": "D:/Microservice/friday/package.json"}',
      ),
      ["read_file"],
    );
    expect(calls).toBeDefined();
    expect(calls!.length).toBe(1);
    expect(calls![0].function.name).toBe("read_file");
    expect(JSON.parse(calls![0].function.arguments).filepath).toBe(
      "D:/Microservice/friday/package.json",
    );
  });

  it("parses multiple calls in one section", () => {
    const section =
      "<|tool_calls_section_begin|>" +
      "<|tool_call_begin|>functions.read_file:0<|tool_call_argument_begin|>{\"filepath\": \"a\"}<|tool_call_end|>" +
      "<|tool_call_begin|>functions.read_file:1<|tool_call_argument_begin|>{\"filepath\": \"b\"}<|tool_call_end|>" +
      "<|tool_calls_section_end|>";
    const calls = parseKimiToolCallSection(section, ["read_file"]);
    expect(calls?.length).toBe(2);
    expect(JSON.parse(calls![1].function.arguments).filepath).toBe("b");
  });

  it("rejects sections referencing unknown tools", () => {
    expect(
      parseKimiToolCallSection(
        SECTION("functions.not_a_real_tool:0", '{"a":1}'),
        ["read_file"],
      ),
    ).toBeUndefined();
  });

  it("rejects unparseable JSON arguments", () => {
    expect(
      parseKimiToolCallSection(
        SECTION("functions.read_file:0", '{"filepath": "unterminated'),
        ["read_file"],
      ),
    ).toBeUndefined();
  });

  it("returns undefined for text without kimi markers", () => {
    expect(parseKimiToolCallSection("plain assistant text")).toBeUndefined();
  });
});

describe("sanitizeAssistantText", () => {
  it("strips kimi marker section and think tokens, keeps prose", () => {
    const input =
      "修改完成。我再读一下文件确认下。" +
      SECTION("functions.read_file:0", '{"filepath": "a.java"}') +
      "\n</think>";
    expect(sanitizeAssistantText(input)).toBe("修改完成。我再读一下文件确认下。");
  });

  it("leaves clean text untouched", () => {
    expect(sanitizeAssistantText("正常的中文回复。")).toBe("正常的中文回复。");
  });

  it("sanitizes message string content", () => {
    const m = sanitizeAssistantMessage({
      role: "assistant",
      content:
        "hi<|tool_calls_section_begin|><|tool_call_begin|>functions.read_file:0<|tool_call_argument_begin|>{}\<|tool_call_end|><|tool_calls_section_end|>",
    });
    expect(m.content).toBe("hi");
  });

  it("sanitizes message array content parts", () => {
    const m = sanitizeAssistantMessage({
      role: "assistant",
      content: [
        { type: "text", text: "ok <|tool_call_begin|>functions.read_file:0<|tool_call_argument_begin|>{}\<|tool_call_end|>" },
      ],
    });
    expect(m.content).toEqual([{ type: "text", text: "ok" }]);
  });
});

describe("normalizeKimiToolName - generic prefix stripping", () => {
  it("strips any last-segment prefix (function./namespace./tools./host:)", () => {
    expect(normalizeKimiToolName("function.read_file:0")).toBe("read_file");
    expect(normalizeKimiToolName("namespace.read_file:1")).toBe("read_file");
    expect(normalizeKimiToolName("tools.read_file:0")).toBe("read_file");
    expect(normalizeKimiToolName("moonshot:read_file:0")).toBe("read_file");
    expect(normalizeKimiToolName("multi_edit")).toBe("multi_edit");
  });
});

describe("sanitizeAssistantText - unterminated leaks must not truncate prose", () => {
  it("keeps leading prose when the marker section never closes", () => {
    const s =
      "A<|tool_calls_section_begin|><|tool_call_begin|>functions.read_file:0<|tool_call_argument_begin|>{\"x\":";
    expect(sanitizeAssistantText(s)).toContain("A");
  });
});
