import { describe, expect, it } from 'vitest'

import {
  changeRatio,
  diffWords,
  hasChanges,
  sideTokens,
  type DiffToken,
  type RenderToken,
} from '@/lib/diff/word-diff'

const render = (tokens: readonly RenderToken[]) => tokens.map((t) => t.value).join('')
const typesOf = (tokens: readonly DiffToken[]) => tokens.map((t) => t.type)

describe('diffWords', () => {
  it('marks identical text as entirely equal', () => {
    const tokens = diffWords('Rebuilt the reconciliation job', 'Rebuilt the reconciliation job')
    expect(typesOf(tokens)).toEqual(['equal'])
  })

  it('handles both sides empty', () => {
    expect(diffWords('', '')).toEqual([])
  })

  it('treats an empty original as pure addition', () => {
    expect(diffWords('', 'New summary')).toEqual([
      { type: 'added', before: '', after: 'New summary' },
    ])
  })

  it('treats an empty rewrite as pure removal', () => {
    expect(diffWords('Old summary', '')).toEqual([
      { type: 'removed', before: 'Old summary', after: '' },
    ])
  })

  it('identifies a replaced word', () => {
    const tokens = diffWords('Contributed to the payouts API', 'Owned the payouts API')

    expect(tokens.filter((t) => t.type === 'removed').map((t) => t.before.trim())).toEqual([
      'Contributed to',
    ])
    expect(tokens.filter((t) => t.type === 'added').map((t) => t.after.trim())).toEqual(['Owned'])
  })

  it('reconstructs the original from before-side tokens', () => {
    // If the "unchanged" column does not reproduce what the user wrote, the
    // comparison they are being asked to make is against something else.
    const before = 'Rebuilt settlement reconciliation, cutting a six-hour batch to 40 minutes.'
    const after = 'Cut settlement reconciliation from six hours to 40 minutes.'

    expect(render(sideTokens(diffWords(before, after), 'before'))).toBe(before)
  })

  it('reconstructs the rewrite from after-side tokens', () => {
    const before = 'Rebuilt settlement reconciliation, cutting a six-hour batch to 40 minutes.'
    const after = 'Cut settlement reconciliation from six hours to 40 minutes.'

    expect(render(sideTokens(diffWords(before, after), 'after'))).toBe(after)
  })

  it('ignores case and trailing punctuation when matching', () => {
    // "API." and "API" are the same word to a reader; highlighting the full
    // stop as a change is noise.
    const tokens = diffWords('built the api.', 'Built the API')
    expect(typesOf(tokens)).toEqual(['equal'])
  })

  it('merges adjacent runs of the same type into one token', () => {
    const tokens = diffWords('a b c d', 'a x y d')
    // One removed run and one added run, not two of each.
    expect(tokens.filter((t) => t.type === 'removed')).toHaveLength(1)
    expect(tokens.filter((t) => t.type === 'added')).toHaveLength(1)
  })

  it('preserves interior whitespace exactly', () => {
    const before = 'one  two   three'
    expect(render(sideTokens(diffWords(before, 'one two three'), 'before'))).toBe(before)
  })

  it('round-trips across a realistic rewrite', () => {
    const before =
      'Designed and shipped the idempotency layer for the payouts API, eliminating a class of duplicate-transfer incidents.'
    const after =
      'Eliminated duplicate-transfer incidents by designing the payouts API idempotency layer.'

    const tokens = diffWords(before, after)
    expect(render(sideTokens(tokens, 'before'))).toBe(before)
    expect(render(sideTokens(tokens, 'after'))).toBe(after)
  })
})

describe('hasChanges', () => {
  it('is false for identical text', () => {
    expect(hasChanges(diffWords('same text here', 'same text here'))).toBe(false)
  })

  it('is false when only whitespace differs', () => {
    expect(hasChanges(diffWords('same  text', 'same text'))).toBe(false)
  })

  it('is true for a real edit', () => {
    expect(hasChanges(diffWords('led the team', 'joined the team'))).toBe(true)
  })
})

describe('changeRatio', () => {
  it('is 0 for identical text', () => {
    expect(changeRatio(diffWords('abc def', 'abc def'))).toBe(0)
  })

  it('is 100 when nothing is shared', () => {
    expect(changeRatio(diffWords('aaa', 'bbb'))).toBe(100)
  })

  it('is 0 for empty input rather than NaN', () => {
    expect(changeRatio([])).toBe(0)
  })

  it('grows with the size of the edit', () => {
    const small = changeRatio(diffWords('one two three four five', 'one two three four six'))
    const large = changeRatio(diffWords('one two three four five', 'alpha beta gamma delta'))
    expect(large).toBeGreaterThan(small)
  })
})
