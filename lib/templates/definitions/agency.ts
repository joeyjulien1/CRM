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

export const agency: BusinessTemplate = {
  id: "agency",
  name: "Agency or studio",
  tagline: "Briefs, proposals, retainers, and the work that follows them.",
  who: "For design, marketing and consulting shops selling projects and retainers.",
  highlights: [
    "Deals carry a service line, a fee, and whether they are project or retainer work.",
    "The board runs brief, scoping, proposal sent, negotiation, won.",
    "Retainers get a renewal date, and a list of the ones ending soon.",
    "Companies record their account manager and billing contact.",
    "A proposal sent raises a follow-up task three days later.",
  ],
  nextPrompts: [
    "Show me retainers renewing in the next 60 days",
    "Track how much of each retainer we have delivered",
    "Add a field for the referral source on new briefs",
  ],
  brief: `This workspace is an agency or studio. A deal is a piece of client work — either a
fixed-scope project or a recurring retainer, and the difference matters in almost every
question they ask. Fees are quoted, not licensed, so amounts are one-off unless the engagement
type says retainer. A company is a client account with an account manager; contacts are the
people at that client. When they say "pitch" they mean a deal in the proposal stage, and when
they say "scope" they mean the brief before a proposal exists. Retainer renewals are the
revenue that keeps the business alive — anything touching renewal dates deserves a reminder.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");
    const amountField = existingFieldId(base, "deal", "amount");

    return [
      ...addFields("deal", [
        {
          key: "engagement",
          label: "Engagement type",
          type: "select",
          required: true,
          options: options(["project", "Project"], ["retainer", "Retainer"], ["sprint", "Sprint"]),
        },
        {
          key: "service",
          label: "Service line",
          type: "select",
          options: options(
            ["brand", "Brand"],
            ["web", "Web"],
            ["content", "Content"],
            ["performance", "Performance"],
            ["strategy", "Strategy"],
          ),
        },
        { key: "renewal_date", label: "Renewal date", type: "date", helpText: "Retainers only." },
        { key: "kickoff_date", label: "Kickoff date", type: "date" },
      ]),
      ...addFields("company", [
        { key: "account_manager", label: "Account manager", type: "user" },
        { key: "billing_email", label: "Billing email", type: "email" },
        {
          key: "account_tier",
          label: "Account tier",
          type: "select",
          options: options(["key", "Key account"], ["growth", "Growth"], ["project", "Project only"]),
        },
      ]),

      restagePipeline(
        "pl_sales",
        "New business",
        [
          stage("brief", "Brief", { probability: 10 }),
          stage("scoping", "Scoping", { probability: 25 }),
          stage("proposal", "Proposal sent", { probability: 50 }),
          stage("negotiation", "Negotiation", { probability: 70 }),
          stage("won", "Won", { probability: 100, isWon: true }),
          stage("lost", "Lost", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "brief" },
          { from: "qualified", to: "scoping" },
        ],
      ),

      createView({
        id: "vw_retainers",
        objectKey: "deal",
        name: "Retainers renewing",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          fieldId("deal", "renewal_date"),
          amountField,
          existingFieldId(base, "deal", "company"),
        ],
        filters: {
          join: "and",
          conditions: [
            { fieldId: fieldId("deal", "engagement"), operator: "is", value: "retainer" },
            { fieldId: fieldId("deal", "renewal_date"), operator: "in_next_days", value: 90 },
          ],
          groups: [],
        },
        sort: { fieldId: fieldId("deal", "renewal_date"), direction: "asc" },
      }),
      createView({
        id: "vw_pitches",
        objectKey: "deal",
        name: "Live pitches",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          fieldId("deal", "service"),
          amountField,
          stageField,
          existingFieldId(base, "deal", "close_date"),
        ],
        filters: where({ fieldId: stageField, operator: "is_any_of", value: ["proposal", "negotiation"] }),
        sort: { fieldId: amountField, direction: "desc" },
      }),

      createAutomation({
        id: "au_proposal_followup",
        name: "Follow up three days after a proposal goes out",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "proposal" }],
        actions: [{ type: "create_task", title: "Follow up on the proposal", dueInDays: 3 }],
      }),
      createAutomation({
        id: "au_kickoff",
        name: "Raise a kickoff task when work is won",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "won" }],
        actions: [{ type: "create_task", title: "Book the kickoff call", dueInDays: 2 }],
      }),
    ];
  },
};
