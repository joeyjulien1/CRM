# Agent tools

This is the agent's entire surface. If it isn't here, the agent cannot do it.

Every tool returns a **patch**, not a result. Patches accumulate across a turn, validate as a
set, render as one diff, and apply as one config version on confirmation. A turn that produces
an invalid patch shows the validation error to the agent and lets it retry once, then surfaces
the failure to the user.

## Schema

| Tool | Arguments | Notes |
|---|---|---|
| `add_field` | object_key, label, type, options?, required?, default? | type from the field type list below |
| `update_field` | field_id, label?, options?, required?, default? | cannot change type — see below |
| `remove_field` | field_id | destructive; patch carries affected record count |
| `create_relation` | from_object, to_object, kind, label | kind: one_to_many, many_to_many |
| `reorder_fields` | object_key, field_ids[] | display order only |

Changing a field's type is deliberately not a tool. It is a data migration, not a config edit.
The agent should propose adding a new field and offer to backfill, which is a separate,
explicitly confirmed operation.

## Views

| Tool | Arguments |
|---|---|
| `create_view` | object_key, name, renderer, columns[], filters?, sort?, group_by? |
| `update_view` | view_id, name?, columns?, filters?, sort?, group_by? |
| `delete_view` | view_id |

`renderer` must be one of: `table`, `kanban`, `detail`. Anything else fails validation. The
renderer list is bounded by `docs/COMPONENTS.md` — keep them in sync.

## Pipelines

| Tool | Arguments |
|---|---|
| `create_pipeline` | object_key, name, stages[] |
| `update_pipeline` | pipeline_id, name?, stages? |

Stages carry `key`, `label`, `probability?`, `is_won?`, `is_lost?`. Removing a stage that holds
records requires a target stage in the patch — the agent must ask where those records go.

## Automations

| Tool | Arguments |
|---|---|
| `create_automation` | name, trigger, conditions[], actions[] |
| `update_automation` | automation_id, ... |
| `set_automation_enabled` | automation_id, enabled |

Triggers: `record_created`, `record_updated`, `field_changed`, `date_reached`, `form_submitted`.
Actions: `set_field`, `create_record`, `create_task`, `send_email`, `call_webhook`.

`send_email` and `call_webhook` are flagged in the diff as external effects and require separate
confirmation even inside an approved patch. An agent that can silently email a customer's
contact list is a product you can't sell.

## Import

| Tool | Arguments |
|---|---|
| `propose_import_mapping` | file_id | reads column headers and a sample of rows |
| `apply_import` | mapping, dedupe_key | runs as a background job, not inline |

This is the one place the agent sees customer data, and only because the user handed it over.
Sample at most 20 rows. Never send the full file to the model.

These two are the exception to "every tool returns a patch": an import creates records, and records
are not configuration, so there is no config version to write. They return a proposal that goes
through the same confirm-before-anything-happens path, and `apply_import` then runs as a background
job. Everything else on this page returns a patch.

## Connectors

| Tool | Arguments |
|---|---|
| `list_connections` | — |
| `request_connection` | provider, reason |

`request_connection` offers a button in the conversation. It does not connect anything: the OAuth
grant is the user's to give, in a popup, and the agent never sees a token or a scope it did not ask
the user for. This is the one tool that returns neither a patch nor data — it asks for consent.

The provider list is configuration (`lib/connectors/registry.ts`), not part of this contract. Adding
Slack is a config entry; it is not a new tool and not a new component.

A task that needs an account the user has not connected ends with `request_connection` and stops.
Carrying on as though the account were connected is the failure mode to design against.

## Read tools

| Tool | Returns |
|---|---|
| `get_config` | current resolved config |
| `get_schema_summary` | objects, fields, types, record counts per object |
| `get_config_history` | last 20 versions with summaries |

Note what's absent: there is no tool that reads record contents. The agent knows a tenant has
1,847 deals; it does not know who they're with.

## Field types

`text`, `long_text`, `number`, `currency`, `date`, `datetime`, `boolean`, `select`,
`multi_select`, `email`, `phone`, `url`, `relation`, `user`.

Adding a type means adding a renderer, a filter predicate, an import coercion, and a form
input. It is a four-file change, not a one-line change. Treat the list as closed for v1.

## System prompt shape

The agent's system prompt should carry: the invariants from `CLAUDE.md`, the current config
summary, the tool list, and a strong instruction to ask before destructive changes rather than
proposing them. Keep it under ~2k tokens — the config summary is the expensive part, so send
counts and shapes, not the full config, unless a tool asks for it.

Rules worth stating explicitly in that prompt:
- Propose the smallest change that solves the stated problem.
- When a request is ambiguous, ask one question rather than guessing.
- Never propose removing something the user didn't mention.
- Explain what a change will do in the user's terms, not in schema terms.
