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

export const saas: BusinessTemplate = {
  id: "saas",
  name: "B2B software",
  tagline: "Demos, trials, plans, and the renewals that follow.",
  who: "For software teams selling subscriptions to other businesses.",
  highlights: [
    "Deals carry a plan, monthly value, trial end and renewal date.",
    "The board runs lead, discovery, demo, trial, negotiation, closed.",
    "Contacts record their seniority and whether they are the economic buyer.",
    "Trials ending this fortnight get their own list.",
    "Reaching a renewal date raises a task 30 days ahead.",
  ],
  nextPrompts: [
    "Show me expansion deals separately from new business",
    "Track which trials never logged in",
    "Add a churn reason to lost deals",
  ],
  brief: `This workspace sells B2B software subscriptions. A deal is a subscription, so the
money that matters is recurring — monthly value and renewal date beat one-off amounts in almost
every question. Trials are a stage, not a separate object. Contacts are ranked by whether they
can sign: champion, economic buyer, blocker. Expansion and renewal are different motions from
new business, and if the customer asks for either, ask whether they want a second pipeline
rather than more stages on this one. Churn reasons belong on lost deals.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");
    const amountField = existingFieldId(base, "deal", "amount");

    return [
      ...addFields("deal", [
        {
          key: "plan",
          label: "Plan",
          type: "select",
          options: options(
            ["starter", "Starter"],
            ["growth", "Growth"],
            ["business", "Business"],
            ["enterprise", "Enterprise"],
          ),
        },
        { key: "mrr", label: "Monthly value", type: "currency", currencyCode: "USD" },
        { key: "seats", label: "Seats", type: "number" },
        { key: "trial_ends", label: "Trial ends", type: "date" },
        { key: "renewal_date", label: "Renewal date", type: "date" },
      ]),
      ...addFields("contact", [
        {
          key: "buying_role",
          label: "Buying role",
          type: "select",
          options: options(
            ["champion", "Champion"],
            ["economic_buyer", "Economic buyer"],
            ["technical", "Technical evaluator"],
            ["blocker", "Blocker"],
          ),
        },
        {
          key: "source",
          label: "Source",
          type: "select",
          options: options(
            ["inbound", "Inbound"],
            ["outbound", "Outbound"],
            ["referral", "Referral"],
            ["event", "Event"],
            ["partner", "Partner"],
          ),
        },
      ]),
      ...addFields("company", [
        { key: "arr", label: "Current ARR", type: "currency", currencyCode: "USD" },
        {
          key: "segment",
          label: "Segment",
          type: "select",
          options: options(["smb", "SMB"], ["mid_market", "Mid market"], ["enterprise", "Enterprise"]),
        },
      ]),

      restagePipeline(
        "pl_sales",
        "New business",
        [
          stage("lead", "Lead", { probability: 5 }),
          stage("discovery", "Discovery", { probability: 20 }),
          stage("demo", "Demo", { probability: 40 }),
          stage("trial", "Trial", { probability: 60 }),
          stage("negotiation", "Negotiation", { probability: 80 }),
          stage("won", "Closed won", { probability: 100, isWon: true }),
          stage("lost", "Closed lost", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "lead" },
          { from: "qualified", to: "discovery" },
          { from: "proposal", to: "demo" },
        ],
      ),

      createView({
        id: "vw_trials",
        objectKey: "deal",
        name: "Trials ending",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          fieldId("deal", "trial_ends"),
          fieldId("deal", "plan"),
          fieldId("deal", "mrr"),
          existingFieldId(base, "deal", "owner"),
        ],
        filters: {
          join: "and",
          conditions: [
            { fieldId: stageField, operator: "is", value: "trial" },
            { fieldId: fieldId("deal", "trial_ends"), operator: "in_next_days", value: 14 },
          ],
          groups: [],
        },
        sort: { fieldId: fieldId("deal", "trial_ends"), direction: "asc" },
      }),
      createView({
        id: "vw_renewals",
        objectKey: "deal",
        name: "Renewals this quarter",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          fieldId("deal", "renewal_date"),
          fieldId("deal", "mrr"),
          existingFieldId(base, "deal", "company"),
        ],
        filters: where({ fieldId: fieldId("deal", "renewal_date"), operator: "in_next_days", value: 90 }),
        sort: { fieldId: fieldId("deal", "renewal_date"), direction: "asc" },
      }),
      createView({
        id: "vw_pipeline_value",
        objectKey: "deal",
        name: "Weighted pipeline",
        renderer: "table",
        columns: [existingFieldId(base, "deal", "name"), stageField, amountField, fieldId("deal", "mrr")],
        filters: where({ fieldId: stageField, operator: "is_any_of", value: ["discovery", "demo", "trial", "negotiation"] }),
        sort: { fieldId: amountField, direction: "desc" },
      }),

      createAutomation({
        id: "au_renewal_reminder",
        name: "Prepare a renewal 30 days out",
        trigger: { type: "date_reached", objectKey: "deal", fieldId: fieldId("deal", "renewal_date"), offsetDays: -30 },
        conditions: [],
        actions: [{ type: "create_task", title: "Prepare the renewal conversation", dueInDays: 0 }],
      }),
      createAutomation({
        id: "au_trial_check",
        name: "Check in the day a trial ends",
        trigger: { type: "date_reached", objectKey: "deal", fieldId: fieldId("deal", "trial_ends"), offsetDays: 0 },
        conditions: [{ fieldId: stageField, operator: "is", value: "trial" }],
        actions: [{ type: "create_task", title: "Ask how the trial went", dueInDays: 0 }],
      }),
    ];
  },
};
