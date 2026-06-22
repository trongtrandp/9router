/**
 * Inline <thinking> splitter for older Kiro models (e.g. opus-4.6).
 *
 * 4.8/4.7 emit reasoning via a separate `reasoningContentEvent`. Older models
 * instead emit a leading `<thinking>...</thinking>` block inline in the
 * `assistantResponseEvent` content stream. This peels that leading block off and
 * routes it to reasoning, passing everything after the block through as normal
 * answer content.
 *
 * Streaming-safe: the open/close tags may be split across chunks, so partial
 * tag prefixes are held back until they resolve. Only a LEADING block is split;
 * once we are past it, a stray `<thinking>` later in the answer is left as
 * content (never eat real answer text).
 */

const OPEN_TAG = "<thinking>";
const CLOSE_TAG = "</thinking>";

export function createInlineThinkingState() {
  return { phase: "leading", buf: "" };
}

/** Longest suffix of `buf` that is a proper prefix of `tag` (0 if none). */
function partialSuffixLen(buf, tag) {
  const max = Math.min(buf.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (buf.slice(buf.length - n) === tag.slice(0, n)) return n;
  }
  return 0;
}

/**
 * Feed a content fragment; returns { reasoning, content } pulled out of it.
 * Mutates `state`.
 */
export function splitInlineThinking(state, text) {
  let reasoning = "";
  let content = "";
  if (!text) return { reasoning, content };

  if (state.phase === "done") {
    return { reasoning, content: text };
  }

  state.buf += text;

  if (state.phase === "leading") {
    const m = state.buf.match(/^(\s*)([\s\S]*)$/);
    const rest = m[2];

    // Only whitespace so far, or a partial prefix of <thinking> — keep buffering.
    if (rest === "" || OPEN_TAG.startsWith(rest)) {
      return { reasoning, content };
    }

    if (rest.startsWith(OPEN_TAG)) {
      state.phase = "inside";
      state.buf = rest.slice(OPEN_TAG.length);
      // fall through to "inside" handling
    } else {
      // Not a leading thinking block — emit everything (incl. leading ws) as content.
      state.phase = "done";
      content = state.buf;
      state.buf = "";
      return { reasoning, content };
    }
  }

  if (state.phase === "inside") {
    const idx = state.buf.indexOf(CLOSE_TAG);
    if (idx !== -1) {
      reasoning = state.buf.slice(0, idx);
      content = state.buf.slice(idx + CLOSE_TAG.length);
      state.phase = "done";
      state.buf = "";
      return { reasoning, content };
    }
    // No close tag yet — emit reasoning but hold back a possible partial close tag.
    const hold = partialSuffixLen(state.buf, CLOSE_TAG);
    reasoning = hold > 0 ? state.buf.slice(0, state.buf.length - hold) : state.buf;
    state.buf = hold > 0 ? state.buf.slice(state.buf.length - hold) : "";
    return { reasoning, content };
  }

  return { reasoning, content };
}

/** Drain any buffered remainder at end of stream. */
export function flushInlineThinking(state) {
  let reasoning = "";
  let content = "";
  if (state.buf) {
    if (state.phase === "inside") reasoning = state.buf;
    else content = state.buf;
  }
  state.buf = "";
  state.phase = "done";
  return { reasoning, content };
}
