import { describeAction, describeCondition, describeTrigger } from "@/lib/config/describe";
import { findField } from "@/lib/config/patch";
import type { AutomationConfig, Config } from "@/lib/config/types";

/**
 * The backend tab is a picture of what the configuration already does — the
 * automations, the pipelines they read, and the objects they write to. It is
 * derived, never authored: there is no graph stored anywhere, so the picture
 * cannot drift from the behaviour.
 *
 * Layout is computed here rather than in the canvas so it can be tested, and
 * so two people looking at the same workspace see the same diagram.
 */

export type NodeKind = "object" | "pipeline" | "trigger" | "condition" | "action";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  /** The small label above the title — "Trigger", "Deals". */
  eyebrow: string;
  /** Body lines. Plain language, never ids. */
  lines: string[];
  /** Which automation this node belongs to, for selection and highlighting. */
  automationId?: string;
  /** False when the automation is switched off. Drawn dimmed, not hidden. */
  enabled: boolean;
  /** send_email and call_webhook leave the building; they are marked. */
  external: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** flow is execution order; data is "this node reads that one". */
  kind: "flow" | "data";
  automationId?: string;
  enabled: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** One band per automation, in the order they run. */
  lanes: {
    automationId: string;
    name: string;
    enabled: boolean;
    x: number;
    y: number;
    height: number;
  }[];
  width: number;
  height: number;
}

const NODE_WIDTH = 216;
const LINE_HEIGHT = 17;
const HEADER_HEIGHT = 46;
const BODY_PADDING = 10;
const COLUMN_GAP = 64;
const LANE_GAP = 40;
const MARGIN = 40;
const LANE_LABEL = 22;

function nodeHeight(lines: string[]): number {
  return HEADER_HEIGHT + BODY_PADDING * 2 + Math.max(lines.length, 1) * LINE_HEIGHT;
}

export function buildGraph(config: Config, counts: Record<string, number> = {}): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lanes: Graph["lanes"] = [];

  const columnX = (column: number) => MARGIN + column * (NODE_WIDTH + COLUMN_GAP);

  /* The data column: the objects and pipelines automations hang off. Only the
     ones something actually reads are drawn — an empty node teaches nothing. */
  const usedObjects = new Set(config.automations.map((automation) => automation.trigger.objectKey));
  for (const automation of config.automations) {
    for (const action of automation.actions) {
      if (action.type === "create_record") usedObjects.add(action.objectKey);
    }
  }

  let dataY = MARGIN;
  const objectNodeIds = new Map<string, string>();

  for (const object of config.objects) {
    if (!usedObjects.has(object.key)) continue;
    const lines = [
      `${object.fields.length} fields`,
      `${(counts[object.key] ?? 0).toLocaleString()} records`,
    ];
    const pipeline = config.pipelines.find((candidate) => candidate.objectKey === object.key);
    if (pipeline) lines.push(`${pipeline.stages.length}-stage ${pipeline.name.toLowerCase()}`);

    const id = `object:${object.key}`;
    objectNodeIds.set(object.key, id);
    nodes.push({
      id,
      kind: "object",
      title: object.labelPlural,
      eyebrow: "Data",
      lines,
      enabled: true,
      external: false,
      x: columnX(0),
      y: dataY,
      width: NODE_WIDTH,
      height: nodeHeight(lines),
    });
    dataY += nodeHeight(lines) + LANE_GAP;
  }

  /* One lane per automation: trigger, then conditions, then actions in order.
     Each lane carries its name above the trigger, so the canvas reads on its own. */
  let laneY = MARGIN + LANE_LABEL;

  for (const automation of config.automations) {
    const laneNodes: GraphNode[] = [];
    const triggerLines = triggerDetail(automation, config);
    const triggerNode: GraphNode = {
      id: `trigger:${automation.id}`,
      kind: "trigger",
      title: sentence(describeTrigger(automation, config)),
      eyebrow: "Trigger",
      lines: triggerLines,
      automationId: automation.id,
      enabled: automation.enabled,
      external: false,
      x: columnX(1),
      y: laneY,
      width: NODE_WIDTH,
      height: nodeHeight(triggerLines),
    };
    laneNodes.push(triggerNode);

    let previousId = triggerNode.id;
    let column = 2;

    if (automation.conditions.length > 0) {
      const lines = automation.conditions.map((condition) => describeCondition(config, condition));
      const conditionNode: GraphNode = {
        id: `condition:${automation.id}`,
        kind: "condition",
        title: automation.conditions.length === 1 ? "Only when" : "Only when all of",
        eyebrow: "Condition",
        lines,
        automationId: automation.id,
        enabled: automation.enabled,
        external: false,
        x: columnX(column),
        y: laneY,
        width: NODE_WIDTH,
        height: nodeHeight(lines),
      };
      laneNodes.push(conditionNode);
      edges.push({
        id: `${previousId}->${conditionNode.id}`,
        from: previousId,
        to: conditionNode.id,
        kind: "flow",
        automationId: automation.id,
        enabled: automation.enabled,
      });
      previousId = conditionNode.id;
      column += 1;
    }

    automation.actions.forEach((action, index) => {
      const external = action.type === "send_email" || action.type === "call_webhook";
      const lines = actionDetail(action, config);
      const actionNode: GraphNode = {
        id: `action:${automation.id}:${index}`,
        kind: "action",
        title: sentence(describeAction(action)),
        eyebrow: external ? "Leaves the building" : "Action",
        lines,
        automationId: automation.id,
        enabled: automation.enabled,
        external,
        x: columnX(column + index),
        y: laneY,
        width: NODE_WIDTH,
        height: nodeHeight(lines),
      };
      laneNodes.push(actionNode);
      edges.push({
        id: `${previousId}->${actionNode.id}`,
        from: previousId,
        to: actionNode.id,
        kind: "flow",
        automationId: automation.id,
        enabled: automation.enabled,
      });
      previousId = actionNode.id;

      if (action.type === "create_record") {
        const target = objectNodeIds.get(action.objectKey);
        if (target) {
          edges.push({
            id: `${actionNode.id}~>${target}`,
            from: actionNode.id,
            to: target,
            kind: "data",
            automationId: automation.id,
            enabled: automation.enabled,
          });
        }
      }
    });

    const objectNodeId = objectNodeIds.get(automation.trigger.objectKey);
    if (objectNodeId) {
      edges.push({
        id: `${objectNodeId}~>${triggerNode.id}`,
        from: objectNodeId,
        to: triggerNode.id,
        kind: "data",
        automationId: automation.id,
        enabled: automation.enabled,
      });
    }

    const laneHeight = Math.max(...laneNodes.map((node) => node.height));
    lanes.push({
      automationId: automation.id,
      name: automation.name,
      enabled: automation.enabled,
      x: columnX(1),
      y: laneY,
      height: laneHeight,
    });
    nodes.push(...laneNodes);
    laneY += laneHeight + LANE_GAP + LANE_LABEL;
  }

  const width = Math.max(...nodes.map((node) => node.x + node.width), MARGIN) + MARGIN;
  const height = Math.max(...nodes.map((node) => node.y + node.height), Math.max(dataY, laneY)) + MARGIN;

  return { nodes, edges, lanes, width, height };
}

function triggerDetail(automation: AutomationConfig, config: Config): string[] {
  const trigger = automation.trigger;
  const lines: string[] = [];

  if (trigger.type === "field_changed") {
    const field = findField(config, trigger.fieldId)?.field;
    lines.push(`Watches ${field?.label ?? "a field"}`);
  }
  if (trigger.type === "date_reached") {
    const field = findField(config, trigger.fieldId)?.field;
    const offset = trigger.offsetDays;
    const when =
      offset === 0
        ? "on the day"
        : offset < 0
          ? `${Math.abs(offset)} days before`
          : `${offset} days after`;
    lines.push(`${field?.label ?? "A date"}, ${when}`);
  }
  if (lines.length === 0) lines.push("Runs on every matching record");

  return lines;
}

function actionDetail(action: AutomationConfig["actions"][number], config: Config): string[] {
  switch (action.type) {
    case "set_field": {
      const found = findField(config, action.fieldId);
      return [`${found?.field.label ?? "Field"} → ${formatValue(action.value)}`];
    }
    case "create_record": {
      const object = config.objects.find((candidate) => candidate.key === action.objectKey);
      const count = Object.keys(action.values).length;
      return [`On ${object?.labelPlural ?? action.objectKey}`, count ? `${count} values set` : "No values set"];
    }
    case "create_task":
      return [action.dueInDays === 0 ? "Due the same day" : `Due in ${action.dueInDays} days`];
    case "send_email":
      return [`To ${action.to}`, action.subject];
    case "call_webhook":
      return [`${action.method} ${action.url}`];
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Where a wire leaves a node and where it arrives. */
export function outputPin(node: GraphNode): { x: number; y: number } {
  return { x: node.x + node.width, y: node.y + HEADER_HEIGHT / 2 + 8 };
}

export function inputPin(node: GraphNode): { x: number; y: number } {
  return { x: node.x, y: node.y + HEADER_HEIGHT / 2 + 8 };
}

/** A blueprint wire: out to the right, in from the left, no diagonals. */
export function wirePath(from: GraphNode, to: GraphNode): string {
  const start = outputPin(from);
  const end = inputPin(to);
  const distance = Math.max(Math.abs(end.x - start.x) * 0.5, 40);
  return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
}
