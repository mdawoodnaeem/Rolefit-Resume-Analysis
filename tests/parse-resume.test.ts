// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Document, Packer, Paragraph, TextRun } from 'docx'

import {
  MAX_FILE_BYTES,
  ResumeParseError,
  detectFileType,
  normalizeExtractedText,
  parsePastedResume,
  parseResumeFile,
} from '@/server/ingest/parse-resume'

const LONG_ENOUGH = 'Backend engineer with four years building payment services. '.repeat(4)

/* --------------------------------------------------------- normalisation */

describe('normalizeExtractedText', () => {
  it('rejoins a word hyphenated across a line break', () => {
    // PDF extraction produces this constantly, and it silently breaks keyword
    // matching: "reconciliation" becomes two tokens that match nothing.
    expect(normalizeExtractedText('settlement reconcil-\niation job')).toBe(
      'settlement reconciliation job',
    )
  })

  it('expands ligatures', () => {
    expect(normalizeExtractedText('workﬂow and ofﬁce and ﬁnance')).toBe(
      'workflow and office and finance',
    )
  })

  it('normalises assorted bullet glyphs to a single marker', () => {
    const input = ['• first', '▪ second', '‣ third', '· fourth'].join('\n')
    expect(normalizeExtractedText(input)).toBe(['- first', '- second', '- third', '- fourth'].join('\n'))
  })

  it('strips standalone page numbers', () => {
    expect(normalizeExtractedText('Experience\n\n2\n\nSkills')).toBe('Experience\n\nSkills')
    expect(normalizeExtractedText('Experience\nPage 3 / 4\nSkills')).toBe('Experience\nSkills')
  })

  it('does not strip a number that is part of a line', () => {
    expect(normalizeExtractedText('Reduced latency by 40 percent')).toBe(
      'Reduced latency by 40 percent',
    )
  })

  it('removes zero-width and non-breaking spaces', () => {
    expect(normalizeExtractedText('Go​PostgreSQL Redis')).toBe('GoPostgreSQL Redis')
  })

  it('collapses excess blank lines but preserves paragraph breaks', () => {
    expect(normalizeExtractedText('A\n\n\n\n\nB')).toBe('A\n\nB')
  })

  it('normalises CRLF', () => {
    expect(normalizeExtractedText('A\r\nB')).toBe('A\nB')
  })
})

/* ------------------------------------------------------------- detection */

describe('detectFileType', () => {
  const withPrefix = (bytes: number[]) => new Uint8Array([...bytes, ...new Array(64).fill(0x41)])

  it('detects a PDF by its header', () => {
    expect(detectFileType(withPrefix([0x25, 0x50, 0x44, 0x46]))).toBe('pdf')
  })

  it('detects a zip container as docx', () => {
    expect(detectFileType(withPrefix([0x50, 0x4b, 0x03, 0x04]))).toBe('docx')
  })

  it('does not mistake legacy .doc for something it can read', () => {
    expect(detectFileType(withPrefix([0xd0, 0xcf, 0x11, 0xe0]))).toBe('unknown')
  })

  it('detects plain text', () => {
    expect(detectFileType(new TextEncoder().encode('Alex Mercer\nBackend Engineer'))).toBe('text')
  })

  it('rejects binary that is not a known container', () => {
    expect(detectFileType(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x00]))).toBe(
      'unknown',
    )
  })

  it('returns unknown for input too short to sniff', () => {
    expect(detectFileType(new Uint8Array([0x25]))).toBe('unknown')
  })
})

/* ------------------------------------------------------------- guardrails */

describe('parseResumeFile guardrails', () => {
  it('rejects an empty file', async () => {
    await expect(parseResumeFile(new Uint8Array(0))).rejects.toMatchObject({ code: 'empty' })
  })

  it('rejects a file over the size limit', async () => {
    const oversized = new Uint8Array(MAX_FILE_BYTES + 1)
    oversized.set([0x25, 0x50, 0x44, 0x46])

    await expect(parseResumeFile(oversized)).rejects.toMatchObject({ code: 'too_large' })
  })

  it('rejects an unsupported binary type by name', async () => {
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, ...new Array(200).fill(0)])
    await expect(parseResumeFile(doc, 'resume.doc')).rejects.toMatchObject({
      code: 'unsupported_type',
    })
  })

  it('rejects a text file with too little content to analyse', async () => {
    const tiny = new TextEncoder().encode('Alex Mercer')
    await expect(parseResumeFile(tiny, 'resume.txt')).rejects.toMatchObject({ code: 'empty' })
  })

  it('accepts a plain text resume', async () => {
    const result = await parseResumeFile(new TextEncoder().encode(LONG_ENOUGH), 'resume.txt')

    expect(result.sourceType).toBe('PASTE')
    expect(result.text).toContain('Backend engineer')
    expect(result.warnings).toEqual([])
  })

  it('warns when the extension contradicts the contents', async () => {
    // People rename files to get past upload filters. Trusting the extension
    // means handing a text file to the PDF parser and blaming the file.
    const result = await parseResumeFile(new TextEncoder().encode(LONG_ENOUGH), 'resume.pdf')

    expect(result.warnings[0]).toContain('named .pdf')
    expect(result.text).toContain('Backend engineer')
  })

  it('reports a scanned PDF as having no text layer, not as corrupt', async () => {
    // A valid PDF header with no readable content. The distinction matters:
    // "corrupt" sounds like our bug, "no text layer" tells the user the fix.
    const header = new TextEncoder().encode('%PDF-1.4\n')
    const junk = new Uint8Array([...header, ...new Array(400).fill(0x20)])

    await expect(parseResumeFile(junk, 'scan.pdf')).rejects.toBeInstanceOf(ResumeParseError)
  })
})

/* ---------------------------------------------------------- docx round trip */

// Generating a real .docx and parsing it back exercises both the `docx`
// writer and mammoth. Both are slow to cold-start, hence the raised timeout —
// it is startup cost, not a hang.
describe('DOCX round trip', { timeout: 30_000 }, () => {
  it('reads back text from a real generated .docx', async () => {
    const bullets = [
      'Rebuilt settlement reconciliation, cutting a six-hour batch to 40 minutes.',
      'Designed the idempotency layer for the payouts API.',
    ]

    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun('Alex Mercer')] }),
            new Paragraph({ children: [new TextRun('Backend Engineer, Northwind Payments')] }),
            ...bullets.map((text) => new Paragraph({ children: [new TextRun(text)] })),
            new Paragraph({ children: [new TextRun('Skills: Go, PostgreSQL, Kafka')] }),
          ],
        },
      ],
    })

    const buffer = await Packer.toBuffer(document)
    const result = await parseResumeFile(new Uint8Array(buffer), 'alex-mercer.docx')

    expect(result.sourceType).toBe('UPLOAD_DOCX')
    expect(result.text).toContain('Alex Mercer')
    for (const bullet of bullets) {
      expect(result.text).toContain(bullet)
    }
    expect(result.text).toContain('Go, PostgreSQL, Kafka')
  })

  it('detects a generated .docx by content even when misnamed', async () => {
    const document = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun(LONG_ENOUGH)] })] }],
    })

    const buffer = await Packer.toBuffer(document)
    const result = await parseResumeFile(new Uint8Array(buffer), 'resume.txt')

    expect(result.sourceType).toBe('UPLOAD_DOCX')
    expect(result.warnings[0]).toContain('named .txt')
  })
})

/* -------------------------------------------------------------- pasting */

describe('parsePastedResume', () => {
  it('applies the same normalisation as an upload', () => {
    const result = parsePastedResume(`• First bullet\n${LONG_ENOUGH}`)
    expect(result.text.startsWith('- First bullet')).toBe(true)
    expect(result.sourceType).toBe('PASTE')
  })

  it('rejects something too short to be a resume', () => {
    expect(() => parsePastedResume('hi')).toThrow(ResumeParseError)
  })
})
