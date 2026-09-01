"use client";

import * as React from "react";
import { AlertTriangle, Send } from "lucide-react";
import type { ConfigPatch, ImpactSummary } from "@/lib/config/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The trust surface of the entire product. It renders a patch in plain
 * language, never JSON. Destructive changes carry the record count they would
 * affect, and anything that leaves the building — an email, a webhook — is
 * called out and confirmed separately, even inside an approved patch.
 *
 * Get this right and users let the agent restructure their CRM. Get it wrong
 * and they never trust it twice.
 */

export interface ConfigDiffProps {
  patches: ConfigPatch[];
  impact: ImpactSummary;
  onConfirm: () => void;
  onDiscard: () => void;
  status?: "ready" | "applying";
}

export function ConfigDiff({ patches, impact, onConfirm, onDiscard, status = "ready" }: ConfigDiffProps) {
  const [externalApproved, setExternalApproved] = React.useState(false);
  const blocked = impact.hasExternalEffects && !externalApproved;

  return (
    <section
      className="rounded border border-edge bg-surface-raised"
      aria-label={`${patches.length === 1 ? "One change" : `${patches.length} changes`} to review`}
    >
      <header className="border-b border-edge px-3 py-2">
        <h3 className="text-xs font-medium">
          {patches.length === 1 ? "One change to review" : `${patches.length} changes to review`}
        </h3>
      </header>

      <ul className="flex flex-col gap-2 px-3 py-3">
        {impact.items.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm">
            <span
              aria-hidden
              className={cn(
                "mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full",
                item.destructive ? "bg-[var(--danger)]" : "bg-[var(--accent)]",
              )}
            />
            <div className="min-w-0">
              <p>{item.description}</p>
              {item.destructive && item.affectedRecords !== undefined ? (
                <p className="flex items-center gap-1 text-xs text-[var(--danger)]">
                  <AlertTriangle size={11} aria-hidden />
                  {item.affectedRecords === 0
                    ? "No records hold a value here"
                    : `${item.affectedRecords.toLocaleString()} ${
                        item.affectedRecords === 1 ? "record has" : "records have"
                      } a value that would be lost`}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {impact.hasExternalEffects ? (
        <div className="border-t border-edge px-3 py-3">
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={externalApproved}
              onChange={(event) => setExternalApproved(event.target.checked)}
              className="mt-[2px] h-3 w-3 accent-[var(--accent)]"
            />
            <span className="flex items-start gap-1 text-[var(--warning)]">
              <Send size={11} className="mt-[2px] shrink-0" aria-hidden />
              This sends email or calls an external service on your behalf. Approve that separately.
            </span>
          </label>
        </div>
      ) : null}

      <footer className="flex items-center gap-2 border-t border-edge px-3 py-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          disabled={blocked || status === "applying"}
        >
          {status === "applying" ? "Applying…" : "Apply changes"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={status === "applying"}>
          Discard
        </Button>
      </footer>
    </section>
  );
}
