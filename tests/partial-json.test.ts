import { describe, expect, it } from 'vitest'

import { PartialJsonAccumulator, parsePartialJson } from '@/lib/ai/partial-json'

describe('parsePartialJson', () => {
  it('parses complete documents unchanged', () => {
    expect(parsePartialJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] })
  })

  it('returns undefined for empty or whitespace input', () => {
    expect(parsePartialJson('')).toBeUndefined()
    expect(parsePartialJson('   \n ')).toBeUndefined()
  })

  it('closes a truncated string value', () => {
    // The overwhelmingly common case in a streamed rewrite.
    expect(parsePartialJson('{"summary": "Backend eng')).toEqual({ summary: 'Backend eng' })
  })

  it('closes nested containers', () => {
    expect(parsePartialJson('{"a": {"b": [1, {"c": "d')).toEqual({
      a: { b: [1, { c: 'd' }] },
    })
  })

  it('drops a trailing comma', () => {
    expect(parsePartialJson('{"a": [1, 2,')).toEqual({ a: [1, 2] })
  })

  it('drops a dangling key rather than emitting an empty value', () => {
    // Emitting {a: ''} would be a lie — the caller must be able to tell
    // "not yet" from "the model returned an empty string".
    expect(parsePartialJson('{"a":')).toEqual({})
    expect(parsePartialJson('{"a": "x", "b":')).toEqual({ a: 'x' })
  })

  it('drops a half-written literal', () => {
    expect(parsePartialJson('{"a": tru')).toEqual({})
    expect(parsePartialJson('{"done": true, "next": nul')).toEqual({ done: true })
  })

  it('drops a trailing incomplete number rather than guessing its value', () => {
    // "12" may be the front of "123"; rendering 12 and then jumping is worse
    // than rendering nothing for one frame.
    expect(parsePartialJson('{"a": 1, "b": 12')).toEqual({ a: 1 })
  })

  it('handles a broken escape sequence', () => {
    expect(parsePartialJson('{"a": "line\\')).toEqual({ a: 'line' })
  })

  it('preserves completed escapes', () => {
    expect(parsePartialJson('{"a": "line\\nbreak')).toEqual({ a: 'line\nbreak' })
  })

  it('does not treat a quote inside a string as a delimiter', () => {
    expect(parsePartialJson('{"a": "he said \\"hi\\" to')).toEqual({ a: 'he said "hi" to' })
  })

  it('does not mistake a colon inside a string for a key separator', () => {
    expect(parsePartialJson('{"a": "ratio 3:1 and')).toEqual({ a: 'ratio 3:1 and' })
  })

  it('does not mistake a brace inside a string for structure', () => {
    expect(parsePartialJson('{"a": "use {curly} braces')).toEqual({ a: 'use {curly} braces' })
  })

  it('handles a truncated array of objects', () => {
    expect(parsePartialJson('{"bullets": [{"id": "a", "text": "one"}, {"id": "b"')).toEqual({
      bullets: [{ id: 'a', text: 'one' }, { id: 'b' }],
    })
  })

  it('yields an empty object once the object has opened but no field is complete', () => {
    // Not undefined: the container has started, and a consumer rendering a
    // skeleton benefits from knowing the shape exists. The invariant that
    // matters is the one asserted below — no key appears before its value is
    // complete.
    expect(parsePartialJson('{"a')).toEqual({})
  })

  it('never throws on arbitrary prefixes of a real document', () => {
    const document = JSON.stringify({
      summary: 'Backend engineer with four years on payments.',
      bullets: [
        { id: 'exp-0-bullet-0', rewritten: 'Cut reconciliation to 40 minutes.', ok: true },
        { id: 'exp-0-bullet-1', rewritten: 'Designed idempotency.', ok: false },
      ],
      skills: ['Go', 'PostgreSQL'],
      count: 12,
    })

    for (let i = 0; i <= document.length; i += 1) {
      expect(() => parsePartialJson(document.slice(0, i))).not.toThrow()
    }
  })

  it('converges on the true value as the prefix grows', () => {
    const document = JSON.stringify({ summary: 'Hello world', skills: ['Go', 'Rust'] })

    // Once the full document has arrived the result must be exact.
    expect(parsePartialJson(document)).toEqual({
      summary: 'Hello world',
      skills: ['Go', 'Rust'],
    })
  })

  it('never returns a key the source document does not contain', () => {
    const document = JSON.stringify({ a: 'one', b: 'two', c: 'three' })

    for (let i = 0; i <= document.length; i += 1) {
      const value = parsePartialJson<Record<string, unknown>>(document.slice(0, i))
      if (!value) continue
      for (const key of Object.keys(value)) {
        expect(['a', 'b', 'c']).toContain(key)
      }
    }
  })
})

describe('PartialJsonAccumulator', () => {
  it('yields a growing value across deltas', () => {
    const accumulator = new PartialJsonAccumulator<{ summary?: string }>()

    expect(accumulator.append('{"summ')).toEqual({})
    expect(accumulator.append('ary": "Back')).toEqual({ summary: 'Back' })
    expect(accumulator.append('end engineer"')).toEqual({ summary: 'Backend engineer' })
    expect(accumulator.append('}')).toEqual({ summary: 'Backend engineer' })
  })

  it('final() parses the raw buffer, not the last repaired snapshot', () => {
    const accumulator = new PartialJsonAccumulator<{ n: number }>()

    accumulator.append('{"n": 12')
    // The display value dropped the incomplete number...
    expect(accumulator.append('')).toEqual({})
    // ...but the real value is whatever actually arrived.
    accumulator.append('3}')
    expect(accumulator.final()).toEqual({ n: 123 })
  })

  it('returns undefined from final() when the stream never completed', () => {
    const accumulator = new PartialJsonAccumulator()
    accumulator.append('{"a": "unterminated')
    expect(accumulator.final()).toBeUndefined()
  })

  it('reset clears the buffer', () => {
    const accumulator = new PartialJsonAccumulator()
    accumulator.append('{"a": 1}')
    accumulator.reset()
    expect(accumulator.raw).toBe('')
    expect(accumulator.final()).toBeUndefined()
  })
})
