"use client";

import * as React from "react";
import { Layers, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceSection = "frontend" | "backend";

/**
 * The one switch that changes what the whole window is about: what the CRM
 * looks like, or what it does when nobody is watching. A segmented control
 * rather than navigation — two places, always both visible, no menu.
 */
export function WorkspaceTabs({
  section,
  onChange,
}: {
  section: WorkspaceSection;
  onChange: (section: WorkspaceSection) => void;
}) {
  const tabs: { key: WorkspaceSection; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: "frontend", label: "Frontend", hint: "⌘1", icon: <Layers size={12} aria-hidden /> },
    { key: "backend", label: "Backend", hint: "⌘2", icon: <Workflow size={12} aria-hidden /> },
  ];

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "1") {
        event.preventDefault();
        onChange("frontend");
      }
      if (event.key === "2") {
        event.preventDefault();
        onChange("backend");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onChange]);

  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="flex items-center gap-1 rounded border border-edge bg-surface-sunken p-[2px]"
    >
      {tabs.map((tab) => {
        const active = tab.key === section;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={active}
            title={`${tab.label} (${tab.hint})`}
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex h-[calc(var(--control-h)-8px)] items-center gap-2 rounded-sm px-3 text-xs transition-colors duration-fast",
              active
                ? "bg-surface text-content shadow-[inset_0_0_0_1px_var(--border-subtle)]"
                : "text-content-secondary hover:text-content",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
