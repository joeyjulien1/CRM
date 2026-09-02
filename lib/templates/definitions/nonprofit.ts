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

export const nonprofit: BusinessTemplate = {
  id: "nonprofit",
  name: "Nonprofit fundraising",
  tagline: "Supporters, asks, gifts, and the thank-you that follows.",
  who: "For charities and foundations tracking donors and grant applications.",
  highlights: [
    "Deals become asks: gift type, amount, and the campaign it belongs to.",
    "The board runs identified, cultivating, ask made, pledged, received.",
    "Contacts record giving level, whether gift aid applies, and how they prefer contact.",
    "Pledges not yet received have their own list.",
    "A received gift raises a thank-you task the next day.",
  ],
  nextPrompts: [
    "Show me lapsed donors who gave last year but not this one",
    "Track grant deadlines separately from individual asks",
    "Add a soft credit field for gifts influenced by a trustee",
  ],
  brief: `This workspace is a fundraising organisation. A deal is an ask — a gift being
cultivated, pledged, or received — and pledged is not the same as received; never treat them as
one stage. Contacts are supporters, and their preferred contact method and consent are legal
constraints, not preferences. Grants have deadlines and reporting requirements that individual
gifts do not, so if the customer mentions grants, ask whether they want a second pipeline.
Recurring giving is measured monthly; major gifts are one-off. Stewardship — the thank-you and
the report back — is part of the pipeline, not an afterthought.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");
    const amountField = existingFieldId(base, "deal", "amount");

    return [
      ...addFields("deal", [
        {
          key: "gift_type",
          label: "Gift type",
          type: "select",
          required: true,
          options: options(
            ["one_off", "One-off gift"],
            ["recurring", "Recurring gift"],
            ["major", "Major gift"],
            ["grant", "Grant"],
            ["legacy", "Legacy"],
          ),
        },
        { key: "campaign", label: "Campaign", type: "text" },
        { key: "pledged_on", label: "Pledged on", type: "date" },
        { key: "received_on", label: "Received on", type: "date" },
        { key: "restricted", label: "Restricted funding", type: "boolean" },
      ]),
      ...addFields("contact", [
        {
          key: "giving_level",
          label: "Giving level",
          type: "select",
          options: options(
            ["prospect", "Prospect"],
            ["regular", "Regular giver"],
            ["major", "Major donor"],
            ["trustee", "Trustee"],
            ["lapsed", "Lapsed"],
          ),
        },
        { key: "gift_aid", label: "Gift aid declared", type: "boolean" },
        {
          key: "contact_preference",
          label: "Contact preference",
          type: "select",
          options: options(["email", "Email"], ["phone", "Phone"], ["post", "Post"], ["none", "No contact"]),
        },
        { key: "last_gift_on", label: "Last gift on", type: "date" },
      ]),

      restagePipeline(
        "pl_sales",
        "Fundraising pipeline",
        [
          stage("identified", "Identified", { probability: 10 }),
          stage("cultivating", "Cultivating", { probability: 30 }),
          stage("ask_made", "Ask made", { probability: 55 }),
          stage("pledged", "Pledged", { probability: 85 }),
          stage("received", "Received", { probability: 100, isWon: true }),
          stage("declined", "Declined", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "identified" },
          { from: "qualified", to: "cultivating" },
          { from: "proposal", to: "ask_made" },
          { from: "negotiation", to: "pledged" },
          { from: "won", to: "received" },
          { from: "lost", to: "declined" },
        ],
      ),

      createView({
        id: "vw_pledged",
        objectKey: "deal",
        name: "Pledged, not received",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          amountField,
          fieldId("deal", "gift_type"),
          fieldId("deal", "pledged_on"),
        ],
        filters: where({ fieldId: stageField, operator: "is", value: "pledged" }),
        sort: { fieldId: fieldId("deal", "pledged_on"), direction: "asc" },
      }),
      createView({
        id: "vw_major_donors",
        objectKey: "contact",
        name: "Major donors",
        renderer: "table",
        columns: [
          existingFieldId(base, "contact", "name"),
          fieldId("contact", "giving_level"),
          fieldId("contact", "last_gift_on"),
          fieldId("contact", "contact_preference"),
        ],
        filters: where({ fieldId: fieldId("contact", "giving_level"), operator: "is_any_of", value: ["major", "trustee"] }),
        sort: { fieldId: fieldId("contact", "last_gift_on"), direction: "desc" },
      }),

      createAutomation({
        id: "au_thank_you",
        name: "Thank a donor the day after a gift arrives",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "received" }],
        actions: [{ type: "create_task", title: "Send the thank-you and the receipt", dueInDays: 1 }],
      }),
    ];
  },
};
