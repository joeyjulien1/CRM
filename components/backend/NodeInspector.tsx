"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import type { Graph, GraphNode } from "@/lib/backend/graph";
import type { AutomationConfig, Config } from "@/lib/config/types";
import { describeAction, describeCondition, describeTrigger } from "@/lib/config/describe";
import { Button } from "@/components/ui/button";
import { askAgent } from "@/components/agent/ask";

/**
 * The right rail. It explains the selected node in the same plain language
 * ConfigDiff uses, and offers the two things a person can do about it: switch
 * the rule off, or ask the agent to change it.
 */
export function NodeInspector({
  config,
  graph,
  node,
  canEditConfig,
  busy,
  onToggle,
}: {
  config: Config;
  graph: Graph;
  node: GraphNode | null;
  canEditConfig: boolean;
  busy: boolean;
  onToggle: (automationId: string, enabled: boolean) => void;
}) {
  if (!node) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-edge bg-surface" aria-label="Details">
        <header className="flex h-row shrink-0 items-center border-b border-edge px-4">
          <h2 className="text-sm font-medium">Details</h2>
        </header>
        <div className="px-4 py-4 text-xs text-content-secondary">
          <p>Select a node to see what it does.</p>
          <p className="mt-3 text-content-muted">
            Solid wires are the order things run in. Dashed wires show which records a step reads or
            writes.
          </p>
          <dl className="mt-4 flex flex-col gap-2">
            <Legend colour="var(--accent)" term="Trigger" description="What starts the rule" />
            <Legend colour="var(--warning)" term="Condition" description="What has to be true" />
            <Legend colour="var(--success)" term="Action" description="What happens next" />
            <Legend colour="var(--danger)" term="External" description="Email or webhook — leaves the building" />
          </dl>
        </div>
      </aside>
    );
  }

  const automation = node.automationId
    ? config.automations.find((candidate) => candidate.id === node.automationId)
    : undefined;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-edge bg-surface" aria-label="Details">
      <header className="flex h-row shrink-0 items-center justify-between gap-2 border-b border-edge px-4">
        <h2 className="truncate text-sm font-medium">{automation?.name ?? node.title}</h2>
        <span className="shrink-0 text-xs uppercase tracking-wide text-content-muted">{node.eyebrow}</span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {automation ? (
          <AutomationDetail config={config} automation={automation} />
        ) : (
          <ObjectDetail config={config} node={node} graph={graph} />
        )}
      </div>

      {automation ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-edge p-3">
          {canEditConfig ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onToggle(automation.id, !automation.enabled)}
            >
              {busy ? "Saving…" : automation.enabled ? "Turn off" : "Turn on"}
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => askAgent(`Change the "${automation.name}" automation so that `)}
          >
            Ask the agent to change this
          </Button>
        </div>
      ) : (
        <div className="shrink-0 border-t border-edge p-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => askAgent(`On ${node.title}, I want to `)}
          >
            Ask the agent about {node.title}
          </Button>
        </div>
      )}
    </aside>
  );
}

function AutomationDetail({ config, automation }: { config: Config; automation: AutomationConfig }) {
  const external = automation.actions.filter(
    (action) => action.type === "send_email" || action.type === "call_webhook",
  );

  return (
    <div className="flex flex-col gap-4 text-xs">
      <p className="text-sm text-content-secondary">
        Runs {describeTrigger(automation, config)}.
      </p>

      <Section title="Only when">
        {automation.conditions.length === 0 ? (
          <p className="text-content-muted">Nothing has to be true — it runs every time.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {automation.conditions.map((condition, index) => (
              <li key={index} className="text-content-secondary">
                {describeCondition(config, condition)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Then">
        <ol className="flex flex-col gap-1">
          {automation.actions.map((action, index) => (
            <li key={index} className="text-content-secondary">
              {index + 1}. {describeAction(action)}
            </li>
          ))}
        </ol>
      </Section>

      {external.length > 0 ? (
        <p className="flex items-start gap-2 rounded border border-edge px-3 py-2 text-[var(--warning)]">
          <ExternalLink size={12} className="mt-[2px] shrink-0" aria-hidden />
          <span>
            {external.length === 1 ? "One step leaves" : `${external.length} steps leave`} the building.
            Anyone can see who it contacts here before it runs again.
          </span>
        </p>
      ) : null}

      <p className="text-content-muted">
        {automation.enabled ? "On. It runs whenever the trigger fires." : "Off. Nothing runs until it is switched back on."}
      </p>
    </div>
  );
}

function ObjectDetail({ config, node, graph }: { config: Config; node: GraphNode; graph: Graph }) {
  const objectKey = node.id.replace("object:", "");
  const object = config.objects.find((candidate) => candidate.key === objectKey);
  const pipeline = config.pipelines.find((candidate) => candidate.objectKey === objectKey);
  const readers = graph.edges.filter((edge) => edge.from === node.id).length;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <p className="text-sm text-content-secondary">
        {object?.labelPlural ?? node.title} — {object?.fields.length ?? 0} fields, read by {readers}{" "}
        {readers === 1 ? "rule" : "rules"}.
      </p>

      {pipeline ? (
        <Section title={pipeline.name}>
          <ol className="flex flex-col gap-1">
            {pipeline.stages.map((stage) => (
              <li key={stage.key} className="flex items-center justify-between text-content-secondary">
                <span>{stage.label}</span>
                {stage.probability !== undefined ? (
                  <span className="tabular-nums text-content-muted">{stage.probability}%</span>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="Fields">
        <ul className="flex flex-col gap-1">
          {(object?.fields ?? []).map((field) => (
            <li key={field.id} className="flex items-center justify-between gap-2 text-content-secondary">
              <span className="truncate">{field.label}</span>
              <span className="shrink-0 text-content-muted">{field.type.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs uppercase tracking-wide text-content-muted">{title}</h3>
      {children}
    </section>
  );
}

function Legend({ colour, term, description }: { colour: string; term: string; description: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} />
      <dt className="text-content">{term}</dt>
      <dd className="text-content-muted">{description}</dd>
    </div>
  );
}
