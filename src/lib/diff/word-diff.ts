/**
 * Word-level diff for the side-by-side rewrite view.
 *
 * Character-level diffing looks precise and reads terribly on prose — it
 * highlights the "ed" inside "reconciled" and leaves the reader assembling
 * words from fragments. Line-level is too coarse when a bullet is one line.
 * Words are the unit a person actually compares.
 *
 * Standard LCS, which is O(n*m). Resume bullets are tens of words, so the
 * quadratic table is a few hundred cells — not worth the complexity of Myers'
 * algorithm, and a straightforward implementation is one fewer thing that can
 * be subtly wrong.
 *
 * Each token carries *both* spellings rather than one canonical value. Matched
 * words often differ in case or trailing punctuation ("API." vs "API"), and
 * collapsing them to a single string means one column no longer reproduces
 * what was actually written. The user is being asked to compare their own
 * bullet against a proposed replacement; if the left-hand column is not
 * verbatim theirs, the comparison is against a fiction.
 */

export type DiffType = 'equal' | 'added' | 'removed'

export type DiffToken = {
  type: DiffType
  /** Text as it appears in the original. Empty string when `added`. */
  before: string
  /** Text as it appears in the rewrite. Empty string when `removed`. */
  after: string
}

/** A token flattened for one column. */
export type RenderToken = {
  type: DiffType
  value: string
}

/**
 * Split into words with trailing whitespace attached, so joining the tokens
 * reproduces the input byte for byte.
 */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? []
}

/** Compare ignoring case and trailing punctuation, so "API." matches "API". */
function normalizeForCompare(token: string): string {
  return token.trim().toLowerCase().replace(/[.,;:!?)"']+$/, '')
}

export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before)
  const b = tokenize(after)

  if (a.length === 0 && b.length === 0) return []
  if (a.length === 0) return [{ type: 'added', before: '', after }]
  if (b.length === 0) return [{ type: 'removed', before, after: '' }]

  // lengths[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        normalizeForCompare(a[i]!) === normalizeForCompare(b[j]!)
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }

  const tokens: DiffToken[] = []

  const push = (type: DiffType, beforeText: string, afterText: string) => {
    const last = tokens[tokens.length - 1]
    // Merge adjacent runs of the same type so the DOM gets one span per change
    // rather than one per word.
    if (last?.type === type) {
      last.before += beforeText
      last.after += afterText
      return
    }
    tokens.push({ type, before: beforeText, after: afterText })
  }

  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    if (normalizeForCompare(a[i]!) === normalizeForCompare(b[j]!)) {
      push('equal', a[i]!, b[j]!)
      i += 1
      j += 1
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      push('removed', a[i]!, '')
      i += 1
    } else {
      push('added', '', b[j]!)
      j += 1
    }
  }

  while (i < a.length) {
    push('removed', a[i]!, '')
    i += 1
  }

  while (j < b.length) {
    push('added', '', b[j]!)
    j += 1
  }

  return tokens
}

/**
 * Flatten to one column. The `before` column reproduces the original exactly
 * and the `after` column reproduces the rewrite exactly.
 */
export function sideTokens(
  tokens: readonly DiffToken[],
  side: 'before' | 'after',
): RenderToken[] {
  const drop: DiffType = side === 'before' ? 'added' : 'removed'

  return tokens
    .filter((token) => token.type !== drop)
    .map((token) => ({ type: token.type, value: token[side] }))
}

/** True when the two strings differ by more than whitespace. */
export function hasChanges(tokens: readonly DiffToken[]): boolean {
  return tokens.some(
    (token) =>
      token.type !== 'equal' && (token.before.trim().length > 0 || token.after.trim().length > 0),
  )
}

/** Rough measure of how much was rewritten, 0–100. */
export function changeRatio(tokens: readonly DiffToken[]): number {
  const weight = (token: DiffToken) =>
    Math.max(token.before.trim().length, token.after.trim().length)

  const total = tokens.reduce((sum, token) => sum + weight(token), 0)
  if (total === 0) return 0

  const changed = tokens
    .filter((token) => token.type !== 'equal')
    .reduce((sum, token) => sum + weight(token), 0)

  return Math.round((changed / total) * 100)
}
