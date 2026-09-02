# Templates

A template is a starting configuration for one kind of business. Picking one is the fastest
route from an empty workspace to a CRM that looks like the customer's business, and it is the
answer to "what do I type first?" — the question that kills a chat-driven product.

## What a template is, and is not

A template **is** a patch set. Choosing one commits the same kind of validated, versioned,
reversible change the agent commits, with `template:<id>` as the version author. One rollback
puts the workspace back. Nothing in the config layer knows templates exist.

A template is **not** a fork, a preset the agent has to respect, or a lock. Everything a
template sets up, the agent can change afterwards, and the diff for that change reads the same
as any other.

## The shape of one

`lib/templates/definitions/<name>.ts` exports a `BusinessTemplate`:

| Field | Who sees it | What it does |
|---|---|---|
| `id` | history only | Written into the version author as `template:<id>` |
| `name`, `tagline`, `who` | the gallery | Card copy |
| `highlights` | the gallery | Three to five plain sentences about the finished workspace |
| `nextPrompts` | the agent panel | The three examples this business is most likely to want next |
| `brief` | **nobody** | The coded prompt behind the template |
| `patches(base)` | the diff | The configuration itself |

`brief` is the part that makes a template more than a config dump. It never reaches the
browser — the gallery is built from `toCard()`, which has no `brief` field — and it is never
rendered anywhere. It travels to one place: the agent's system prompt, as "what this business
is". That is why a real estate workspace asking for "a second pipeline for lettings" gets a
lettings pipeline rather than a second sales funnel.

Write a brief as domain knowledge, not as instructions to the model about tone. What a deal
means in this business, which words the customer uses for it, what must never be collapsed
into one field, and where the money actually is.

## Adding one

1. Write the definition. Use the helpers in `lib/templates/build.ts` — they fill in patch
   defaults so a template reads as a description of a business.
2. Add it to the array in `lib/templates/index.ts`.
3. That is the whole change. No renderer, no agent tool, no migration.

The test suite covers every template in the catalogue automatically: patches must validate,
must be reversible in one rollback, must not reference a field that does not exist, must
describe themselves without leaking an id, and must not contain an action that leaves the
building. A template that sends email on day one is a template that gets a customer's account
suspended.

## Where they appear

- `/start` — the gallery. Sign-up lands here rather than on an empty contacts table.
- The sidebar, always, so a workspace can look at the others later.
- The command palette, as "Start with a template".

Applying one lands on the first view the template created, not on the table every workspace
already had. The first look should be the new thing.
