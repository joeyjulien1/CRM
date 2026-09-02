"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import type { TemplateCard } from "@/lib/templates/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startFromTemplateAction } from "./actions";

export interface TemplatePreview extends TemplateCard {
  /** The same plain-language sentences ConfigDiff shows for an agent patch. */
  changes: string[];
}

/**
 * The first screen of the product. Picking a template is picking a starting
 * configuration, so it shows exactly what it will change before it changes
 * anything — the same trust surface the agent goes through.
 */
export function TemplateGallery({
  templates,
  startedFrom,
  canEditConfig,
  firstViewPath,
}: {
  templates: TemplatePreview[];
  startedFrom: string | null;
  canEditConfig: boolean;
  firstViewPath: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState(templates[0]?.id ?? "");
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];

  const start = async (templateId: string) => {
    setApplying(true);
    setError(null);
    const result = await startFromTemplateAction(templateId);
    if (result.error) {
      setError(result.error);
      setApplying(false);
      return;
    }
    router.push(result.redirectTo ?? firstViewPath);
    router.refresh();
  };

  if (!selected) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-edge px-4 py-4">
        <h1 className="text-lg font-medium">Start with a template</h1>
        <p className="mt-1 max-w-[70ch] text-xs text-content-secondary">
          Each one is a working CRM for a kind of business — fields, a pipeline, the views people
          actually open, and a couple of rules. Nothing is locked in: everything a template sets up,
          the agent can change afterwards, and one rollback puts it back.
        </p>
        {startedFrom ? (
          <p className="mt-3 text-xs text-[var(--warning)]">
            This workspace already started from the {startedFrom} template. Another one adds to what
            is here rather than replacing it — ask the agent if you want a change instead.
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <ul className="w-[300px] shrink-0 overflow-y-auto border-r border-edge" aria-label="Templates">
          {templates.map((template) => {
            const active = template.id === selected.id;
            return (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  aria-current={active}
                  className={cn(
                    "w-full border-b border-edge px-4 py-3 text-left",
                    active ? "bg-surface-hover" : "hover:bg-surface-hover",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm text-content">{template.name}</span>
                    {active ? <ArrowRight size={12} aria-hidden className="text-content-muted" /> : null}
                  </span>
                  <span className="mt-1 block text-xs text-content-secondary">{template.tagline}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => router.push(firstViewPath)}
              className="w-full px-4 py-3 text-left hover:bg-surface-hover"
            >
              <span className="text-sm text-content">Start from scratch</span>
              <span className="mt-1 block text-xs text-content-secondary">
                Contacts, companies, deals and activities, and nothing else.
              </span>
            </button>
          </li>
        </ul>

        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
          <h2 className="text-base font-medium">{selected.name}</h2>
          <p className="mt-1 text-xs text-content-secondary">{selected.who}</p>

          <ul className="mt-4 flex max-w-[70ch] flex-col gap-2">
            {selected.highlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-2 text-sm">
                <Check size={12} aria-hidden className="mt-[5px] shrink-0 text-content-muted" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>

          <section className="mt-6">
            <h3 className="text-xs uppercase tracking-wide text-content-muted">
              What it changes — {selected.changes.length} changes, all reversible
            </h3>
            <ol className="mt-2 flex max-w-[80ch] flex-col gap-1">
              {selected.changes.map((change, index) => (
                <li key={index} className="text-xs text-content-secondary">
                  {change}
                </li>
              ))}
            </ol>
          </section>

          {error ? (
            <p role="alert" className="mt-5 max-w-[70ch] text-xs text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="primary"
              disabled={applying || !canEditConfig}
              onClick={() => void start(selected.id)}
            >
              {applying ? "Setting up…" : `Use the ${selected.name} template`}
            </Button>
            {canEditConfig ? null : (
              <p className="text-xs text-content-secondary">
                Your role can look but not apply. Ask an owner or admin to set this up.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
