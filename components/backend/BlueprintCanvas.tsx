"use client";

import * as React from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { Graph, GraphNode } from "@/lib/backend/graph";
import { inputPin, outputPin, wirePath } from "@/lib/backend/graph";
import { cn } from "@/lib/utils";

/**
 * The blueprint. Nodes are laid out by lib/backend/graph.ts; this component
 * owns pan, zoom, node dragging and selection, and nothing else. It never
 * fetches and never writes — a change to what runs is a config patch, made
 * through the inspector or the agent.
 */

export interface BlueprintCanvasProps {
  graph: Graph;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  /** Per-node drag offsets, so a person can tidy the diagram. */
  offsets: Record<string, { dx: number; dy: number }>;
  onMoveNode: (nodeId: string, offset: { dx: number; dy: number }) => void;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
/** Fit never zooms out past the point where a node stops being readable. */
const FIT_MIN = 0.75;

export function BlueprintCanvas({
  graph,
  selectedId,
  onSelect,
  offsets,
  onMoveNode,
}: BlueprintCanvasProps) {
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const frameRef = React.useRef<HTMLDivElement>(null);
  /* Once someone has panned or zoomed, the view is theirs — resizing the
     window, or opening the agent, must not throw their position away. */
  const touchedRef = React.useRef(false);
  const dragRef = React.useRef<
    | { kind: "pan"; startX: number; startY: number; originX: number; originY: number }
    | { kind: "node"; nodeId: string; startX: number; startY: number; originDx: number; originDy: number }
    | null
  >(null);

  const positioned = React.useMemo(
    () =>
      graph.nodes.map((node) => {
        const offset = offsets[node.id];
        return offset ? { ...node, x: node.x + offset.dx, y: node.y + offset.dy } : node;
      }),
    [graph.nodes, offsets],
  );

  const byId = React.useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of positioned) map.set(node.id, node);
    return map;
  }, [positioned]);

  const selectedAutomation = selectedId ? byId.get(selectedId)?.automationId : undefined;

  /** Fit shows the whole diagram, centred — never smaller than it has to be. */
  const fit = React.useCallback(() => {
    const frame = frameRef.current;
    if (!frame || graph.nodes.length === 0) return;
    const scale = clamp(
      Math.max(
        FIT_MIN,
        Math.min(frame.clientWidth / (graph.width + 32), frame.clientHeight / (graph.height + 32), 1),
      ),
    );
    setZoom(scale);
    setPan({
      x: Math.max(0, (frame.clientWidth - graph.width * scale) / 2),
      y: Math.min(120, Math.max(24, (frame.clientHeight - graph.height * scale) / 2)),
    });
  }, [graph.height, graph.nodes.length, graph.width]);

  React.useEffect(() => {
    fit();
  }, [fit]);

  /* The canvas is not always the same width — the agent panel takes a third of
     it. Refit while the view is still the one this component chose. */
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!touchedRef.current) fit();
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fit]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = (event.target as HTMLElement).closest("[data-node-id]");
    if (target) {
      const nodeId = target.getAttribute("data-node-id")!;
      const offset = offsets[nodeId] ?? { dx: 0, dy: 0 };
      dragRef.current = {
        kind: "node",
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        originDx: offset.dx,
        originDy: offset.dy,
      };
      onSelect(nodeId);
    } else {
      dragRef.current = {
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      onSelect(null);
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;

    if (drag.kind === "pan") {
      touchedRef.current = true;
      setPan({ x: drag.originX + dx * zoom, y: drag.originY + dy * zoom });
    } else {
      onMoveNode(drag.nodeId, { dx: drag.originDx + dx, dy: drag.originDy + dy });
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    dragRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    touchedRef.current = true;
    setZoom((current) => clamp(current - event.deltaY * 0.002));
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-sunken">
      <div
        ref={frameRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        style={{
          backgroundImage: "radial-gradient(var(--border-subtle) 1px, transparent 1px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          className="relative origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: graph.width,
            height: graph.height,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={graph.width}
            height={graph.height}
            aria-hidden
          >
            {graph.lanes.map((lane) => (
              <text
                key={lane.automationId}
                x={lane.x}
                y={lane.y - 8}
                fill="var(--text-muted)"
                fontSize={11}
                opacity={lane.enabled ? 1 : 0.5}
              >
                {lane.name}
                {lane.enabled ? "" : " · off"}
              </text>
            ))}

            {graph.edges.map((edge) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const lit = selectedAutomation && edge.automationId === selectedAutomation;
              const start = outputPin(from);
              const end = inputPin(to);
              const colour = lit ? "var(--accent)" : "var(--border-strong)";
              return (
                <g key={edge.id} opacity={edge.enabled ? 1 : 0.35}>
                  <path
                    d={wirePath(from, to)}
                    fill="none"
                    stroke={colour}
                    strokeWidth={lit ? 2 : 1.5}
                    strokeDasharray={edge.kind === "data" ? "4 4" : undefined}
                  />
                  <circle cx={start.x} cy={start.y} r={3} fill={colour} />
                  <circle cx={end.x} cy={end.y} r={3} fill={colour} />
                </g>
              );
            })}
          </svg>

          {positioned.map((node) => (
            <BlueprintNode
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              lit={Boolean(selectedAutomation && node.automationId === selectedAutomation)}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded border border-edge bg-surface p-1">
        <button
          type="button"
          aria-label="Zoom out"
          className="flex h-5 w-5 items-center justify-center rounded-sm text-content-secondary hover:bg-surface-hover hover:text-content"
          onClick={() => {
            touchedRef.current = true;
            setZoom((current) => clamp(current - 0.1));
          }}
        >
          <Minus size={12} aria-hidden />
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-content-secondary">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          className="flex h-5 w-5 items-center justify-center rounded-sm text-content-secondary hover:bg-surface-hover hover:text-content"
          onClick={() => {
            touchedRef.current = true;
            setZoom((current) => clamp(current + 0.1));
          }}
        >
          <Plus size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Fit the diagram"
          className="flex h-5 w-5 items-center justify-center rounded-sm text-content-secondary hover:bg-surface-hover hover:text-content"
          onClick={() => {
            touchedRef.current = false;
            fit();
          }}
        >
          <Maximize2 size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function BlueprintNode({
  node,
  selected,
  lit,
}: {
  node: GraphNode;
  selected: boolean;
  lit: boolean;
}) {
  return (
    <div
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={cn(
        "absolute select-none rounded border bg-surface-raised",
        selected ? "border-[var(--accent)]" : lit ? "border-edge-strong" : "border-edge",
        node.enabled ? "" : "opacity-55",
      )}
      style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-t border-b border-edge px-3 py-2",
          node.kind === "trigger" && "bg-[var(--surface-hover)]",
          node.external && "bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]",
        )}
      >
        <span className="text-xs uppercase tracking-wide text-content-muted">{node.eyebrow}</span>
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 rounded-full",
            node.kind === "object" && "bg-[var(--border-strong)]",
            node.kind === "trigger" && "bg-[var(--accent)]",
            node.kind === "condition" && "bg-[var(--warning)]",
            node.kind === "action" && "bg-[var(--success)]",
            node.external && "bg-[var(--danger)]",
          )}
        />
      </div>

      <div className="px-3 py-2">
        <p className="text-sm text-content">{node.title}</p>
        <ul className="mt-1 flex flex-col gap-[2px]">
          {node.lines.map((line, index) => (
            <li key={index} className="truncate text-xs text-content-secondary" title={line}>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function clamp(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom.toFixed(2))));
}
