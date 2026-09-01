import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default";
import { applyPatches, findField } from "@/lib/config/patch";
import { AGENT_TOOLS, runTool, schemaSummary, type ToolContext } from "./tools";

const context = (): ToolContext => ({
  config: defaultConfig(),
  counts: { contact: 1847, company: 210, deal: 96, activity: 12 },
});

describe("the agent's surface", () => {
  it("offers exactly the tools docs/AGENT-TOOLS.md lists", () => {
    expect(AGENT_TOOLS.map((tool) => tool.name).sort()).toEqual(
      [
        "add_field",
        "apply_import",
        "create_automation",
        "create_pipeline",
        "create_relation",
        "create_view",
        "delete_view",
        "get_config",
        "get_schema_summary",
        "propose_import_mapping",
        "remove_field",
        "reorder_fields",
        "set_automation_enabled",
        "update_automation",
        "update_field",
        "update_pipeline",
        "update_view",
      ].sort(),
    );
  });

  it("has no tool that reads record contents", () => {
    const names = AGENT_TOOLS.map((tool) => tool.name);
    expect(names).not.toContain("get_records");
    expect(names).not.toContain("search_records");
    expect(names).not.toContain("read_record");
  });

  it("has no tool for changing a field's type", () => {
    const updateField = AGENT_TOOLS.find((tool) => tool.name === "update_field");
    const properties = (updateField?.input_schema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties)).not.toContain("type");
  });

  it("tells the agent counts and shapes, never contents", () => {
    const summary = JSON.stringify(schemaSummary(context()));
    expect(summary).toContain("1847");
    expect(summary).toContain("fld_contact_email");
    // Nothing in the summary is a customer's data.
    expect(summary).not.toMatch(/@/);
  });
});

describe("tools stage patches rather than results", () => {
  it("turns a label into a field patch with an id and a key", async () => {
    const outcome = await runTool(
      "add_field",
      { object_key: "deal", label: "Renewal date", type: "date" },
      context(),
    );

    expect(outcome.patches).toHaveLength(1);
    const patch = outcome.patches[0]!;
    expect(patch.op).toBe("add_field");
    if (patch.op !== "add_field") throw new Error("wrong patch");
    expect(patch.field.key).toBe("renewal_date");
    expect(patch.field.id).toMatch(/^fld_/);
    expect(patch.field.system).toBe(false);
  });

  it("produces a patch that actually applies", async () => {
    const config = defaultConfig();
    const outcome = await runTool(
      "add_field",
      { object_key: "contact", label: "Source", type: "select", options: ["Referral", "Cold outreach"] },
      { config, counts: {} },
    );

    const next = applyPatches(config, outcome.patches);
    const added = next.objects
      .find((object) => object.key === "contact")!
      .fields.find((field) => field.label === "Source");

    expect(added?.options?.map((option) => option.label)).toEqual(["Referral", "Cold outreach"]);
    expect(added?.options?.map((option) => option.value)).toEqual(["referral", "cold_outreach"]);
  });

  it("does not collide with a key the object already uses", async () => {
    const outcome = await runTool(
      "add_field",
      { object_key: "contact", label: "Email", type: "text" },
      context(),
    );
    const patch = outcome.patches[0]!;
    if (patch.op !== "add_field") throw new Error("wrong patch");
    expect(patch.field.key).toBe("email_2");
  });

  it("returns an error the model can act on rather than throwing", async () => {
    const outcome = await runTool("update_field", { field_id: "fld_nope", label: "X" }, context());
    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/no field/i);
    expect(outcome.patches).toHaveLength(0);
  });

  it("refuses a renderer that is not one of the three", async () => {
    const outcome = await runTool(
      "create_view",
      { object_key: "deal", name: "Calendar", renderer: "calendar", columns: [] },
      context(),
    );
    expect(outcome.isError).toBe(true);
    expect(outcome.patches).toHaveLength(0);
  });

  it("stages a stage-field rewrite when a pipeline changes", async () => {
    const config = defaultConfig();
    const outcome = await runTool(
      "update_pipeline",
      {
        pipeline_id: "pl_sales",
        stages: [
          { key: "new", label: "New" },
          { key: "won", label: "Closed won", is_won: true },
        ],
        stage_migrations: [
          { from: "qualified", to: "new" },
          { from: "proposal", to: "new" },
          { from: "negotiation", to: "new" },
          { from: "lost", to: "won" },
        ],
      },
      { config, counts: {} },
    );

    const next = applyPatches(config, outcome.patches);
    expect(findField(next, "fld_deal_stage")?.field.options?.map((option) => option.label)).toEqual([
      "New",
      "Closed won",
    ]);
  });

  it("reads a file only through the sampler, and only twenty rows of it", async () => {
    let requested = 0;
    const outcome = await runTool(
      "propose_import_mapping",
      { file_id: "file-1", object_key: "contact" },
      {
        ...context(),
        sampleImportFile: async () => {
          requested++;
          return {
            headers: ["Name", "Email"],
            rows: Array.from({ length: 500 }, (_, index) => [`Person ${index}`, `p${index}@example.com`]),
          };
        },
      },
    );

    expect(requested).toBe(1);
    const payload = JSON.parse(outcome.message) as { sampleRows: string[][] };
    expect(payload.sampleRows).toHaveLength(20);
  });

  it("hands an import back as a proposal, not as a config patch", async () => {
    let proposed: unknown;
    const outcome = await runTool(
      "apply_import",
      { file_id: "file-1", object_key: "contact", mapping: { Name: "fld_contact_name" } },
      { ...context(), onImportProposal: (proposal) => (proposed = proposal) },
    );

    expect(outcome.patches).toHaveLength(0);
    expect(proposed).toMatchObject({ fileId: "file-1", objectKey: "contact" });
  });
});
