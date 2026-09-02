# The backend tab

Two tabs, one workspace: **Frontend** is what the CRM looks like — the views people open all
day. **Backend** is what it does when nobody is looking — the rules that fire, the data they
read, the steps they run in order.

The switch is a segmented control in the header, with ⌘1 and ⌘2. It is the only navigation in
the product that changes what the whole window is about, so it never hides in a menu.

## The blueprint is derived, never authored

`lib/backend/graph.ts` turns the config into nodes and wires. There is no graph stored
anywhere. Hide the tab and the behaviour is identical — which is the point: a picture that can
drift from the thing it pictures is worse than no picture.

Layout is computed in that module rather than in the canvas, so it is testable and so two
people looking at the same workspace see the same diagram.

```
[ Data ] ---┐
            └-> [ Trigger ] -> [ Condition ] -> [ Action ] -> [ Action ]
```

- **Solid wires** are execution order.
- **Dashed wires** are data: which object a trigger watches, which one an action writes.
- **One lane per rule**, labelled with the rule's name, in the order they are configured.
- **A switched-off rule is dimmed, not hidden.** A rule you cannot see is a rule you cannot
  debug.
- **An external step is marked** — `send_email` and `call_webhook` leave the building, and the
  inspector says so in words as well as colour.

`components/backend/BlueprintCanvas.tsx` owns pan, zoom, node dragging and selection, and
nothing else. Where someone dragged a node is a per-person preference: it lives in that
browser's local storage and never becomes a config version.

## What the tab can change

One thing on its own: switching a rule on or off, which is a `set_automation_enabled` patch
and a new version like any other. Everything structural — a new step, a changed condition, a
different trigger — goes to the agent, because the agent is where config changes get reviewed
before they apply. The inspector's primary button opens the agent with the rule already named
in the prompt.

## Why this is not a tenth renderer

`docs/COMPONENTS.md` caps the renderers at nine, and that ceiling is about **views of customer
records** that the agent can generate from a `ViewConfig`. The blueprint renders configuration,
not records; the agent cannot emit one; there is no `renderer: "blueprint"` and there must not
be. It sits with `ConfigDiff` and the configuration history — surfaces that explain the
configuration to the person who owns it.

If a request arrives to "show deals as a graph", that is a view, and the answer is still no.
