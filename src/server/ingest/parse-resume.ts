import 'server-only'

import { MAX_FILE_BYTES, MIN_MEANINGFUL_CHARS } from '@/lib/constants'
import type { ResumeSourceType } from '@/generated/prisma/enums'

/**
 * Resume ingestion: bytes in, plain text out.
 *
 * Everything downstream treats the extracted text as ground truth — the
 * anti-fabrication check compares rewritten claims against it — so a silent
 * extraction failure is worse than a loud one. This module's job is to be
 * honest about what it could and could not read, and the UI shows the result
 * for correction before anything is scored.
 */

// Re-exported so server callers can keep importing them from here, while the
// client-side upload UI imports them from @/lib/constants without pulling in
// this module's `server-only` guard.
export { MAX_FILE_BYTES, MIN_MEANINGFUL_CHARS }

export class ResumeParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'too_large'
      | 'empty'
      | 'unsupported_type'
      | 'encrypted'
      | 'no_text_layer'
      | 'corrupt',
  ) {
    super(message)
    this.name = 'ResumeParseError'
  }
}

export type ParsedResume = {
  text: string
  sourceType: ResumeSourceType
  /** Pages for a PDF; undefined for other formats. */
  pageCount?: number
  /** Non-fatal notes worth showing the user next to the preview. */
  warnings: string[]
}

/* ------------------------------------------------------------ type sniffing */

type DetectedType = 'pdf' | 'docx' | 'text' | 'unknown'

/**
 * Detect by content, not by filename.
 *
 * A `.docx` that is really a PDF, or a `.pdf` renamed from `.doc`, both happen
 * in the wild — people rename files to satisfy an upload filter. Trusting the
 * extension means handing a PDF to the DOCX parser and reporting "corrupt
 * file" for something perfectly readable.
 */
export function detectFileType(bytes: Uint8Array): DetectedType {
  if (bytes.length < 4) return 'unknown'

  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf'
  }

  // PK\x03\x04 — a zip. DOCX is a zip; so are .xlsx, .pptx, .jar and .epub, so
  // the caller still has to survive the parse failing.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'docx'
  }

  // Legacy .doc (OLE compound file). Not supported, but worth naming precisely
  // rather than calling it corrupt.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return 'unknown'
  }

  return looksLikeText(bytes) ? 'text' : 'unknown'
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 2048))
  let control = 0

  for (const byte of sample) {
    // Tab, LF, CR are fine; other C0 controls and NUL are not.
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue
    if (byte < 0x20 || byte === 0x7f) control += 1
  }

  return control / Math.max(sample.length, 1) < 0.05
}

/* --------------------------------------------------------- normalisation */

/**
 * Clean up text as it comes out of a document.
 *
 * PDF extraction in particular produces artefacts that are invisible to a
 * human reading the original but poison downstream matching: a bullet split
 * across a line break becomes two half-sentences, and a hyphenated word broken
 * across lines becomes two tokens that match nothing.
 */
export function normalizeExtractedText(raw: string): string {
  return (
    raw
      // Normalise line endings first so every rule below sees \n.
      .replace(/\r\n?/g, '\n')
      // Rejoin words split across a line break: "reconcil-\niation".
      .replace(/(\w)-\n(\w)/g, '$1$2')
      // Common PDF ligatures, which otherwise break token matching.
      .replace(/ﬀ/g, 'ff')
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      .replace(/ﬃ/g, 'ffi')
      .replace(/ﬄ/g, 'ffl')
      // Non-breaking and zero-width spaces masquerading as separators.
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Normalise the bullet glyphs PDFs love into a single marker.
      .replace(/^[ \t]*[•‣▪●◦⁃∙*·]\s*/gm, '- ')
      // Drop lines that are only a page number, taking the line ending with
      // them — leaving the newline behind turns every page break into a stray
      // blank line, which then reads as a paragraph boundary that was not
      // there in the original.
      .replace(/^[ \t]*(page[ \t]+)?\d+([ \t]*\/[ \t]*\d+)?[ \t]*$\n?/gim, '')
      // Collapse runs of blank lines to a single separator.
      .replace(/\n{3,}/g, '\n\n')
      // Trailing whitespace on a line is never meaningful here.
      .replace(/[ \t]+$/gm, '')
      .trim()
  )
}

/* -------------------------------------------------------------- extraction */

async function parsePdf(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const { extractText, getDocumentProxy } = await import('unpdf')

  try {
    const document = await getDocumentProxy(bytes)
    const { text, totalPages } = await extractText(document, { mergePages: true })
    return { text: Array.isArray(text) ? text.join('\n') : text, pageCount: totalPages }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (/password|encrypt/i.test(message)) {
      throw new ResumeParseError(
        'This PDF is password protected. Remove the password and upload it again, or paste the text instead.',
        'encrypted',
      )
    }

    throw new ResumeParseError(
      'This PDF could not be read. It may be damaged — try re-exporting it, or paste the text instead.',
      'corrupt',
    )
  }
}

async function parseDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth')

  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    })
    return result.value
  } catch {
    throw new ResumeParseError(
      'This file could not be read as a Word document. If it is a .doc from an older Word, re-save it as .docx.',
      'corrupt',
    )
  }
}

/* ------------------------------------------------------------------ public */

export async function parseResumeFile(
  bytes: Uint8Array,
  filename?: string,
): Promise<ParsedResume> {
  if (bytes.length === 0) {
    throw new ResumeParseError('That file is empty.', 'empty')
  }

  if (bytes.length > MAX_FILE_BYTES) {
    throw new ResumeParseError(
      `That file is ${(bytes.length / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024}MB — a text resume should be far smaller, so this is usually an embedded image.`,
      'too_large',
    )
  }

  const detected = detectFileType(bytes)
  const warnings: string[] = []

  const extension = filename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (extension && detected !== 'unknown' && !extensionMatches(extension, detected)) {
    warnings.push(
      `The file is named .${extension} but its contents are ${detected.toUpperCase()}. Reading it as ${detected.toUpperCase()}.`,
    )
  }

  switch (detected) {
    case 'pdf': {
      const { text, pageCount } = await parsePdf(bytes)
      const normalized = normalizeExtractedText(text)

      if (normalized.length < MIN_MEANINGFUL_CHARS) {
        // Being explicit about *why* matters: "no text found" sounds like a
        // bug in us, when the actual problem is a scan with no text layer and
        // the fix is entirely on the user's side.
        throw new ResumeParseError(
          'This PDF has no selectable text — it looks like a scan or an exported image. Paste your resume text instead, or re-export it from the original document.',
          'no_text_layer',
        )
      }

      if (pageCount > 4) {
        warnings.push(
          `${pageCount} pages detected. Only the first two pages of a resume are usually read by a human.`,
        )
      }

      return { text: normalized, sourceType: 'UPLOAD_PDF', pageCount, warnings }
    }

    case 'docx': {
      const normalized = normalizeExtractedText(await parseDocx(bytes))

      if (normalized.length < MIN_MEANINGFUL_CHARS) {
        throw new ResumeParseError(
          'No text could be read from that document. If the content is inside a text box or an image, paste it instead.',
          'no_text_layer',
        )
      }

      return { text: normalized, sourceType: 'UPLOAD_DOCX', warnings }
    }

    case 'text': {
      const normalized = normalizeExtractedText(new TextDecoder().decode(bytes))

      if (normalized.length < MIN_MEANINGFUL_CHARS) {
        throw new ResumeParseError('That file has too little text to analyse.', 'empty')
      }

      return { text: normalized, sourceType: 'PASTE', warnings }
    }

    default:
      throw new ResumeParseError(
        'Unsupported file type. Upload a PDF or DOCX, or paste your resume as text.',
        'unsupported_type',
      )
  }
}

function extensionMatches(extension: string, detected: DetectedType): boolean {
  if (detected === 'pdf') return extension === 'pdf'
  if (detected === 'docx') return extension === 'docx' || extension === 'zip'
  if (detected === 'text') return ['txt', 'md', 'text', 'rtf'].includes(extension)
  return true
}

/** Pasted text takes the same normalisation so both paths behave identically. */
export function parsePastedResume(raw: string): ParsedResume {
  const text = normalizeExtractedText(raw)

  if (text.length < MIN_MEANINGFUL_CHARS) {
    throw new ResumeParseError(
      'That is too short to analyse. Paste your full resume, including your experience.',
      'empty',
    )
  }

  return { text, sourceType: 'PASTE', warnings: [] }
}
