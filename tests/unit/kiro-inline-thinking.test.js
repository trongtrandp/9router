// Unit tests for the inline <thinking> splitter used by older Kiro models (4.6).
import { describe, it, expect } from "vitest";
import {
  createInlineThinkingState,
  splitInlineThinking,
  flushInlineThinking,
} from "../../open-sse/executors/kiroInlineThinking.js";

// Feed fragments, collect concatenated reasoning + content across the stream.
function run(fragments) {
  const state = createInlineThinkingState();
  let reasoning = "";
  let content = "";
  for (const f of fragments) {
    const r = splitInlineThinking(state, f);
    reasoning += r.reasoning;
    content += r.content;
  }
  const tail = flushInlineThinking(state);
  reasoning += tail.reasoning;
  content += tail.content;
  return { reasoning, content };
}

describe("splitInlineThinking", () => {
  it("splits a leading <thinking> block delivered in one chunk", () => {
    const { reasoning, content } = run(["<thinking>pondering</thinking>Hello world"]);
    expect(reasoning).toBe("pondering");
    expect(content).toBe("Hello world");
  });

  it("handles the open tag split across chunks", () => {
    const { reasoning, content } = run(["<think", "ing>deep</thinking>answer"]);
    expect(reasoning).toBe("deep");
    expect(content).toBe("answer");
  });

  it("handles the close tag split across chunks", () => {
    const { reasoning, content } = run(["<thinking>reason here</think", "ing>final"]);
    expect(reasoning).toBe("reason here");
    expect(content).toBe("final");
  });

  it("streams reasoning incrementally without leaking a partial close tag", () => {
    const state = createInlineThinkingState();
    const a = splitInlineThinking(state, "<thinking>part one ");
    // No close tag yet — reasoning flows, no content.
    expect(a.reasoning).toBe("part one ");
    expect(a.content).toBe("");
    const b = splitInlineThinking(state, "part two</thinking>done");
    expect(b.reasoning).toBe("part two");
    expect(b.content).toBe("done");
  });

  it("passes through content untouched when there is no leading thinking block", () => {
    const { reasoning, content } = run(["Just a normal answer."]);
    expect(reasoning).toBe("");
    expect(content).toBe("Just a normal answer.");
  });

  it("does not treat a mid-answer <thinking> as a reasoning block", () => {
    const { reasoning, content } = run(["Here is code <thinking> not really"]);
    expect(reasoning).toBe("");
    expect(content).toBe("Here is code <thinking> not really");
  });

  it("tolerates leading whitespace before the block", () => {
    const { reasoning, content } = run(["\n  <thinking>x</thinking>y"]);
    expect(reasoning).toBe("x");
    expect(content).toBe("y");
  });

  it("flushes an unterminated thinking block as reasoning", () => {
    const { reasoning, content } = run(["<thinking>never closed"]);
    expect(reasoning).toBe("never closed");
    expect(content).toBe("");
  });

  it("emits content that arrives in the same chunk as the close tag, char by char", () => {
    const { reasoning, content } = run(["<thinking>r</thinking>", "abc", "def"]);
    expect(reasoning).toBe("r");
    expect(content).toBe("abcdef");
  });
});
