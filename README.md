# Gradient — GPA Calculator & Academic Tracker

A full-stack, production-shaped academic record system: sign in, record every session,
semester and course, and get live GPA/CGPA, forecasting, and a printable transcript.

Not a mockup — real authentication, a relational database, a validated API and
server-side PDF generation.

---

## Quick start

```bash
cd gradient
npm run setup     # installs server + client deps and builds the frontend
npm start         # serves API + app on http://localhost:3000
```

Then open **http://localhost:3000**.

A demo account is already seeded with three semesters of sample results:

| Email | Password |
|---|---|
| `test@uni.edu` | `testpass123` |

Create your own account from the sign-up tab, then wipe the sample data whenever you like:

```bash
npm run reset     # deletes all accounts and records, schema rebuilds on next start
```

### Other commands

| Command | What it does |
|---|---|
| `npm start` | Production mode — one process serves the API and the built app |
| `npm run build` | Rebuild the frontend after changing anything in `client/src` |
| `npm run dev:server` | Server with auto-restart on change |
| `npm run dev:client` | Vite dev server on `:5173` with hot reload, proxying `/api` to `:3000` |

For day-to-day development run `dev:server` and `dev:client` in two terminals and use
port 5173. For normal use, `npm start` alone is enough.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | auto-generated, persisted to `data/.jwt-secret` | Session signing key |
| `DATA_DIR` | `./data` | Where the SQLite file lives |

Set `JWT_SECRET` explicitly if you ever deploy this anywhere real.

---

## What it does

**Records** — Sessions → semesters → courses, with add/edit/delete at every level.
Courses carry a code, title, credit units, grade, optional raw score, a status
(completed / ongoing / planned) and a carryover flag. A bulk paste box takes
`CODE, TITLE, UNITS, GRADE` one per line.

**Calculations** — Semester GPA and a running cumulative CGPA recomputed on every
change, on a configurable scale (Nigerian 5.0 ships as default, standard 4.0 included).
Only completed, graded courses count; ongoing and planned units are tracked separately
and feed the forecasts.

**Dashboard** — CGPA gauge, degree classification, distance to the next class,
semester trend chart (GPA vs cumulative), grade distribution, semester table,
warnings, and target checkpoints.

**Insights** — Ranked analysis of your record:
- which courses drag the CGPA down, weighted by units against your own average
- which courses carry you
- trajectory (least-squares slope across semesters) and volatility (standard deviation)
- performance grouped by subject area (course-code prefix)
- failures, carryovers, and low grades in high-unit courses
- the average required for every classification band

**Simulator** — Forward: enter hypothetical courses and grades, see the projected CGPA
and whether it changes your classification. Reverse: give a target CGPA and remaining
units, get the exact average required and its letter-grade equivalent — including an
honest "not reachable" answer with the number of units that *would* be needed.

**Goals** — Personal targets with live progress and required-average projections.

**Transcript & exports** — Server-generated PDF transcript (student details, every
semester, per-course grade points, semester GPA, running CGPA, cumulative summary,
grading key, page footers), plus CSV and a full JSON backup.

---

## Architecture

```
gradient/
├── server/
│   ├── index.js              Express app, security headers, rate limit, static SPA
│   ├── lib/
│   │   ├── db.js             SQLite schema, indexes, system grading scales
│   │   ├── auth.js           bcrypt hashing, JWT issuing, requireAuth middleware
│   │   ├── gpa.js            Pure calculation + intelligence engine
│   │   └── academics.js      Data access, scale resolution, ownership guard
│   └── routes/
│       ├── auth.js           signup / login / logout / me / change-password
│       ├── academics.js      profile, scales, sessions, semesters, courses
│       ├── analytics.js      analysis, simulate, target solver, goals
│       └── transcript.js     PDF, CSV, JSON exports
├── client/                   React + Vite SPA
│   └── src/
│       ├── lib/              API client, auth/theme/data contexts
│       ├── components/       Layout, UI primitives, hand-built SVG charts, icons
│       └── pages/            Auth, Dashboard, Records, Insights, Simulator, Goals,
│                             Transcript, Settings
├── scripts/reset-db.js
└── data/                     SQLite database (created on first run)
```

**One origin.** The Express server serves both the API and the built SPA, so there is no
CORS surface and cookies work without cross-site concessions.

**The calculation engine is pure.** `server/lib/gpa.js` takes plain data and returns
plain data, with no database access. The dashboard, the simulator and the PDF all call
the same functions, so the numbers can never disagree between views.

---

## Database schema

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | `email` (unique, case-insensitive), `password_hash` |
| `profiles` | Student details for the transcript | `user_id` PK, name, matric, university, faculty, department, programme, level, `scale_id` |
| `grading_scales` | Pluggable scales | `name`, `max_point`, `is_system`, nullable `user_id` |
| `grade_points` | Letters within a scale | `letter`, `points`, `min_score`, `max_score`, `is_pass` |
| `sessions` | Academic years | `name` ("2024/2025"), `start_year`, `position` |
| `semesters` | Within a session | `session_id`, `name`, `level`, `position` |
| `courses` | The records themselves | `semester_id`, `code`, `title`, `unit`, `grade`, `score`, `status`, `is_carryover` |
| `goals` | Targets | `title`, `target_cgpa`, `target_date`, `achieved` |

Every user-owned row stores `user_id` directly and is indexed on it, so authorisation is
a single predicate rather than a join chain. Deletes cascade: removing a session removes
its semesters and their courses. Grading scales are a table rather than a hard-coded
constant, which is what makes multi-university support a data change instead of a rewrite.

---

## API

All endpoints are under `/api`. Everything except the auth routes requires a session.

**Auth** — `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` ·
`GET /auth/me` · `POST /auth/change-password`

**Profile & scales** — `GET|PUT /profile` · `GET /scales`

**Structure** — `GET /structure` (full nested record)

**Sessions** — `POST /sessions` · `PUT /sessions/:id` · `DELETE /sessions/:id`

**Semesters** — `POST /semesters` · `PUT /semesters/:id` · `DELETE /semesters/:id`

**Courses** — `POST /courses` · `POST /courses/bulk` · `PUT /courses/:id` · `DELETE /courses/:id`

**Analytics** — `GET /analysis` (dashboard payload: timeline, insights, targets, counts) ·
`POST /simulate` · `POST /target`

**Goals** — `GET|POST /goals` · `PUT /goals/:id` · `DELETE /goals/:id`

**Exports** — `GET /export/transcript.pdf` · `GET /export/csv` · `GET /export/json`

Validation is Zod-based on every write; failures return `400` with a human-readable
`error`. Ownership violations return `404` rather than `403`, so the API never confirms
that someone else's record exists.

---

## The maths

For graded courses only:

```
quality points (course) = units × grade point
GPA    = Σ(units × point) / Σ(units)          within a semester
CGPA   = Σ(units × point) / Σ(units)          across everything to date
```

**Required average** for a target CGPA over `R` remaining units, given `U` earned units
and `Q` accumulated quality points:

```
required = (target × (U + R) − Q) / R
```

If that exceeds the scale maximum the target is flagged unreachable, and the shortfall is
reported instead as the units at top grade that would be needed:

```
units = (target × U − Q) / (max_point − target)
```

**Course impact** — how much a single course pulls the cumulative average:

```
impact = units × (course point − current CGPA)
```

Negative values are drags; the ranking is what powers "costing you the most". This is why
a 4-unit D hurts roughly four times as much as a 1-unit D, and the insights say so
explicitly.

**Classification bands** (5.0 scale): First Class ≥ 4.50 · Second Upper ≥ 3.50 ·
Second Lower ≥ 2.40 · Third ≥ 1.50 · Pass ≥ 1.00. Equivalent bands are defined for 4.0.

Worked example from the seeded demo account — 41/12 = 3.42, then 23/8 = 2.88, then
29/7 = 4.14, giving 93/27 = **3.44** cumulative.

---

## Security

- Passwords hashed with bcrypt (cost 12) and a per-password salt; never stored or logged in plain text.
- Sessions are signed JWTs in an `httpOnly`, `sameSite=lax` cookie — unreadable from JavaScript, so an injected script cannot exfiltrate the session.
- The signing secret is generated once and persisted with `0600` permissions, or supplied via `JWT_SECRET`.
- Login and signup are rate-limited per IP, and login returns an identical error for unknown-email and wrong-password so accounts cannot be enumerated.
- Every query is a parameterised prepared statement — no string-built SQL.
- Every read and write is scoped to the authenticated `user_id`; a second account cannot see or delete another's records.
- `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` set on all responses.

Reasonable for a personal app run locally. Before putting it on the public internet, add
TLS, set `secure: true` on the cookie, and set an explicit `JWT_SECRET`.

---

## Extending it

The seams that were deliberately left open:

- **More universities / grading systems** — insert a row in `grading_scales` plus its
  `grade_points`; the engine reads the scale at runtime and needs no changes.
- **Forecasting** — `analyse()` already computes trend slope and volatility; projecting
  a future CGPA band is a small addition on top of the existing series.
- **Per-semester targets** — `requiredAverage()` is generic; it can be called per
  semester rather than over total remaining units.
- **Course-level analytics** — `courses.score` is stored but only lightly used, ready for
  score-vs-grade analysis.
