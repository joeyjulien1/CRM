# crm-builder

Scaffold for a multi-tenant CRM that customers configure by talking to an agent.

Nothing here is code yet. It's the set of documents that make Claude Code build the right thing
instead of a plausible thing.

## Use it

```bash
mkdir my-crm && cd my-crm
git init
# copy CLAUDE.md and docs/ in
claude
```

First prompt:

> Read CLAUDE.md and everything in docs/. Then tell me what you understand the three invariants
> to be, what the nine renderers are, and what is explicitly out of scope for v1. Don't write
> any code yet.

If the answer is wrong or vague, fix the docs before writing a line. That five-minute check is
worth more than any amount of correcting course later.

Then work through `docs/ROADMAP.md`, one milestone per session. Start a fresh session per
milestone so context stays clean.

## Before you start

Two things to do yourself, because they're decisions rather than implementation:

**Derive your design tokens.** `docs/DESIGN.md` has placeholder values. Open overflow.io with
devtools, pull the real computed colour ramp, font stack and weights, radius, and border
values, and replace the brand block. Half an hour, and it gives you better values than any
analysis of a screenshot.

**Name the product.** `crm-builder` appears in `CLAUDE.md`, the package name, and the database
name. Rename before the first commit — it's ten seconds now and a find-and-replace across a
codebase later.

## Keep the docs honest

When a decision changes, change the doc in the same commit as the code. These files are only
useful if they describe what's actually true; a stale `COMPONENTS.md` is worse than no
`COMPONENTS.md`, because the agent will build against it confidently.

## Files

| File | Read it when |
|---|---|
| `CLAUDE.md` | every session |
| `docs/ARCHITECTURE.md` | touching data, tenancy, config versioning, sync |
| `docs/AGENT-TOOLS.md` | touching the agent |
| `docs/DESIGN.md` | touching anything visual |
| `docs/COMPONENTS.md` | building or changing a renderer |
| `docs/ROADMAP.md` | starting a milestone |
