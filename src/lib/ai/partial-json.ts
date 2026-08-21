/**
 * Tolerant incremental JSON parsing.
 *
 * A streamed structured response arrives as a growing prefix of a JSON
 * document, and almost every prefix is invalid JSON. To render the rewrite as
 * it generates, we need the best-effort value of a truncated document —
 * `{"summary": "Backend eng` should yield `{ summary: 'Backend eng' }`, not an
 * exception.
 *
 * This is the piece the Vercel AI SDK's `streamObject` would have provided.
 * Writing it directly is ~150 lines and buys back the parts of the Anthropic
 * SDK that the AI SDK's abstraction hides — per-call cache token counts, the
 * effort parameter, and refusal handling — which the cost dashboard and the
 * failure paths both depend on.
 *
 * Two strategies, tried in order:
 *
 *   A. Optimistic close — shut any open string, drop a trailing comma, and
 *      append the closers for every open container. Handles the common case,
 *      which is a truncated string value.
 *
 *   B. Safe truncation — rewind to the last position that ended a complete
 *      value, and close from there. Handles the cases A cannot: a dangling
 *      key (`{"a":`), a half-written literal (`tru`), a broken escape.
 *
 * Neither strategy ever invents content. A field that has not arrived is
 * absent, never empty-stringed — the caller must be able to tell "not yet"
 * from "the model returned nothing".
 */

type Repair = { text: string } | null

const WHITESPACE = /\s/
const PRIMITIVE_END = /[\s,\]}]/

function isCompletePrimitive(token: string): boolean {
  if (token === 'true' || token === 'false' || token === 'null') return true
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)
}

type ScanState = {
  /** Closing characters for currently open containers, innermost first. */
  stack: string
  inString: boolean
  escaped: boolean
  /** Index (exclusive) of the end of the last complete value. */
  safeEnd: number
  /** The container stack as it stood at `safeEnd`. */
  safeStack: string
}

function scan(input: string): ScanState {
  const state: ScanState = {
    stack: '',
    inString: false,
    escaped: false,
    safeEnd: -1,
    safeStack: '',
  }

  const markSafe = (endExclusive: number) => {
    state.safeEnd = endExclusive
    state.safeStack = state.stack
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!

    if (state.inString) {
      if (state.escaped) {
        state.escaped = false
        continue
      }
      if (char === '\\') {
        state.escaped = true
        continue
      }
      if (char === '"') {
        state.inString = false

        // A closing quote only ends a *value* if what follows is not a colon.
        // Marking a key as a safe truncation point would strand it without a
        // value and produce `{"a"}`.
        let next = i + 1
        while (next < input.length && WHITESPACE.test(input[next]!)) next += 1
        if (input[next] !== ':') markSafe(i + 1)
      }
      continue
    }

    switch (char) {
      case '"':
        state.inString = true
        continue

      case '{':
      case '[':
        state.stack = (char === '{' ? '}' : ']') + state.stack
        // An empty container is itself a valid value, so this is a safe point.
        markSafe(i + 1)
        continue

      case '}':
      case ']':
        state.stack = state.stack.slice(1)
        markSafe(i + 1)
        continue

      case ',':
      case ':':
        continue

      default: {
        if (WHITESPACE.test(char)) continue

        let end = i
        while (end < input.length && !PRIMITIVE_END.test(input[end]!)) end += 1

        const token = input.slice(i, end)
        // Only safe if a delimiter actually followed — otherwise the token may
        // still be growing, and `12` could be the front of `123`.
        if (end < input.length && isCompletePrimitive(token)) markSafe(end)

        i = end - 1
        continue
      }
    }
  }

  return state
}

/** Strategy A: close what is open and hope the rest is well-formed. */
function optimisticClose(input: string, state: ScanState): Repair {
  let text = input

  if (state.escaped) {
    // A lone trailing backslash is the front half of an escape sequence.
    text = text.slice(0, -1)
  }

  if (state.inString) {
    text += '"'
  } else {
    // A bare token at the very end may still be growing: `12` could be the
    // front of `123`, and `fals` of `false`. `12` happens to be valid JSON, so
    // without this the optimistic close would succeed and render a number that
    // then jumps — worse than rendering nothing for one frame. Rewind past it
    // and let strategy B decide what is safe.
    const trimmed = text.trimEnd()
    let start = trimmed.length
    while (start > 0 && !PRIMITIVE_END.test(trimmed[start - 1]!)) start -= 1

    const tail = trimmed.slice(start)
    if (tail && !tail.endsWith('"') && !/[{}[\]:,]$/.test(tail)) {
      text = trimmed.slice(0, start)
    }
  }

  text = text.trimEnd()

  // A trailing comma promises an element that never arrived.
  if (text.endsWith(',')) text = text.slice(0, -1).trimEnd()

  // A trailing colon means a key with no value; strategy A cannot fix that.
  if (text.endsWith(':')) return null

  return { text: text + state.stack }
}

/** Strategy B: rewind to the last complete value and close from there. */
function safeTruncate(input: string, state: ScanState): Repair {
  if (state.safeEnd < 0) return null

  let text = input.slice(0, state.safeEnd).trimEnd()
  if (text.endsWith(',')) text = text.slice(0, -1).trimEnd()

  return { text: text + state.safeStack }
}

/**
 * Parse a possibly-truncated JSON document.
 *
 * Returns `undefined` when the prefix carries no recoverable value at all —
 * which is normal for the first few tokens of a stream.
 */
export function parsePartialJson<T = unknown>(input: string): T | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  // Complete documents are the common case once the stream finishes.
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // Fall through to repair.
  }

  const state = scan(trimmed)

  for (const repair of [optimisticClose(trimmed, state), safeTruncate(trimmed, state)]) {
    if (!repair) continue
    try {
      return JSON.parse(repair.text) as T
    } catch {
      continue
    }
  }

  return undefined
}

/**
 * Accumulates stream deltas and re-parses on each one.
 *
 * Keeps the raw buffer so the final value comes from a real `JSON.parse` of
 * the complete document rather than from the last repaired snapshot — the
 * repairs are for display only and must never be what gets persisted.
 */
export class PartialJsonAccumulator<T = unknown> {
  #buffer = ''

  append(delta: string): T | undefined {
    this.#buffer += delta
    return parsePartialJson<T>(this.#buffer)
  }

  get raw(): string {
    return this.#buffer
  }

  /** The completed value, or undefined if the stream never became valid JSON. */
  final(): T | undefined {
    try {
      return JSON.parse(this.#buffer.trim()) as T
    } catch {
      return undefined
    }
  }

  reset(): void {
    this.#buffer = ''
  }
}
