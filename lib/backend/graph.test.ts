import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default";
import { applyPatches } from "@/lib/config/patch";
import type { Config } from "@/lib/config/types";
import { saas } from "@/lib/templates/definitions/saas";
import { buildGraph, inputPin, outputPin, wirePath } from "./graph";

const base = defaultConfig();
const configured: Config = applyPatches(base, saas.patches(base));

describe("buildGraph", () => {
  it("draws nothing for a workspace with no automations", () => {
    const graph = buildGraph(base);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.lanes).toHaveLength(0);
  });

  it("gives every automation a lane, in the order they are configured", () => {
    const graph = buildGraph(configured);
    expect(graph.lanes.map((lane) => lane.automationId)).toEqual(
      configured.automations.map((automation) => automation.id),
    );
    for (let index = 1; index < graph.lanes.length; index++) {
      expect(graph.lanes[index]!.y).toBeGreaterThan(graph.lanes[index - 1]!.y);
    }
  });

  it("chains trigger to condition to action, left to right", () => {
    const graph = buildGraph(configured);
    const automation = configured.automations.find((candidate) => candidate.conditions.length > 0)!;
    const trigger = graph.nodes.find((node) => node.id === `trigger:${automation.id}`)!;
    const condition = graph.nodes.find((node) => node.id === `condition:${automation.id}`)!;
    const action = graph.nodes.find((node) => node.id === `action:${automation.id}:0`)!;

    expect(trigger.x).toBeLessThan(condition.x);
    expect(condition.x).toBeLessThan(action.x);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ from: trigger.id, to: condition.id, kind: "flow" }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ from: condition.id, to: action.id, kind: "flow" }),
    );
  });

  it("wires each trigger back to the object it watches", () => {
    const graph = buildGraph(configured, { deal: 12 });
    const dealNode = graph.nodes.find((node) => node.id === "object:deal");
    expect(dealNode?.lines).toContain("12 records");
    for (const automation of configured.automations.filter((a) => a.trigger.objectKey === "deal")) {
      expect(graph.edges).toContainEqual(
        expect.objectContaining({ from: "object:deal", to: `trigger:${automation.id}`, kind: "data" }),
      );
    }
  });

  it("says so in plain language — no ids anywhere on a node", () => {
    const graph = buildGraph(configured);
    for (const node of graph.nodes) {
      for (const text of [node.title, node.eyebrow, ...node.lines]) {
        expect(text).not.toContain("fld_");
        expect(text).not.toContain("au_");
      }
    }
  });

  it("marks an action that leaves the building", () => {
    const withEmail = applyPatches(configured, [
      {
        op: "create_automation",
        automation: {
          id: "au_email",
          name: "Email on win",
          enabled: true,
          trigger: { type: "record_created", objectKey: "deal" },
          conditions: [],
          actions: [{ type: "send_email", to: "ops@example.com", subject: "New deal", body: "A deal landed." }],
        },
      },
    ]);
    const graph = buildGraph(withEmail);
    const node = graph.nodes.find((candidate) => candidate.id === "action:au_email:0")!;
    expect(node.external).toBe(true);
    expect(node.eyebrow).toBe("Leaves the building");
  });

  it("dims a switched-off automation rather than hiding it", () => {
    const off = applyPatches(configured, [
      { op: "set_automation_enabled", automationId: configured.automations[0]!.id, enabled: false },
    ]);
    const graph = buildGraph(off);
    const nodes = graph.nodes.filter((node) => node.automationId === configured.automations[0]!.id);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => !node.enabled)).toBe(true);
  });

  it("lays nodes out inside the canvas it reports", () => {
    const graph = buildGraph(configured);
    for (const node of graph.nodes) {
      expect(node.x + node.width).toBeLessThanOrEqual(graph.width);
      expect(node.y + node.height).toBeLessThanOrEqual(graph.height);
    }
  });

  it("draws a wire that leaves right and arrives left", () => {
    const graph = buildGraph(configured);
    const [edge] = graph.edges.filter((candidate) => candidate.kind === "flow");
    const from = graph.nodes.find((node) => node.id === edge!.from)!;
    const to = graph.nodes.find((node) => node.id === edge!.to)!;
    expect(outputPin(from).x).toBe(from.x + from.width);
    expect(inputPin(to).x).toBe(to.x);
    expect(wirePath(from, to)).toMatch(/^M [\d.]+ [\d.]+ C /);
  });
});
