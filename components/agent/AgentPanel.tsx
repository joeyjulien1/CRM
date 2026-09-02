"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { Config, ConfigPatch, ImpactSummary } from "@/lib/config/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ConfigDiff } from "./ConfigDiff";
import { cn } from "@/lib/utils";

/**
 * Docked, collapsible, available on every screen. When the agent produces a
 * patch it renders ConfigDiff inline, and nothing is applied until the user
 * confirms it here.
 */

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface PendingPatch {
  patches: ConfigPatch[];
  impact: ImpactSummary;
}

export interface AgentPanelProps {
  config: Config;
  counts: Record<string, number>;
  canEditConfig: boolean;
  /** Examples written for this workspace's template. Falls back to derived ones. */
  suggestions?: string[];
  initialPrompt?: string;
  onClose: () => void;
  onApplied: () => void;
}

export function AgentPanel({
  config,
  counts,
  canEditConfig,
  suggestions: given,
  initialPrompt,
  onClose,
  onApplied,
}: AgentPanelProps) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState(initialPrompt ?? "");
  const [streaming, setStreaming] = React.useState(false);
  const [pending, setPending] = React.useState<PendingPatch | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [budget, setBudget] = React.useState<{ remaining: number; fraction: number } | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  const send = async (prompt: string) => {
    if (!prompt.trim() || streaming) return;
    setError(null);
    setPending(null);
    setInput("");
    setTurns((current) => [...current, { role: "user", text: prompt }, { role: "assistant", text: "" }]);
    setStreaming(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || "The agent could not be reached.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "text"; delta: string }
            | { type: "patch"; patches: ConfigPatch[]; impact: ImpactSummary }
            | { type: "budget"; remaining: number; fraction: number }
            | { type: "error"; message: string };

          if (event.type === "text") {
            setTurns((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === "assistant") next[next.length - 1] = { ...last, text: last.text + event.delta };
              return next;
            });
          } else if (event.type === "patch") {
            setPending({ patches: event.patches, impact: event.impact });
          } else if (event.type === "budget") {
            setBudget({ remaining: event.remaining, fraction: event.fraction });
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong reaching the agent.");
    } finally {
      setStreaming(false);
    }
  };

  const apply = async () => {
    if (!pending) return;
    setApplying(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patches: pending.patches }),
      });
      if (!response.ok) throw new Error((await response.text()) || "Those changes could not be applied.");
      setPending(null);
      setTurns((current) => [...current, { role: "assistant", text: "Applied." }]);
      onApplied();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Those changes could not be applied.");
    } finally {
      setApplying(false);
    }
  };

  const suggestions = React.useMemo(
    () => (given && given.length > 0 ? given.slice(0, 3) : suggestPrompts(config, counts)),
    [config, counts, given],
  );
  const lowBudget = budget !== null && budget.fraction >= 0.8;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-edge bg-surface" aria-label="Agent">
      <header className="flex h-row shrink-0 items-center justify-between border-b border-edge px-4">
        <h2 className="text-sm font-medium">Agent</h2>
        <button type="button" onClick={onClose} aria-label="Close the agent" className="text-content-secondary hover:text-content">
          <X size={14} aria-hidden />
        </button>
      </header>

      {lowBudget ? (
        <p className="border-b border-edge px-4 py-2 text-xs text-[var(--warning)]">
          {budget.remaining.toLocaleString()} tokens left this month.
        </p>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-content-secondary">
              Describe what you want your CRM to do. Every change comes back as something you approve first.
            </p>
            {/* Nobody reads documentation for a chat box, so the examples are
                drawn from what this workspace has not configured yet. */}
            <ul className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="w-full rounded border border-edge px-3 py-2 text-left text-sm hover:bg-surface-hover"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map((turn, index) => (
              <div key={index} className={cn("text-sm", turn.role === "user" ? "text-content" : "text-content-secondary")}>
                <p className="mb-1 text-xs uppercase tracking-wide text-content-muted">
                  {turn.role === "user" ? "You" : "Agent"}
                </p>
                <p className="whitespace-pre-wrap">
                  {turn.text || (streaming && index === turns.length - 1 ? "…" : "")}
                </p>
              </div>
            ))}

            {pending && canEditConfig ? (
              <ConfigDiff
                patches={pending.patches}
                impact={pending.impact}
                status={applying ? "applying" : "ready"}
                onConfirm={() => void apply()}
                onDiscard={() => setPending(null)}
              />
            ) : pending ? (
              <p className="text-xs text-content-muted">
                Your role can review changes but not apply them. Ask an owner or admin to confirm.
              </p>
            ) : null}
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-xs text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="shrink-0 border-t border-edge p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          rows={3}
          placeholder="Ask for a change…"
          aria-label="Ask the agent"
          disabled={streaming}
        />
        <div className="mt-2 flex justify-end">
          <Button type="submit" variant="primary" size="sm" disabled={streaming || !input.trim()}>
            {streaming ? "Thinking…" : "Send"}
          </Button>
        </div>
      </form>
    </aside>
  );
}

/** Three examples, chosen from what this tenant has not set up yet. */
function suggestPrompts(config: Config, counts: Record<string, number>): string[] {
  const suggestions: string[] = [];

  if (config.automations.length === 0) {
    suggestions.push("Create a follow-up task whenever a deal moves to Proposal");
  }
  if (!config.views.some((view) => view.renderer === "kanban")) {
    suggestions.push("Show my deals as a board by stage");
  }

  const contact = config.objects.find((object) => object.key === "contact");
  if (contact && !contact.fields.some((field) => field.label.toLowerCase().includes("source"))) {
    suggestions.push("Track where each contact came from");
  }

  const deal = config.objects.find((object) => object.key === "deal");
  if (deal && !deal.fields.some((field) => field.type === "date" && field.label.toLowerCase().includes("renewal"))) {
    suggestions.push("Add a renewal date to deals and show me deals renewing this quarter");
  }
  if ((counts.contact ?? 0) === 0) {
    suggestions.push("Help me import my contacts from a spreadsheet");
  }

  suggestions.push("Rename Companies to Accounts");

  return suggestions.slice(0, 3);
}
