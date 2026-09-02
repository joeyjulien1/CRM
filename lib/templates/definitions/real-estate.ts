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

export const realEstate: BusinessTemplate = {
  id: "real_estate",
  name: "Real estate",
  tagline: "Listings, viewings, and offers through to exchange.",
  who: "For sales and lettings agencies working a local patch.",
  highlights: [
    "Deals become properties: address, type, bedrooms, asking price and commission.",
    "The board runs enquiry, viewing, offer, under offer, exchanged.",
    "Contacts say whether they are buying, selling, letting or renting.",
    "A viewing booked this week shows on its own list.",
    "Moving a deal to Under offer raises a task to confirm the survey.",
  ],
  nextPrompts: [
    "Add a lettings pipeline separate from sales",
    "Track which portal each enquiry came from",
    "Remind me a week before every tenancy renewal",
  ],
  brief: `This workspace is a real estate agency. A deal is a property transaction, not a
software sale: it has an address, an asking price, and a commission the agency earns on
exchange. A contact is a buyer, seller, landlord or tenant — always say which. Activities are
viewings, valuations and calls. When the customer asks for a "listing" they mean a deal; when
they say "applicant" they mean a contact who is buying or renting. Lettings and sales are
different pipelines — never merge them. Commission is a percentage of the sale price, so a
currency field plus a number field is usually the right shape.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");
    const dueField = existingFieldId(base, "activity", "due_at");
    const typeField = existingFieldId(base, "activity", "activity_type");
    const doneField = existingFieldId(base, "activity", "completed");

    return [
      ...addFields("deal", [
        { key: "property_address", label: "Property address", type: "text", required: true },
        {
          key: "property_type",
          label: "Property type",
          type: "select",
          options: options(
            ["house", "House"],
            ["apartment", "Apartment"],
            ["land", "Land"],
            ["commercial", "Commercial"],
          ),
        },
        { key: "bedrooms", label: "Bedrooms", type: "number" },
        { key: "commission", label: "Commission", type: "currency", currencyCode: "USD" },
        { key: "listed_on", label: "Listed on", type: "date" },
      ]),
      ...addFields("contact", [
        {
          key: "party",
          label: "Acting as",
          type: "select",
          options: options(
            ["buyer", "Buyer"],
            ["seller", "Seller"],
            ["landlord", "Landlord"],
            ["tenant", "Tenant"],
          ),
          helpText: "Which side of the transaction this person is on.",
        },
        { key: "budget", label: "Budget", type: "currency", currencyCode: "USD" },
        { key: "preferred_area", label: "Preferred area", type: "text" },
      ]),

      restagePipeline(
        "pl_sales",
        "Property pipeline",
        [
          stage("enquiry", "Enquiry", { probability: 10 }),
          stage("viewing", "Viewing booked", { probability: 25 }),
          stage("offer", "Offer made", { probability: 50 }),
          stage("under_offer", "Under offer", { probability: 75 }),
          stage("exchanged", "Exchanged", { probability: 100, isWon: true }),
          stage("fell_through", "Fell through", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "enquiry" },
          { from: "qualified", to: "viewing" },
          { from: "proposal", to: "offer" },
          { from: "negotiation", to: "under_offer" },
          { from: "won", to: "exchanged" },
          { from: "lost", to: "fell_through" },
        ],
      ),

      createView({
        id: "vw_listings",
        objectKey: "deal",
        name: "Live listings",
        renderer: "table",
        columns: [
          fieldId("deal", "property_address"),
          fieldId("deal", "property_type"),
          fieldId("deal", "bedrooms"),
          existingFieldId(base, "deal", "amount"),
          stageField,
        ],
        filters: where({ fieldId: stageField, operator: "is_any_of", value: ["enquiry", "viewing", "offer"] }),
        sort: { fieldId: fieldId("deal", "listed_on"), direction: "desc" },
      }),
      createView({
        id: "vw_viewings",
        objectKey: "activity",
        name: "Viewings this week",
        renderer: "table",
        columns: [
          existingFieldId(base, "activity", "subject"),
          dueField,
          existingFieldId(base, "activity", "contact"),
        ],
        filters: {
          join: "and",
          conditions: [
            { fieldId: typeField, operator: "is", value: "meeting" },
            { fieldId: dueField, operator: "in_next_days", value: 7 },
            { fieldId: doneField, operator: "is_false" },
          ],
          groups: [],
        },
        sort: { fieldId: dueField, direction: "asc" },
      }),

      createAutomation({
        id: "au_survey_check",
        name: "Confirm the survey when a deal goes under offer",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "under_offer" }],
        actions: [{ type: "create_task", title: "Confirm the survey is booked", dueInDays: 2 }],
      }),
    ];
  },
};
