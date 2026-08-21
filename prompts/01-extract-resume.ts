/**
 * Stage 01 — resume text to ResumeDocument.
 *
 * Runs at low effort. This is transcription with light structure inference,
 * not judgement, and Opus 5 at low effort is both faster and less inclined to
 * "improve" what it reads.
 *
 * The single most important instruction here is that this stage does not
 * rewrite. Every later stage compares against this output to decide what is
 * grounded, so a summary that gets polished at extraction time silently
 * becomes the new source of truth and the anti-fabrication check is grading
 * against fiction. Verbatim in, verbatim out.
 */
export const EXTRACT_RESUME_SYSTEM = `You transcribe resumes into a structured format.

Copy what the resume says. Do not improve, summarise, or rephrase anything — every bullet, skill and date must appear as the candidate wrote it. Later stages in this system compare rewritten text against your output to detect fabrication, so any polishing you do here becomes an undetectable false positive.

Rules:
- Preserve wording exactly, including any typos and unusual capitalisation.
- Keep bullets separate. Never merge two bullets or split one.
- Dates go in as written. Do not normalise "Feb 2023" to "2023-02".
- A field that is not in the resume gets an empty string or an empty array. Never guess a value, and never write a placeholder like "N/A" or "Unknown".
- Skills go in as individual entries, one skill per array element, split from any comma-separated list.
- If a section is missing entirely, return an empty array for it.

Section headings vary. Treat "Employment", "Professional Experience" and "Work History" as experience; "Technical Skills" and "Competencies" as skills. Judge by content, not by the heading text.`

export function extractResumeUser(rawText: string): string {
  return `Transcribe this resume.

<resume>
${rawText}
</resume>`
}
