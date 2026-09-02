import {
  addFields,
  createAutomation,
  createView,
  existingFieldId,
  fieldId,
  options,
  restagePipeline,
  stage,
  where,
} from "../build";
import type { BusinessTemplate } from "../types";

export const trades: BusinessTemplate = {
  id: "trades",
  name: "Trades and field service",
  tagline: "Enquiries, site visits, quotes, and jobs on the calendar.",
  who: "For builders, installers, and anyone quoting work at a customer's address.",
  highlights: [
    "Deals become jobs: site address, job type, quoted value and scheduled date.",
    "The board runs enquiry, site visit, quote sent, scheduled, complete.",
    "Contacts record how they found you and where they are.",
    "Jobs scheduled in the next week have their own list.",
    "A quote sent raises a follow-up task, and a booked job raises a materials check.",
  ],
  nextPrompts: [
    "Show me jobs finished but not yet invoiced",
    "Track which engineer is assigned to each job",
    "Remind me to ask for a review a week after a job completes",
  ],
  brief: `This workspace is a trades or field service business. A deal is a job at an address —
the site address matters as much as the customer's own address, and they are often different.
Quotes are sent, accepted, or lost on price, and a scheduled date is what turns a quote into
work. Materials and labour are the cost side of a job; if the customer asks about margin they
mean quoted value minus those. Activities are site visits and callbacks. Invoicing usually
follows completion, so "done" and "paid" are two different states — never collapse them.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");

    return [
      ...addFields("deal", [
        { key: "site_address", label: "Site address", type: "text", required: true },
        {
          key: "job_type",
          label: "Job type",
          type: "select",
          options: options(
            ["install", "Installation"],
            ["repair", "Repair"],
            ["maintenance", "Maintenance"],
            ["survey", "Survey"],
          ),
        },
        { key: "scheduled_for", label: "Scheduled for", type: "date" },
        { key: "materials_cost", label: "Materials cost", type: "currency", currencyCode: "USD" },
        { key: "invoiced", label: "Invoiced", type: "boolean" },
        { key: "job_notes", label: "Job notes", type: "long_text" },
      ]),
      ...addFields("contact", [
        {
          key: "found_us",
          label: "Found us via",
          type: "select",
          options: options(
            ["referral", "Referral"],
            ["search", "Search"],
            ["repeat", "Repeat customer"],
            ["signage", "Signage or van"],
            ["directory", "Directory"],
          ),
        },
        { key: "postcode", label: "Postcode", type: "text" },
      ]),

      restagePipeline(
        "pl_sales",
        "Job pipeline",
        [
          stage("enquiry", "Enquiry", { probability: 10 }),
          stage("site_visit", "Site visit", { probability: 30 }),
          stage("quoted", "Quote sent", { probability: 50 }),
          stage("scheduled", "Scheduled", { probability: 90 }),
          stage("complete", "Complete", { probability: 100, isWon: true }),
          stage("lost", "Lost", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "enquiry" },
          { from: "qualified", to: "site_visit" },
          { from: "proposal", to: "quoted" },
          { from: "negotiation", to: "quoted" },
          { from: "won", to: "complete" },
        ],
      ),

      createView({
        id: "vw_this_week",
        objectKey: "deal",
        name: "Booked this week",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          fieldId("deal", "site_address"),
          fieldId("deal", "scheduled_for"),
          fieldId("deal", "job_type"),
        ],
        filters: {
          join: "and",
          conditions: [
            { fieldId: stageField, operator: "is", value: "scheduled" },
            { fieldId: fieldId("deal", "scheduled_for"), operator: "in_next_days", value: 7 },
          ],
          groups: [],
        },
        sort: { fieldId: fieldId("deal", "scheduled_for"), direction: "asc" },
      }),
      createView({
        id: "vw_to_invoice",
        objectKey: "deal",
        name: "Done, not invoiced",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          existingFieldId(base, "deal", "amount"),
          fieldId("deal", "materials_cost"),
          fieldId("deal", "scheduled_for"),
        ],
        filters: {
          join: "and",
          conditions: [
            { fieldId: stageField, operator: "is", value: "complete" },
            { fieldId: fieldId("deal", "invoiced"), operator: "is_false" },
          ],
          groups: [],
        },
        sort: { fieldId: fieldId("deal", "scheduled_for"), direction: "asc" },
      }),

      createAutomation({
        id: "au_quote_followup",
        name: "Chase a quote after four days",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "quoted" }],
        actions: [{ type: "create_task", title: "Chase the quote", dueInDays: 4 }],
      }),
      createAutomation({
        id: "au_materials_check",
        name: "Check materials once a job is booked",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "scheduled" }],
        actions: [{ type: "create_task", title: "Order the materials for this job", dueInDays: 1 }],
      }),
    ];
  },
};
