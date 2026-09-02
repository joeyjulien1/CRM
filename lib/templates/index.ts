import { agency } from "./definitions/agency";
import { clinic } from "./definitions/clinic";
import { nonprofit } from "./definitions/nonprofit";
import { realEstate } from "./definitions/real-estate";
import { recruiting } from "./definitions/recruiting";
import { saas } from "./definitions/saas";
import { trades } from "./definitions/trades";
import { toCard, type BusinessTemplate, type TemplateCard } from "./types";

/**
 * The catalogue. A template is config, so adding an industry is a data change:
 * no renderer, no agent tool, and no model call is involved in shipping one.
 */
export const TEMPLATES: readonly BusinessTemplate[] = [
  saas,
  agency,
  realEstate,
  recruiting,
  trades,
  clinic,
  nonprofit,
];

export function templateCards(): TemplateCard[] {
  return TEMPLATES.map(toCard);
}

export function findTemplate(id: string): BusinessTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

/** The author a template writes into config history, so the choice is recoverable. */
export function templateAuthor(id: string): string {
  return `template:${id}`;
}

export function templateIdFromAuthor(author: string): string | undefined {
  return author.startsWith("template:") ? author.slice("template:".length) : undefined;
}

/** How history and the agent refer to whoever made a version. */
export function authorLabel(author: string): string {
  const templateId = templateIdFromAuthor(author);
  if (!templateId) return author;
  return `${findTemplate(templateId)?.name ?? templateId} template`;
}

export { toCard };
export type { BusinessTemplate, TemplateCard };
