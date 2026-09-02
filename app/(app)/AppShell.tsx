"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Search, Sparkles } from "lucide-react";
import type { Config, ObjectKey } from "@/lib/config/types";
import type { SessionUser } from "@/lib/auth/session";
import { CommandPalette, type PaletteResult } from "@/components/renderers/CommandPalette";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { onAskAgent } from "@/components/agent/ask";
import { WorkspaceTabs, type WorkspaceSection } from "@/components/app/WorkspaceTabs";
import { Button } from "@/components/ui/button";
import { searchRecordsAction } from "./actions";
import { cn } from "@/lib/utils";

export function AppShell({
  session,
  config,
  counts,
  templatePrompts,
  children,
}: {
  session: SessionUser;
  config: Config;
  counts: Record<string, number>;
  /** Follow-ups written for this workspace's template, if it started from one. */
  templatePrompts: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [agentOpen, setAgentOpen] = React.useState(false);
  const [agentPrompt, setAgentPrompt] = React.useState("");
  const [results, setResults] = React.useState<PaletteResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  const section: WorkspaceSection = pathname.startsWith("/backend") ? "backend" : "frontend";

  /* Coming back from the backend tab should land where you left the frontend. */
  const lastFrontendPath = React.useRef<string>("");
  React.useEffect(() => {
    if (section === "frontend") lastFrontendPath.current = pathname;
  }, [pathname, section]);

  /* Anything on any screen can hand the agent a starting prompt. */
  React.useEffect(
    () =>
      onAskAgent((prompt) => {
        setAgentPrompt(prompt);
        setAgentOpen(true);
      }),
    [],
  );

  const search = React.useCallback((query: string) => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    void searchRecordsAction(query)
      .then((found) => setResults(found))
      .finally(() => setSearching(false));
  }, []);

  const viewsByObject = React.useMemo(() => {
    const grouped = new Map<ObjectKey, typeof config.views>();
    for (const view of config.views) {
      const list = grouped.get(view.objectKey) ?? [];
      list.push(view);
      grouped.set(view.objectKey, list);
    }
    return grouped;
  }, [config.views]);

  const goTo = (next: WorkspaceSection) => {
    if (next === section) return;
    if (next === "backend") router.push("/backend");
    else router.push(lastFrontendPath.current || firstViewPath(config));
  };

  const selectedRule = searchParams.get("rule");

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col border-r border-edge bg-surface-sunken" aria-label="Workspace">
        <div className="flex h-row items-center border-b border-edge px-4">
          <span className="truncate text-sm font-medium">{session.tenantName}</span>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {section === "frontend"
            ? config.objects.map((object) => (
                <div key={object.key} className="mb-4">
                  <p className="px-4 pb-2 text-xs uppercase tracking-wide text-content-muted">
                    {object.labelPlural}
                    <span className="ml-2 tabular-nums">{counts[object.key] ?? 0}</span>
                  </p>
                  <ul>
                    {(viewsByObject.get(object.key) ?? []).map((view) => {
                      const href = `/views/${view.id}`;
                      const active = pathname === href;
                      return (
                        <li key={view.id}>
                          <Link
                            href={href}
                            className={cn(
                              "flex h-row items-center px-4 text-sm",
                              active
                                ? "bg-surface text-content border-l-2 border-[var(--accent)]"
                                : "text-content-secondary hover:bg-surface-hover hover:text-content",
                            )}
                          >
                            {view.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            : (
              <div className="mb-4">
                <p className="px-4 pb-2 text-xs uppercase tracking-wide text-content-muted">
                  Rules
                  <span className="ml-2 tabular-nums">{config.automations.length}</span>
                </p>
                {config.automations.length === 0 ? (
                  <p className="px-4 text-xs text-content-secondary">
                    Nothing runs on its own yet.
                  </p>
                ) : (
                  <ul>
                    {config.automations.map((automation) => {
                      const active = selectedRule === automation.id;
                      return (
                        <li key={automation.id}>
                          <Link
                            href={`/backend?rule=${automation.id}`}
                            className={cn(
                              "flex min-h-row items-center gap-2 px-4 py-1 text-sm",
                              active
                                ? "bg-surface text-content border-l-2 border-[var(--accent)]"
                                : "text-content-secondary hover:bg-surface-hover hover:text-content",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                automation.enabled ? "bg-[var(--success)]" : "bg-[var(--border-strong)]",
                              )}
                            />
                            <span className="truncate" title={automation.name}>
                              {automation.name}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
        </div>

        <div className="border-t border-edge p-3">
          <Link
            href="/start"
            className="flex h-row items-center gap-2 px-1 text-xs text-content-secondary hover:text-content"
          >
            <Sparkles size={12} aria-hidden />
            Start with a template
          </Link>
          <Link
            href="/settings/history"
            className="flex h-row items-center px-1 text-xs text-content-secondary hover:text-content"
          >
            Configuration history
          </Link>
          <Link
            href="/settings/import"
            className="flex h-row items-center px-1 text-xs text-content-secondary hover:text-content"
          >
            Import a spreadsheet
          </Link>
          <Link
            href="/settings/email"
            className="flex h-row items-center px-1 text-xs text-content-secondary hover:text-content"
          >
            Email
          </Link>
          <p className="px-1 pt-2 text-xs text-content-muted">{session.email}</p>
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-row shrink-0 items-center justify-between gap-3 border-b border-edge px-4">
          <div className="flex items-center gap-3">
            <WorkspaceTabs section={section} onChange={goTo} />
            <button
              type="button"
              onClick={() => {
                const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
                window.dispatchEvent(event);
              }}
              className="flex h-[calc(var(--control-h)-6px)] items-center gap-2 rounded border border-edge px-2 text-xs text-content-muted hover:bg-surface-hover"
            >
              <Search size={12} aria-hidden />
              Search
              <kbd className="ml-2 font-mono text-xs">⌘K</kbd>
            </button>
          </div>

          <Button
            variant={agentOpen ? "primary" : "secondary"}
            size="sm"
            onClick={() => setAgentOpen((open) => !open)}
            aria-pressed={agentOpen}
          >
            <MessageSquare size={12} aria-hidden />
            Agent
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">{children}</div>
          {agentOpen ? (
            <AgentPanel
              config={config}
              counts={counts}
              canEditConfig={session.canEditConfig}
              suggestions={templatePrompts}
              initialPrompt={agentPrompt}
              onClose={() => setAgentOpen(false)}
              onApplied={() => router.refresh()}
            />
          ) : null}
        </div>
      </main>

      <CommandPalette
        objects={config.objects}
        views={config.views}
        actions={[
          { id: "backend", label: "Open the backend", run: () => router.push("/backend") },
          { id: "template", label: "Start with a template", run: () => router.push("/start") },
          { id: "import", label: "Import a spreadsheet", run: () => router.push("/settings/import") },
          { id: "history", label: "Open configuration history", run: () => router.push("/settings/history") },
        ]}
        results={results}
        searching={searching}
        onQueryChange={search}
        onOpenView={(viewId) => router.push(`/views/${viewId}`)}
        onOpenRecord={(recordId) => router.push(`/records/${recordId}`)}
        onAskAgent={(prompt) => {
          setAgentPrompt(prompt);
          setAgentOpen(true);
        }}
      />
    </div>
  );
}

function firstViewPath(config: Config): string {
  const first = config.views[0];
  return first ? `/views/${first.id}` : "/settings/history";
}
