import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Constrain a number to an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export type ScoreBand = 'poor' | 'fair' | 'good' | 'strong'

/**
 * Map a 0-100 score onto its semantic band.
 *
 * The thresholds are intentionally pessimistic. A 60% keyword overlap is a
 * genuinely weak application, and telling someone otherwise is the failure mode
 * this product exists to avoid. "Strong" starts at 85 because that is roughly
 * where a recruiter stops screening you out on paper.
 */
export function scoreBand(score: number): ScoreBand {
  if (score < 45) return 'poor'
  if (score < 65) return 'fair'
  if (score < 85) return 'good'
  return 'strong'
}

const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  poor: 'Weak match',
  fair: 'Partial match',
  good: 'Strong match',
  strong: 'Excellent match',
}

export function scoreBandLabel(score: number): string {
  return SCORE_BAND_LABELS[scoreBand(score)]
}

/** Tailwind text colour class for a score band. */
export function scoreBandTextClass(score: number): string {
  return {
    poor: 'text-score-poor',
    fair: 'text-score-fair',
    good: 'text-score-good',
    strong: 'text-score-strong',
  }[scoreBand(score)]
}

/** CSS custom property holding a score band's colour, for SVG fills/strokes. */
export function scoreBandVar(score: number): string {
  return `var(--score-${scoreBand(score)})`
}

/**
 * Format an estimated model spend. Sub-cent amounts are the common case, so
 * plain currency formatting would round every request to "$0.00" and make the
 * admin usage view useless.
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

/** Compact token counts: 1234 -> "1.2k". */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}

/** Two-character avatar fallback derived from a display name or email. */
export function initials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim()
  if (!trimmed) return '?'

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

/** Truncate on a word boundary, appending an ellipsis only when text was cut. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Stable pluralisation for countable UI labels. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}
