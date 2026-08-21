# Database setup

RoleFit talks plain PostgreSQL through Prisma's `pg` driver adapter. It is not
tied to any provider — Supabase, Neon, Railway, RDS, or a local server all work
by changing two environment variables.

There are two connection strings and they are **not interchangeable**:

| Variable | Used by | Must be |
|---|---|---|
| `DATABASE_URL` | The running app | **Pooled** — every serverless request may be a new process |
| `DIRECT_URL` | `prisma migrate` only | **Unpooled** — migrations open long sessions and issue DDL |

Pointing `DIRECT_URL` at a transaction pooler is the single most common way
this breaks. PgBouncer in transaction mode cannot carry a migration, and the
failure is a hang or an opaque error rather than a clear message. Run
`npm run db:check` and it will tell you before you find out the hard way.

---

## Option A — Supabase (recommended)

### 1. Create the project

1. Go to <https://supabase.com> and sign in.
2. **New project**.
3. Pick a **region physically near you** — every query pays that round trip.
   If you later deploy to Vercel, match the region to your Vercel region
   instead.
4. Set a **database password** and save it somewhere. Supabase shows it once,
   and it is part of both connection strings.
5. Wait ~2 minutes for provisioning.

### 2. Copy the two connection strings

In the dashboard: **Project Settings → Database → Connection string**.

You will see several. You need two of them:

- **Transaction pooler** — port `6543`, hostname contains `pooler` →
  this is your `DATABASE_URL`. Append `?pgbouncer=true`.
- **Session pooler** — port `5432`, hostname contains `pooler` →
  this is your `DIRECT_URL`.

> **Use the *session pooler*, not "Direct connection", for `DIRECT_URL`.**
> Supabase's direct `db.<ref>.supabase.co` host is IPv6-only on the free tier.
> Plenty of home ISPs and CI runners are IPv4-only, so it fails to resolve with
> a "could not translate host name" error that looks like a typo. The session
> pooler is IPv4 and behaves the same for migrations.

Replace `[YOUR-PASSWORD]` in both with the password from step 1.

### 3. Put them in `.env`

```dotenv
DATABASE_URL="postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"
```

If your password contains `@`, `:`, `/`, `?`, `#`, or `&`, percent-encode it —
`@` becomes `%40`. An un-encoded special character silently truncates the URL
and produces an authentication error that has nothing to do with the password
being wrong.

### 4. Verify, migrate, seed

```bash
npm run db:check     # confirms both URLs, connects, reports the server version
npm run db:migrate   # creates the 12 tables
npm run db:seed      # demo account with 12 applications
npm run dev
```

`db:check` reports each step separately, so if something is wrong you find out
which part.

---

## Option B — keep the local embedded Postgres

Already set up. A real PostgreSQL 18 that runs from inside the project with no
Docker and nothing installed system-wide.

```bash
npm run db:start     # leave running; Ctrl-C stops it
npm run db:migrate
npm run db:seed
```

Footprint: **~173 MB** — 66 MB of data in `.postgres/` (gitignored) and 107 MB
of Postgres binaries in `node_modules/`.

---

## Which to use

They are not mutually exclusive, and the best setup uses both:

- **Supabase for the app**, because you need a hosted database to deploy and
  because it is the same environment production will run in.
- **Local for tests**, because the integration tests hammer the rate limiter
  with 25 concurrent requests and doing that over the network is slow, flaky,
  and counts against your Supabase quota.

If you would rather have one, use Supabase for both. The tests will run
against it fine, just slower.

### Reclaiming the 173 MB

Only do this if you are committing to Supabase for tests too:

```bash
npm uninstall embedded-postgres
rm -rf .postgres
```

`npm run db:start` and `db:stop` stop working; everything else is unchanged.
Reinstalling restores it.

---

## Deploying

Set the same two variables in your host's environment (Vercel: **Settings →
Environment Variables**), plus `AUTH_SECRET` and `NEXT_PUBLIC_APP_URL`. Then:

```bash
npm run db:deploy
```

`db:deploy` runs `prisma migrate deploy`, which applies existing migrations
without generating new ones — the correct command for production. Never run
`db:migrate` against a live database.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `could not translate host name` | IPv6-only direct host. Use the session pooler for `DIRECT_URL`. |
| Migration hangs or times out | `DIRECT_URL` is pointed at the transaction pooler (port 6543). |
| `password authentication failed` | Special character in the password needs percent-encoding. |
| `prepared statement already exists` | `?pgbouncer=true` missing from `DATABASE_URL`. |
| `Can't reach database server` locally | `npm run db:start` is not running. |
