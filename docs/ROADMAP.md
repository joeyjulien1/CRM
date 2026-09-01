# Build order

Twelve weeks, solo, assuming this is most of your working time. The order matters more than the
estimates — each milestone is usable before the next one starts, and every one of them is a
thing you can put in front of a prospect.

Give Claude Code one milestone at a time. Starting with "build the CRM" produces a demo that
collapses on the second feature.

---

## 1 — Foundation (week 1)

Next.js, Postgres, Drizzle, auth, tenants, memberships, RLS on every tenant table, and a test
that proves isolation holds. pg-boss wired with one no-op job.

> Set up the foundation per docs/ARCHITECTURE.md. Focus on tenancy: RLS policies on every
> tenant-scoped table, transaction-scoped `app.tenant_id`, and a test suite that proves a query
> under tenant A cannot see tenant B's rows even when the app layer forgets its where clause.
> Nothing else this milestone.

Done when the isolation test fails if you remove the policy.

## 2 — Config layer (week 2)

Zod schema for config, generated TypeScript types, patch application, versioning, rollback.
No UI.

> Build lib/config per docs/ARCHITECTURE.md: the Zod schema for the full config shape, patch
> types for every operation in docs/AGENT-TOOLS.md, an apply function producing a new immutable
> version, and rollback. Test patch/rollback round-trips exhaustively — every operation must
> reverse cleanly.

Done when you can apply twenty random patches and roll back to any version exactly.

## 3 — Runtime and the first three renderers (weeks 3–4)

Query resolver, field resolver, `FieldRenderer`, `TableView`, `FormRenderer`. A hardcoded config
renders a working contacts table you can filter, sort, and edit.

> Implement the query and field resolvers, then FieldRenderer, TableView, and FormRenderer per
> docs/COMPONENTS.md and docs/DESIGN.md. Drive everything from a fixture config file — no
> hardcoded columns anywhere. Virtualise the table from the start.

Done when changing the fixture config changes the UI with no code edits.

## 4 — Remaining renderers (week 5)

`FilterBar`, `KanbanView`, `RecordDetail`, `CommandPalette`. Pipelines in config.

Done when you can configure a deal pipeline by editing JSON and drag cards between stages.

## 5 — The agent (weeks 6–7)

Tool definitions, execution loop, patch accumulation, validation retry, budget enforcement.
`AgentPanel` and `ConfigDiff`.

> Build the agent per docs/AGENT-TOOLS.md. Tools return patches, never results. Accumulate
> across a turn, validate as a set, render one ConfigDiff, apply on confirmation. Enforce the
> per-tenant token budget before the API call, not after. Spend real effort on ConfigDiff —
> plain language, impact counts on destructive changes, separate confirmation for external
> effects.

Done when you can say "add a renewal date to deals and show me deals renewing this quarter" and
get a correct, reviewable, reversible patch.

## 6 — Automations (week 8)

Trigger evaluation, pg-boss workers, action execution, run log, depth limit, idempotency keys.

Done when an automation fires, logs, and cannot loop.

## 7 — Import and onboarding (week 9)

Spreadsheet upload, `propose_import_mapping`, dedupe, background import, progress. The onboarding
flow that turns an uploaded file into a configured CRM in one pass.

This is your demo. Budget the time to make it feel good — it's the moment that sells the
product, and a prospect watching their own spreadsheet become a working CRM is worth more than
any feature list.

## 8 — Email and calendar (weeks 10–11)

Per-user OAuth, Gmail or Outlook (pick one, not both), backfill job separate from live sync,
record matching, timeline. Read `docs/ARCHITECTURE.md` on this before starting — it's the
milestone most likely to overrun.

## 9 — Marketing site and launch prep (week 12)

Site in `(marketing)`, site density, Overflow tokens. Billing. Onboarding emails. Error
monitoring. A status page.

---

## After v1, in rough priority order

Reporting builder as a tenth renderer. Custom objects, once you've seen which ones tenants
actually ask for. A public API. Templates per industry — which is where the vertical strategy
comes back, since a template is a config file and you now have a machine for producing them.

## Two things to track from day one

**Cost per tenant.** Log tokens per agent turn against the tenant. If the median tenant costs
more than about 15% of their subscription in inference, the pricing model is wrong and you want
to know in month two, not month twelve.

**Where the agent fails.** Log every patch that failed validation, every one the user discarded,
and every turn that ended without a patch. That log is your product roadmap — it tells you what
people expect the agent to do that it can't, which is more useful than any feature request.
