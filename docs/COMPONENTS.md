# Components

Nine renderers. This list is a ceiling, not a starting point — the agent can only produce views
that map onto something here. Adding a tenth is a product decision.

All of them take config plus data and render. None of them contain business logic, and none of
them know which tenant they're serving.

---

### 1. `TableView`

The workhorse. Most users will spend most of their day here.

`props: { view: ViewConfig, records: Record[], total: number }`

Column widths resizable and persisted per user. Sort by clicking a header. Inline edit on
double-click for every field type. Row selection with shift-range. Sticky header, sticky first
column. Virtualised past 100 rows — do this from the start, retrofitting virtualisation into a
table with inline editing is miserable.

Empty state invites an action: "No deals yet. Add one, or import from a spreadsheet."

### 2. `KanbanView`

`props: { view: ViewConfig, pipeline: PipelineConfig, records: Record[] }`

Columns from pipeline stages. Drag between columns writes the stage field and fires the
`field_changed` trigger. Card content is the view's first three columns. Per-column count and
sum of the currency field when one is configured. Collapse a column. Lazy-load past 50 cards
per column.

### 3. `RecordDetail`

`props: { record: Record, object: ObjectConfig, layout: LayoutConfig }`

Side panel by default, full page on deep link. Fields grouped by config. Activity timeline
(email, notes, field changes, automation runs) as the right rail. Related records by relation
config. Everything inline-editable, saving on blur, with an optimistic update and a rollback on
failure.

### 4. `FormRenderer`

`props: { object: ObjectConfig, fields: FieldConfig[], values, onChange, onSubmit }`

Drives creation, editing, and public forms from the same config. Validation comes from the
field config — required, type, options — not from hand-written rules per form. Errors render
next to the field and say what to enter, not that something is invalid.

### 5. `FilterBar`

`props: { object: ObjectConfig, filters: FilterTree, onChange }`

A typed filter tree, not a query string: field, operator, value, joined by and/or with one
level of nesting. Operators come from the field type. Serialises into the view config so a
filtered view can be saved. This component is the reason the query resolver never has to parse
anything.

### 6. `FieldRenderer`

`props: { field: FieldConfig, value, mode: 'read' | 'edit' }`

One component, a switch over the fourteen field types, two modes. Every other renderer delegates
to this — that's what keeps a currency field formatted identically in a table cell, a card, a
detail panel, and a form. Adding a field type means adding one case here and one filter
predicate; if it means touching four components, the abstraction has leaked.

### 7. `AgentPanel`

`props: { conversation, onSend, pendingPatch }`

Docked right panel, collapsible, available on every screen. Streams the response. When the
agent produces a patch it renders `ConfigDiff` inline with confirm and discard. Shows the
tenant's remaining monthly budget when it drops below 20%.

Empty state carries three example prompts drawn from what this tenant hasn't configured yet —
that's how users learn what the agent can do. Nobody reads documentation for a chat box.

### 8. `ConfigDiff`

`props: { patch: ConfigPatch, impact: ImpactSummary }`

The trust surface of the entire product. Renders a patch in plain language: "Adds a Renewal date
field to Deals" — not JSON. Destructive changes are marked with the record count affected
("Removes Source from Contacts — 412 records have a value"). External effects (email, webhook)
are called out separately and confirmed separately.

Get this component right and users let the agent restructure their CRM. Get it wrong and they
never trust it twice.

### 9. `CommandPalette`

`props: { objects, views, actions }`

Cmd-K. Jump to a view, search records across objects, run an action, open the agent with a
prefilled prompt. In a keyboard product this is the primary navigation for power users, and
it's cheap to build once the config is queryable.

---

## Shared behaviour

Every renderer handles four states explicitly: loading (skeleton at the right dimensions, not a
spinner), empty (an invitation to act), error (what happened, what to do), and populated.

None of them fetch. Data arrives as props from a server component or a resolver hook. This is
what makes them testable against fixture config, which is the only sane way to verify
config-driven UI.

## The rule

If you're about to build a view that isn't one of these, the answer is almost always to extend
a `ViewConfig` rather than write a tenth component. A "calendar view" is a table with a date
grouping. A "dashboard" is a saved set of filtered views. Resist. The ceiling is the feature.
