import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RewriteDiff } from '@/components/analysis/rewrite-diff'
import type { CritiqueReport, DiffSegment } from '@/lib/schemas/tailored'

/**
 * Demo mode only reorders text, so it can never produce a wording change —
 * which means the diff view is unreachable through the running app without an
 * API key. These tests are the only coverage it has.
 */

const CHANGED: DiffSegment = {
  id: 'exp-0-bullet-0',
  kind: 'bullet',
  label: 'Northwind Payments · bullet 1',
  original: 'Rebuilt settlement reconciliation, cutting a six-hour batch to 40 minutes.',
  tailored: 'Cut settlement reconciliation from six hours to 40 minutes.',
  rationale: 'Leads with the outcome.',
  accepted: true,
  rejectedReason: '',
}

const BLOCKED: DiffSegment = {
  id: 'exp-0-bullet-1',
  kind: 'bullet',
  label: 'Northwind Payments · bullet 2',
  original: 'Contributed to the payouts API idempotency layer.',
  tailored: 'Architected the payouts idempotency layer, eliminating 100% of duplicates.',
  rationale: 'Stronger verb.',
  accepted: false,
  rejectedReason: 'Upgrades "contributed to" to "architected" and adds a metric not in the source.',
}

const UNCHANGED: DiffSegment = {
  id: 'summary',
  kind: 'summary',
  label: 'Professional summary',
  original: 'Backend engineer with four years on payments.',
  tailored: 'Backend engineer with four years on payments.',
  rationale: '',
  accepted: true,
  rejectedReason: '',
}

const critique = (summary: string): CritiqueReport => ({ verdicts: [], summary })

describe('RewriteDiff', () => {
  it('shows both columns for a changed segment', () => {
    render(<RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />)

    expect(screen.getByText('Your original')).toBeInTheDocument()
    expect(screen.getByText('Tailored')).toBeInTheDocument()
  })

  it('reproduces the original wording verbatim in the left column', () => {
    // If the column the user compares against is not exactly what they wrote,
    // the comparison is against a fiction.
    const { container } = render(
      <RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />,
    )

    const columns = container.querySelectorAll('h4')
    const originalColumn = columns[0]!.parentElement!
    expect(originalColumn.textContent).toContain(CHANGED.original)
  })

  it('reproduces the rewrite verbatim in the right column', () => {
    const { container } = render(
      <RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />,
    )

    const columns = container.querySelectorAll('h4')
    const tailoredColumn = columns[1]!.parentElement!
    expect(tailoredColumn.textContent).toContain(CHANGED.tailored)
  })

  it('offers a toggle for a grounded change', () => {
    render(<RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />)

    const toggle = screen.getByRole('button', { name: /keeping/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets the user decline a grounded change', async () => {
    const user = userEvent.setup()
    render(<RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />)

    await user.click(screen.getByRole('button', { name: /keeping/i }))

    const toggle = screen.getByRole('button', { name: /using original/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the accepted ids to the caller', async () => {
    const user = userEvent.setup()
    const seen: string[][] = []

    render(
      <RewriteDiff
        segments={[CHANGED]}
        critique={critique('Nothing was removed.')}
        onAcceptedChange={(ids) => seen.push(ids)}
      />,
    )

    await user.click(screen.getByRole('button', { name: /keeping/i }))
    expect(seen.at(-1)).toEqual([])
  })

  it('does NOT offer a toggle for a claim the grounding check rejected', () => {
    // Re-enabling a claim the system just caught as fabricated would make the
    // whole check theatre. This is the assertion that keeps it real.
    render(<RewriteDiff segments={[BLOCKED]} critique={critique('Removed one claim.')} />)

    expect(screen.queryByRole('button', { name: /keeping|using original/i })).toBeNull()
    expect(screen.getByText('Not grounded')).toBeInTheDocument()
  })

  it('explains why a rejected claim was rejected', () => {
    render(<RewriteDiff segments={[BLOCKED]} critique={critique('Removed one claim.')} />)

    // Match the reason specifically — "architected" alone also appears in the
    // rejected rewrite itself, which is shown struck through beside it.
    expect(screen.getByText(/adds a metric not in the source/i)).toBeInTheDocument()
  })

  it('counts only segments that actually differ', async () => {
    // Regression: the counter used to count every accepted segment, so an
    // all-reorder rewrite read "5 of 5 changes kept" above five rows each
    // saying "left unchanged".
    render(
      <RewriteDiff
        segments={[CHANGED, UNCHANGED]}
        critique={critique('Nothing was removed.')}
      />,
    )

    expect(screen.getByText('1 of 1 change kept')).toBeInTheDocument()
  })

  it('shows an honest empty state when no wording changed at all', () => {
    render(<RewriteDiff segments={[UNCHANGED]} critique={critique('Nothing was removed.')} />)

    expect(screen.getByText('No wording changes proposed')).toBeInTheDocument()
    expect(screen.queryByText(/change kept/)).toBeNull()
  })

  it('summarises a clean grounding check', () => {
    render(<RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />)
    expect(screen.getByText('Grounding check passed')).toBeInTheDocument()
  })

  it('names how many claims were removed when the check rejected some', () => {
    render(
      <RewriteDiff segments={[CHANGED, BLOCKED]} critique={critique('Removed one claim.')} />,
    )
    expect(screen.getByText('1 claim removed')).toBeInTheDocument()
  })

  it('highlights the changed words rather than the whole line', () => {
    const { container } = render(
      <RewriteDiff segments={[CHANGED]} critique={critique('Nothing was removed.')} />,
    )

    const highlighted = container.querySelectorAll('[class*="diff-added"], [class*="diff-removed"]')
    expect(highlighted.length).toBeGreaterThan(0)

    // Not every span — that would mean the diff found nothing in common.
    const allSpans = container.querySelectorAll('h4 ~ p span')
    expect(highlighted.length).toBeLessThan(allSpans.length)
  })

  it('renders a rejected claim inside a struck-through column', () => {
    const { container } = render(
      <RewriteDiff segments={[BLOCKED]} critique={critique('Removed one claim.')} />,
    )

    const struck = container.querySelector('.line-through')
    expect(struck).not.toBeNull()
    expect(within(struck as HTMLElement).getByText(/Architected/)).toBeInTheDocument()
  })
})
