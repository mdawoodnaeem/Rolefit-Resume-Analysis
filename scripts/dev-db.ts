import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import EmbeddedPostgres from 'embedded-postgres'

/**
 * A real Postgres, started in-process, with no Docker and nothing installed
 * system-wide.
 *
 * The alternative was asking every contributor to provision a hosted database
 * before they could run `npm run dev` even once. This downloads official
 * Postgres binaries on install and keeps its data directory inside the repo
 * (gitignored), so a clone-and-run works offline and a broken local database
 * is fixed by deleting a folder.
 *
 * Development and tests only. Production points DATABASE_URL at a managed
 * Postgres — see docs/DATABASE.md.
 *
 *   npm run db:start   start and stay in the foreground (Ctrl-C to stop)
 *   npm run db:stop    stop a server left running
 */

const DATA_DIR = resolve(process.cwd(), '.postgres')
const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433)
const USER = 'rolefit'
const PASSWORD = 'rolefit'
const DATABASE = 'rolefit'

export const LOCAL_DATABASE_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`

/**
 * Normalise anything thrown into a readable line.
 *
 * `embedded-postgres` rejects with non-Error values in some paths, and the
 * previous `console.error(error)` printed a bare "undefined" — which told the
 * reader nothing at all and looked like the command had silently done nothing.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
    try {
      return JSON.stringify(error)
    } catch {
      /* fall through */
    }
  }
  return 'the Postgres binary exited without a message'
}

/** True when something is already accepting connections on the port. */
function isPortInUse(port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: '127.0.0.1', port })

    const settle = (inUse: boolean) => {
      socket.destroy()
      resolvePort(inUse)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => settle(true))
    socket.once('timeout', () => settle(false))
    socket.once('error', () => settle(false))
  })
}

function createServer(): EmbeddedPostgres {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {
      // Postgres is chatty on startup and none of it is actionable here.
      // Real failures still surface as a rejection from start().
    },
  })
}

export async function startLocalPostgres(): Promise<EmbeddedPostgres> {
  const server = createServer()

  // initialise() runs initdb, which fails loudly if the cluster already
  // exists — so only run it the first time.
  if (!existsSync(DATA_DIR)) {
    console.log(`Initialising Postgres cluster in ${DATA_DIR} …`)
    await server.initialise()
  }

  await server.start()

  try {
    await server.createDatabase(DATABASE)
    console.log(`Created database "${DATABASE}".`)
  } catch {
    // Already exists on every run after the first.
  }

  return server
}

function printReady() {
  console.log(`\nPostgres listening on port ${PORT}`)
  console.log(`  DATABASE_URL="${LOCAL_DATABASE_URL}"`)
  console.log(`  DIRECT_URL="${LOCAL_DATABASE_URL}"\n`)
}

async function start() {
  // Starting a second server on a taken port fails deep inside the Postgres
  // binary with an unhelpful error. Checking first turns the most common
  // situation — "I already started it in another window" — into good news
  // rather than a crash.
  if (await isPortInUse(PORT)) {
    console.log(`\nPostgres is already running on port ${PORT}. Nothing to do.`)
    printReady()
    console.log('If you think that is wrong, run `npm run db:stop` first.\n')
    return
  }

  const server = await startLocalPostgres()

  printReady()
  console.log('Ctrl-C to stop. Leave this window open while you work.')

  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    console.log('\nStopping Postgres …')
    try {
      await server.stop()
    } catch (error) {
      console.error(`Could not stop cleanly: ${describeError(error)}`)
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Hold the process open.
  await new Promise<never>(() => {})
}

async function stop() {
  if (!(await isPortInUse(PORT))) {
    console.log(`Nothing is running on port ${PORT}.`)
    return
  }

  // `new EmbeddedPostgres(...).stop()` only stops a server this process
  // started. When the server belongs to another terminal — the usual case —
  // it reported success while leaving it running, which is worse than
  // failing. pg_ctl acts on the data directory, so it stops the real one.
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)

  const pgCtl = resolve(
    process.cwd(),
    'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe',
  )

  try {
    if (existsSync(pgCtl)) {
      await run(pgCtl, ['-D', DATA_DIR, '-m', 'fast', 'stop'])
    } else {
      // Non-Windows, or a layout we do not recognise.
      await createServer().stop()
    }
  } catch (error) {
    // pg_ctl fails when the postmaster is already dead but its children are
    // not. That happens whenever the server is hard-killed — closing the
    // terminal, a `timeout`, Task Manager — and the orphans keep the listening
    // socket open, so the port stays busy and the next `db:start` reports
    // "already running" forever. Recover instead of reporting failure.
    const recovered = await recoverFromOrphans()
    if (!recovered) {
      console.error(`Could not stop Postgres: ${describeError(error)}`)
      process.exitCode = 1
      return
    }
  }

  // Verify rather than assume. Claiming success while the server is still up
  // is the bug this replaced.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!(await isPortInUse(PORT))) {
      console.log('Postgres stopped.')
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  console.error(`Postgres is still listening on port ${PORT}.`)
  process.exitCode = 1
}

/**
 * Clean up after a hard-killed postmaster.
 *
 * Only touches processes whose executable lives inside this project's
 * node_modules. Matching on the name "postgres" alone would kill a Postgres
 * the developer installed for something else, which is a far worse outcome
 * than a busy port.
 */
async function recoverFromOrphans(): Promise<boolean> {
  const { readFileSync, rmSync } = await import('node:fs')
  const pidFile = resolve(DATA_DIR, 'postmaster.pid')

  if (existsSync(pidFile)) {
    const recordedPid = Number(readFileSync(pidFile, 'utf8').split('\n')[0]?.trim())

    // Signal 0 tests for existence without sending anything.
    let postmasterAlive = false
    try {
      if (Number.isInteger(recordedPid)) {
        process.kill(recordedPid, 0)
        postmasterAlive = true
      }
    } catch {
      postmasterAlive = false
    }

    // A live postmaster means pg_ctl failed for some other reason; do not
    // start killing things underneath a working server.
    if (postmasterAlive) return false

    console.log('The Postgres parent process is gone but its children are still running.')
    rmSync(pidFile, { force: true })
  }

  const binDir = resolve(process.cwd(), 'node_modules/@embedded-postgres')

  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = promisify(execFile)

    if (process.platform === 'win32') {
      await run('powershell', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" |` +
          ` Where-Object { $_.ExecutablePath -like '${binDir.replace(/\\/g, '\\\\')}*' } |` +
          ` ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ])
    } else {
      await run('pkill', ['-f', `${binDir}.*postgres`])
    }
  } catch {
    // pkill exits non-zero when nothing matched, which is fine.
  }

  console.log('Cleaned up leftover Postgres processes.')
  return true
}

async function main() {
  const command = process.argv[2] ?? 'start'

  if (command === 'stop') return stop()
  if (command === 'start') return start()

  console.error(`Unknown command "${command}". Use "start" or "stop".`)
  process.exitCode = 1
}

// Only run the CLI when invoked directly, so other scripts can import
// startLocalPostgres() without launching a server as a side effect.
// pathToFileURL is the portable form — a raw string compare fails on Windows,
// where argv[1] is a backslash path and import.meta.url is a file:// URL.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`\n${describeError(error)}\n`)
    process.exit(1)
  })
}
