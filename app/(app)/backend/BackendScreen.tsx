"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Config } from "@/lib/config/types";
import { buildGraph } from "@/lib/backend/graph";
import { BlueprintCanvas } from "@/components/backend/BlueprintCanvas";
import { NodeInspector } from "@/components/backend/NodeInspector";
import { askAgent } from "@/components/agent/ask";
import { Button } from "@/components/ui/button";
import { setAutomationEnabledAction } from "./actions";

/**
 * What the CRM does when nobody is looking, drawn from the configuration that
 * does it. Nothing here is a second source of truth — hide the tab and the
 * behaviour is unchanged.
 */
export function BackendScreen({
  config,
  counts,
  canEditConfig,
  suggestions,
}: {
  config: Config;
  counts: Record<string, number>;
  canEditConfig: boolean;
  suggestions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const graph = React.useMemo(() => buildGraph(config, counts), [config, counts]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  /* A rule picked in the sidebar is addressable: /backend?rule=au_kickoff opens
     with that lane selected, which is also what a shared link should do. */
  const requestedRule = searchParams.get("rule");
  React.useEffect(() => {
    if (requestedRule) setSelectedId(`trigger:${requestedRule}`);
  }, [requestedRule]);
  const [offsets, setOffsets] = React.useState<Record<string, { dx: number; dy: number }>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* Where someone dragged a node is a per-person preference, not configuration:
     it stays in this browser and never becomes a version. */
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem("crm.blueprint.offsets");
      if (stored) setOffsets(JSON.parse(stored) as Record<string, { dx: number; dy: number }>);
    } catch {
      // A browser with storage switched off still gets the default layout.
    }
  }, []);

  const moveNode = React.useCallback((nodeId: string, offset: { dx: number; dy: number }) => {
    setOffsets((current) => {
      const next = { ...current, [nodeId]: offset };
      try {
        window.localStorage.setItem("crm.blueprint.offsets", JSON.stringify(next));
      } catch {
        // Not worth telling anyone about; the diagram still moves.
      }
      return next;
    });
  }, []);

  const toggle = async (automationId: string, enabled: boolean) => {
    setBusy(true);
    setError(null);
    const result = await setAutomationEnabledAction(automationId, enabled);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  };

  const selected = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const running = config.automations.filter((automation) => automation.enabled).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-row shrink-0 items-center justify-between gap-4 border-b border-edge px-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-medium">Backend</h1>
          <p className="text-xs text-content-secondary">
            {config.automations.length === 0
              ? "Nothing runs on its own yet"
              : `${running} of ${config.automations.length} rules running`}
          </p>
        </div>
        <Button size="sm" onClick={() => askAgent("Add a rule that ")}>
          Add a rule
        </Button>
      </header>

      {error ? (
        <p role="alert" className="border-b border-edge px-4 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {config.automations.length === 0 ? (
          <EmptyBlueprint suggestions={suggestions} />
        ) : (
          <div className="min-w-0 flex-1">
            <BlueprintCanvas
              graph={graph}
              selectedId={selectedId}
              onSelect={setSelectedId}
              offsets={offsets}
              onMoveNode={moveNode}
            />
          </div>
        )}

        <NodeInspector
          config={config}
          graph={graph}
          node={selected}
          canEditConfig={canEditConfig}
          busy={busy}
          onToggle={(automationId, enabled) => void toggle(automationId, enabled)}
        />
      </div>
    </div>
  );
}

/** An empty canvas invites the first rule rather than describing its absence. */
function EmptyBlueprint({ suggestions }: { suggestions: string[] }) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center bg-surface-sunken px-6"
      style={{
        backgroundImage: "radial-gradient(var(--border-subtle) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="max-w-[420px] rounded border border-edge bg-surface p-5">
        <h2 className="text-sm font-medium">Wire up the first rule</h2>
        <p className="mt-2 text-xs text-content-secondary">
          Rules are what your CRM does without being asked: raise a task, fill a field, create a
          record. Describe one and the agent draws it here for you to approve.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => askAgent(suggestion)}
                className="w-full rounded border border-edge px-3 py-2 text-left text-sm hover:bg-surface-hover"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
