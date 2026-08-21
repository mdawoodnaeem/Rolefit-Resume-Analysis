'use client'

import * as React from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'

import { AnalysisResultView } from '@/components/analysis/analysis-result'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { parseResumeAction, runAnalysisAction } from '@/server/actions/analyze-actions'
import {
  INITIAL_ANALYZE_STATE,
  INITIAL_PARSE_STATE,
  type ParseState,
} from '@/lib/validation/analyze'
import { MAX_FILE_BYTES } from '@/lib/constants'

/**
 * The analyse flow.
 *
 * Two steps, both visible at once rather than a wizard. The user already knows
 * they need a resume and a job description; hiding the second field behind a
 * "next" button buys nothing and costs a page transition.
 *
 * The parsed text is shown in an editable textarea before anything is scored.
 * That is not a nicety — extraction from a two-column PDF genuinely mangles
 * things, and the scoring stage treats this text as ground truth. Letting
 * someone fix it first is the difference between an honest tool and one that
 * confidently scores a garbled document.
 */
export function AnalyzeFlow() {
  const [parseState, parseAction, parsePending] = React.useActionState(
    parseResumeAction,
    INITIAL_PARSE_STATE,
  )
  const [analyzeState, analyzeAction, analyzePending] = React.useActionState(
    runAnalysisAction,
    INITIAL_ANALYZE_STATE,
  )

  const [resumeText, setResumeText] = React.useState('')
  const [jobText, setJobText] = React.useState('')

  // Adopt freshly parsed text without clobbering edits the user has since
  // made. This is React's documented "adjust state during render" pattern:
  // the previous value is held in *state*, not a ref, because a ref read
  // during render is not tracked and can leave the component a render behind.
  // Uploading a different file changes parseState.text and wins; typing in the
  // textarea does not, so edits survive.
  const [adoptedText, setAdoptedText] = React.useState<string | null>(null)
  if (parseState.ok && parseState.text !== adoptedText) {
    setAdoptedText(parseState.text)
    setResumeText(parseState.text)
  }


  if (analyzeState.ok) {
    return (
      <AnalysisResultView
        result={analyzeState.analysis}
        persisted={analyzeState.persisted}
        analysisId={analyzeState.analysisId}
        resumeText={resumeText}
        jobText={jobText}
        sourceType={parseState.ok ? parseState.sourceType : 'PASTE'}
      />
    )
  }

  const canAnalyze = resumeText.trim().length >= 120 && jobText.trim().length >= 80

  return (
    <div className="space-y-4">
      <ResumeStep
        state={parseState}
        action={parseAction}
        pending={parsePending}
        text={resumeText}
        onTextChange={setResumeText}
      />

      <section className="glass rounded-2xl p-5 sm:p-6" aria-labelledby="job-heading">
        <div className="flex items-center gap-2">
          <span className="bg-primary/12 text-primary grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold">
            2
          </span>
          <h2 id="job-heading" className="text-sm font-medium">
            Paste the job description
          </h2>
        </div>

        <Label htmlFor="jobText" className="sr-only">
          Job description
        </Label>
        <Textarea
          id="jobText"
          name="jobText"
          value={jobText}
          onChange={(event) => setJobText(event.target.value)}
          placeholder="Paste the full posting, including its requirements section…"
          className="mt-4 min-h-40"
          aria-describedby="job-hint"
        />
        <p id="job-hint" className="text-muted-foreground mt-2 text-xs">
          Include the requirements — they are what the gap analysis is measured against.
        </p>
      </section>

      <form action={analyzeAction}>
        <input type="hidden" name="resumeText" value={resumeText} />
        <input type="hidden" name="jobText" value={jobText} />
        <input
          type="hidden"
          name="sourceType"
          value={parseState.ok ? parseState.sourceType : 'PASTE'}
        />

        {!analyzeState.ok && analyzeState.error ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {analyzeState.error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canAnalyze}
          loading={analyzePending}
        >
          <Sparkles aria-hidden="true" />
          {analyzePending ? 'Analysing…' : 'Analyse match'}
        </Button>

        {!canAnalyze ? (
          <p className="text-muted-foreground mt-2 text-center text-xs">
            Add your resume and a job description to continue.
          </p>
        ) : null}
      </form>

      {analyzePending ? <ResultsSkeleton /> : null}
    </div>
  )
}

/* ------------------------------------------------------------ resume step */

function ResumeStep({
  state,
  action,
  pending,
  text,
  onTextChange,
}: {
  state: ParseState
  action: (formData: FormData) => void
  pending: boolean
  text: string
  onTextChange: (value: string) => void
}) {
  const formRef = React.useRef<HTMLFormElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [filename, setFilename] = React.useState<string | null>(null)

  const submitFile = (file: File) => {
    setFilename(file.name)
    const data = new FormData()
    data.set('file', file)
    action(data)
  }

  return (
    <section className="glass rounded-2xl p-5 sm:p-6" aria-labelledby="resume-heading">
      <div className="flex items-center gap-2">
        <span className="bg-primary/12 text-primary grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold">
          1
        </span>
        <h2 id="resume-heading" className="text-sm font-medium">
          Add your resume
        </h2>
      </div>

      <form ref={formRef} action={action} className="mt-4">
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (file) submitFile(file)
          }}
          className={cn(
            'rounded-xl border border-dashed p-6 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <Upload className="text-muted-foreground mx-auto size-6" aria-hidden="true" />

          <p className="mt-3 text-sm">
            <label
              htmlFor="resume-file"
              className="text-primary cursor-pointer rounded font-medium underline-offset-4 hover:underline focus-within:underline"
            >
              Choose a file
            </label>{' '}
            <span className="text-muted-foreground">or drop it here</span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            PDF or DOCX, up to {MAX_FILE_BYTES / 1024 / 1024}MB
          </p>

          <input
            id="resume-file"
            name="file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) submitFile(file)
            }}
          />
        </div>
      </form>

      {pending ? (
        <div className="mt-4 space-y-2" aria-busy="true" aria-label="Reading your resume">
          <Skeleton className="h-3.5 w-40" />
          <SkeletonText lines={4} />
        </div>
      ) : null}

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <div className="mt-4 space-y-3">
          <p className="text-score-good flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Read {state.filename ?? filename ?? 'your resume'} — {state.text.length.toLocaleString()}{' '}
              characters
            </span>
          </p>

          {state.warnings.map((warning) => (
            <p
              key={warning}
              className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed"
            >
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="resumeText">
            {state.ok ? 'Parsed text — correct anything wrong before analysing' : 'Or paste it'}
          </Label>
          {text ? (
            <button
              type="button"
              onClick={() => onTextChange('')}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded text-xs"
            >
              <X className="size-3" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>

        <Textarea
          id="resumeText"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste your resume text…"
          className="mt-2 min-h-48 font-mono text-xs leading-relaxed"
          aria-describedby="resume-hint"
        />
        <p id="resume-hint" className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs">
          <FileText className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          Everything downstream treats this text as the truth, including the check that stops the
          rewrite inventing things. Fix any extraction errors here.
        </p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- skeletons */

/**
 * Skeletons rather than a spinner, and shaped like the result they precede —
 * a gauge-sized circle, a verdict-sized paragraph, five score rows. A spinner
 * says "wait"; this says what is coming.
 */
function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Running the analysis">
      <div className="glass rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
          <Skeleton className="size-[180px] shrink-0 rounded-full" />
          <div className="w-full flex-1 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-56" />
            <SkeletonText lines={3} className="pt-2" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass space-y-3 rounded-2xl p-5 sm:p-6">
          <Skeleton className="h-3.5 w-32" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 py-1.5">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-1.5 w-28 rounded-full" />
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))}
        </div>

        <div className="glass space-y-3 rounded-2xl p-5 sm:p-6">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-5 w-16 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
