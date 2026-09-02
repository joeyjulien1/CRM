import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default";
import { applyPatches, findField, validateConfig } from "@/lib/config/patch";
import { systemPrompt } from "@/lib/agent/prompt";
import { saas } from "./definitions/saas";
import { describeTemplate } from "./apply";
import { TEMPLATES, findTemplate, authorLabel, templateAuthor, templateIdFromAuthor } from "./index";
import { toCard } from "./types";

const base = defaultConfig();

describe("every template", () => {
  for (const template of TEMPLATES) {
    describe(template.name, () => {
      it("produces a patch set the config schema accepts", () => {
        const next = applyPatches(base, template.patches(base));
        expect(() => validateConfig(next)).not.toThrow();
      });

      it("leaves the config it was given untouched", () => {
        const before = structuredClone(base);
        applyPatches(base, template.patches(base));
        expect(base).toEqual(before);
      });

      it("is reversible — one rollback returns the starting config exactly", () => {
        const next = applyPatches(base, template.patches(base));
        expect(next).not.toEqual(base);
        const back = applyPatches(next, [{ op: "rollback", toVersion: 1, config: base }]);
        expect(back).toEqual(base);
      });

      it("only references fields that exist once it has been applied", () => {
        const next = applyPatches(base, template.patches(base));
        for (const view of next.views) {
          for (const columnId of view.columns) {
            expect(findField(next, columnId), `${view.name} column ${columnId}`).toBeTruthy();
          }
          for (const condition of view.filters?.conditions ?? []) {
            expect(findField(next, condition.fieldId), `${view.name} filter`).toBeTruthy();
          }
        }
        for (const automation of next.automations) {
          for (const condition of automation.conditions) {
            expect(findField(next, condition.fieldId), `${automation.name} condition`).toBeTruthy();
          }
        }
      });

      it("never leaves the building on its own — no email, no webhook", () => {
        const next = applyPatches(base, template.patches(base));
        const external = next.automations
          .flatMap((automation) => automation.actions)
          .filter((action) => action.type === "send_email" || action.type === "call_webhook");
        expect(external).toHaveLength(0);
      });

      it("describes itself in plain language, one line per change", () => {
        const lines = describeTemplate(template, base);
        expect(lines).toHaveLength(template.patches(base).length);
        for (const line of lines) {
          expect(line).not.toContain("fld_");
          expect(line).not.toContain("{");
        }
      });

      it("carries a brief the browser never sees", () => {
        expect(template.brief.length).toBeGreaterThan(120);
        expect(Object.keys(structuredClone({ ...template, patches: undefined }))).toContain("brief");
      });
    });
  }

  it("has unique ids", () => {
    const ids = TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("round-trips its id through the version author", () => {
    for (const template of TEMPLATES) {
      const author = templateAuthor(template.id);
      expect(templateIdFromAuthor(author)).toBe(template.id);
      expect(findTemplate(template.id)).toBe(template);
      expect(authorLabel(author)).toContain(template.name);
    }
    expect(templateIdFromAuthor("agent")).toBeUndefined();
    expect(authorLabel("agent")).toBe("agent");
  });
});

describe("the brief behind a template", () => {
  it("reaches the agent's system prompt", () => {
    const configured = applyPatches(base, saas.patches(base));
    const prompt = systemPrompt(configured, { deal: 4 }, saas.brief);
    expect(prompt).toContain(saas.brief);
    expect(prompt).toContain("What this business is");
  });

  it("is absent from the prompt when a workspace started from nothing", () => {
    const prompt = systemPrompt(base, {});
    expect(prompt).not.toContain("What this business is");
    expect(prompt.endsWith("- none")).toBe(true);
  });

  it("never travels to the browser — the card carries display copy only", () => {
    for (const template of TEMPLATES) {
      const card = toCard(template);
      expect(JSON.stringify(card)).not.toContain(template.brief.slice(0, 40));
      expect(Object.keys(card).sort()).toEqual(["highlights", "id", "name", "tagline", "who"]);
    }
  });
});
