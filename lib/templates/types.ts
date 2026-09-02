import type { ConfigPatch, Config } from "@/lib/config/types";

/**
 * A template is a config file, not code. Picking one commits a patch set as a
 * new version, which means it is validated, versioned, and reversible like
 * every other change — the agent takes over from there.
 *
 * `brief` is the coded prompt behind a template. It never reaches the browser
 * and is never rendered: it is the context the agent reads when the tenant
 * later asks for a change, so "add a second pipeline" lands in the vocabulary
 * of their business rather than the default one.
 */
export interface BusinessTemplate {
  /** Stable. It is written into the config version's author as `template:<id>`. */
  id: string;
  name: string;
  /** One line, sentence case, on the card. */
  tagline: string;
  /** Who it is for, in their words. */
  who: string;
  /** Three to five plain-language bullets. What the workspace looks like after. */
  highlights: string[];
  /** Shown after the template applies, as the agent's opening suggestions. */
  nextPrompts: string[];
  /** Server-only. Never serialised to a client component. */
  brief: string;
  /** Built against the config the workspace has now, so ids can be looked up. */
  patches: (base: Config) => ConfigPatch[];
}

/** What a client component is allowed to see. `brief` is deliberately absent. */
export interface TemplateCard {
  id: string;
  name: string;
  tagline: string;
  who: string;
  highlights: string[];
}

export function toCard(template: BusinessTemplate): TemplateCard {
  return {
    id: template.id,
    name: template.name,
    tagline: template.tagline,
    who: template.who,
    highlights: template.highlights,
  };
}
