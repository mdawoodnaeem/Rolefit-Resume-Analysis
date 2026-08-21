import { describe, expect, it } from 'vitest'

import {
  clamp,
  cn,
  formatTokens,
  formatUsd,
  initials,
  pluralize,
  scoreBand,
  scoreBandLabel,
  scoreBandTextClass,
  scoreBandVar,
  truncate,
} from '@/lib/utils'

describe('cn', () => {
  it('merges conflicting Tailwind utilities with the last one winning', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
  })
})

describe('clamp', () => {
  it('constrains to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('scoreBand', () => {
  // The exact boundaries are a product decision, not an implementation detail:
  // they decide whether a user is told their application is weak. Pin them.
  it.each([
    [0, 'poor'],
    [44, 'poor'],
    [45, 'fair'],
    [64, 'fair'],
    [65, 'good'],
    [84, 'good'],
    [85, 'strong'],
    [100, 'strong'],
  ] as const)('maps %i to %s', (score, expected) => {
    expect(scoreBand(score)).toBe(expected)
  })

  it('does not call a 60%% match a strong one', () => {
    expect(scoreBandLabel(60)).toBe('Partial match')
  })

  it('exposes a matching colour token and class per band', () => {
    expect(scoreBandVar(90)).toBe('var(--score-strong)')
    expect(scoreBandTextClass(20)).toBe('text-score-poor')
  })
})

describe('formatUsd', () => {
  it('keeps four decimals for sub-cent spend so per-request cost is legible', () => {
    expect(formatUsd(0.0032)).toBe('$0.0032')
  })

  it('uses three decimals between a cent and a dollar', () => {
    expect(formatUsd(0.256)).toBe('$0.256')
  })

  it('uses standard currency precision above a dollar', () => {
    expect(formatUsd(12.5)).toBe('$12.50')
  })

  it('renders exact zero without decimal noise', () => {
    expect(formatUsd(0)).toBe('$0')
  })
})

describe('formatTokens', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1.0k'],
    [9999, '10.0k'],
    [10_000, '10k'],
    [1_500_000, '1.5M'],
  ] as const)('formats %i as %s', (count, expected) => {
    expect(formatTokens(count)).toBe(expected)
  })
})

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
  })

  it('falls back to the first two characters of a single token', () => {
    expect(initials('ada@example.com')).toBe('AD')
  })

  it('survives empty input rather than throwing', () => {
    expect(initials('   ')).toBe('?')
  })
})

describe('truncate', () => {
  it('leaves short strings untouched and un-ellipsised', () => {
    expect(truncate('short', 20)).toBe('short')
  })

  it('cuts on a word boundary when one is close enough to the limit', () => {
    expect(truncate('senior backend engineer', 17)).toBe('senior backend…')
  })

  it('hard-cuts when the only word boundary is too far back', () => {
    expect(truncate('supercalifragilistic expialidocious', 12)).toBe('supercalifra…')
  })
})

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'gap')).toBe('gap')
  })

  it('defaults to an -s plural', () => {
    expect(pluralize(3, 'gap')).toBe('gaps')
  })

  it('accepts an irregular plural', () => {
    expect(pluralize(0, 'analysis', 'analyses')).toBe('analyses')
  })
})
