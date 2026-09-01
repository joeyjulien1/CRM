"use client";

import * as React from "react";
import type { ConfigPatch, CrmRecord, ImpactSummary } from "@/lib/config/types";
import { ConfigDiff } from "@/components/agent/ConfigDiff";
import { KanbanView } from "@/components/renderers/KanbanView";
import { defaultConfig } from "@/lib/config/default";
import { resolveView } from "@/lib/runtime/view";

/**
 * The hero shows the product doing the thing: a real ConfigDiff and a real
 * board, rendered by the same components the app uses, from the same config
 * schema. Not an illustration of a CRM.
 */

const PATCHES: ConfigPatch[] = [
  {
    op: "add_field",
    objectKey: "deal",
    field: {
      id: "fld_renewal",
      key: "renewal_date",
      label: "Renewal date",
      type: "date",
      required: false,
      system: false,
    },
  },
  {
    op: "create_view",
    view: {
      id: "vw_renewals",
      objectKey: "deal",
      name: "Renewing this quarter",
      renderer: "table",
      columns: ["fld_deal_name", "fld_deal_amount", "fld_renewal"],
    },
  },
];

const IMPACT: ImpactSummary = {
  items: [
    { description: "Adds a Renewal date field (date) to Deals", destructive: false, externalEffect: false },
    {
      description: 'Adds a table called "Renewing this quarter" to Deals',
      destructive: false,
      externalEffect: false,
    },
  ],
  hasDestructive: false,
  hasExternalEffects: false,
};

const DEALS: CrmRecord[] = [
  deal("1", "Northwind renewal", 48000, "qualified", "2026-03-31"),
  deal("2", "Initech expansion", 26500, "qualified", "2026-04-14"),
  deal("3", "Globex platform", 120000, "proposal", "2026-02-27"),
  deal("4", "Umbrella pilot", 9000, "new", "2026-05-08"),
  deal("5", "Soylent rollout", 64000, "negotiation", "2026-03-06"),
];

function deal(id: string, name: string, amount: number, stage: string, closeDate: string): CrmRecord {
  return {
    id,
    objectKey: "deal",
    data: {
      fld_deal_name: name,
      fld_deal_amount: amount,
      fld_deal_stage: stage,
      fld_deal_close_date: closeDate,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function HeroDemo() {
  const config = React.useMemo(() => defaultConfig(), []);
  const board = React.useMemo(() => resolveView(config, "vw_deal_board"), [config]);
  const [applied, setApplied] = React.useState(false);

  return (
    <div data-density="app" className="grid gap-3 lg:grid-cols-[380px_1fr]">
      <div className="rounded-lg border border-edge bg-surface p-3">
        <p className="mb-3 text-sm text-content-secondary">
          &ldquo;Add a renewal date to deals and show me the ones renewing this quarter.&rdquo;
        </p>
        {applied ? (
          <p className="rounded border border-edge px-3 py-3 text-sm">
            Applied as version 12. Roll it back at any time.
          </p>
        ) : (
          <ConfigDiff
            patches={PATCHES}
            impact={IMPACT}
            onConfirm={() => setApplied(true)}
            onDiscard={() => setApplied(false)}
          />
        )}
      </div>

      {board.renderer === "kanban" ? (
        <div className="h-[320px] overflow-hidden rounded-lg border border-edge bg-surface">
          <KanbanView
            view={board.view}
            pipeline={board.pipeline}
            stageField={board.stageField}
            cardFields={board.cardFields}
            sumField={board.sumField}
            records={DEALS}
          />
        </div>
      ) : null}
    </div>
  );
}
