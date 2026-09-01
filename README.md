# crm

A multi-tenant CRM that each customer configures by talking to an AI agent instead of hiring a
consultant. The agent writes **configuration**, never code and never customer data. A runtime engine
reads that configuration and renders the CRM.

## Run it

Requires Node 22 and Postgres 16.

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and DATABASE_ADMIN_URL
createdb crm
npm run db:migrate            # creates the schema, the crm_app role, and every RLS policy
npm run dev                   # the app
npm run worker                # background jobs, in a second terminal
```

The app connects as `crm_app`, a role without `bypassrls`. Migrations connect as the owner. If you
point both at the same superuser, the isolation tests still pass — `force row level security` binds
the owner too — but you have given up a layer of defence, so don't.

```bash
npm test           # config patches, rollback round-trips, and RLS isolation
npm run typecheck
```

## The three invariants

1. The agent mutates config only. Its entire surface is the tool list in `docs/AGENT-TOOLS.md`.
2. Every config change is a validated, versioned, reversible patch.
3. Tenant isolation is enforced in the database, not the application.

`lib/db/rls.test.ts` fails if a policy is removed, and fails if a new table carries `tenant_id`
without being declared tenant-scoped.

## Layout

```
app/
  (marketing)/          public site — site density
  (app)/                the product — dense mode
components/
  ui/                   shadcn primitives, unmodified
  renderers/            the nine config-driven renderers
  agent/                chat panel, config diff viewer
lib/
  config/               schema, validation, patch application, versioning
  agent/                tool definitions, execution loop, guardrails
  runtime/              config -> query, config -> view resolution
  automations/          trigger evaluation and action execution
  import/               spreadsheet mapping and background import
  email/                Gmail OAuth, sync, record matching
  db/                   schema, migrations, RLS policies
  jobs/                 pg-boss queue and worker entrypoint
docs/                   read these
```

## Keep the docs honest

When a decision changes, change the doc in the same commit as the code. These files are only useful
if they describe what's actually true; a stale `COMPONENTS.md` is worse than no `COMPONENTS.md`,
because the agent will build against it confidently.

## Files

| File | Read it when |
|---|---|
| `CLAUDE.md` | every session |
| `docs/ARCHITECTURE.md` | touching data, tenancy, config versioning, sync |
| `docs/AGENT-TOOLS.md` | touching the agent |
| `docs/DESIGN.md` | touching anything visual |
| `docs/COMPONENTS.md` | building or changing a renderer |
| `docs/ROADMAP.md` | starting a milestone |

## Still to do

`docs/DESIGN.md` ships placeholder brand tokens. Pull the real computed colour ramp, font stack,
radius, and border values and replace the brand block in `app/globals.css` — everything else in the
design system reads through the semantic layer, so that block is the only edit.
