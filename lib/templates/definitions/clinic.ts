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

export const clinic: BusinessTemplate = {
  id: "clinic",
  name: "Clinic or studio",
  tagline: "Enquiries, consultations, memberships, and rebooking.",
  who: "For clinics, salons, and studios selling courses of treatment or memberships.",
  highlights: [
    "Deals become plans of care: package, sessions booked, and start date.",
    "The board runs enquiry, consultation, plan proposed, active, complete.",
    "Contacts carry their membership type, renewal date and consent on file.",
    "Memberships lapsing this month get their own list.",
    "A plan going active raises a task to book the first session.",
  ],
  nextPrompts: [
    "Show me clients who have not booked in 60 days",
    "Track which practitioner each client sees",
    "Remind me two weeks before a membership renews",
  ],
  brief: `This workspace is a clinic, salon or studio. A deal is a package or plan of care sold
to one person — sessions, not seats. Contacts are clients, and a client's consent record and
renewal date matter more than any company link; companies are rarely used here, so do not
propose work that hangs off them. Activities are appointments. Rebooking is the whole business:
a client who has not booked in weeks is the most valuable list they own. Never propose anything
that stores clinical notes or health details in a free-text field — say why, and suggest their
practice system instead.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");

    return [
      ...addFields("deal", [
        {
          key: "package",
          label: "Package",
          type: "select",
          required: true,
          options: options(
            ["single", "Single session"],
            ["course", "Course of six"],
            ["membership", "Monthly membership"],
            ["annual", "Annual membership"],
          ),
        },
        { key: "sessions_booked", label: "Sessions booked", type: "number" },
        { key: "starts_on", label: "Starts on", type: "date" },
        { key: "practitioner", label: "Practitioner", type: "user" },
      ]),
      ...addFields("contact", [
        {
          key: "membership",
          label: "Membership",
          type: "select",
          options: options(
            ["none", "None"],
            ["monthly", "Monthly"],
            ["annual", "Annual"],
            ["lapsed", "Lapsed"],
          ),
        },
        { key: "membership_renews", label: "Membership renews", type: "date" },
        { key: "consent_on_file", label: "Consent on file", type: "boolean" },
        { key: "last_visit", label: "Last visit", type: "date" },
      ]),

      restagePipeline(
        "pl_sales",
        "Client journey",
        [
          stage("enquiry", "Enquiry", { probability: 15 }),
          stage("consultation", "Consultation booked", { probability: 40 }),
          stage("proposed", "Plan proposed", { probability: 60 }),
          stage("active", "Active", { probability: 100, isWon: true }),
          stage("lapsed", "Lapsed", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "enquiry" },
          { from: "qualified", to: "consultation" },
          { from: "proposal", to: "proposed" },
          { from: "negotiation", to: "proposed" },
          { from: "won", to: "active" },
          { from: "lost", to: "lapsed" },
        ],
      ),

      createView({
        id: "vw_lapsing",
        objectKey: "contact",
        name: "Memberships lapsing",
        renderer: "table",
        columns: [
          existingFieldId(base, "contact", "name"),
          fieldId("contact", "membership"),
          fieldId("contact", "membership_renews"),
          fieldId("contact", "last_visit"),
        ],
        filters: where({ fieldId: fieldId("contact", "membership_renews"), operator: "in_next_days", value: 30 }),
        sort: { fieldId: fieldId("contact", "membership_renews"), direction: "asc" },
      }),
      createView({
        id: "vw_active_plans",
        objectKey: "deal",
        name: "Active plans",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          fieldId("deal", "package"),
          fieldId("deal", "sessions_booked"),
          fieldId("deal", "practitioner"),
        ],
        filters: where({ fieldId: stageField, operator: "is", value: "active" }),
        sort: { fieldId: fieldId("deal", "starts_on"), direction: "desc" },
      }),

      createAutomation({
        id: "au_first_session",
        name: "Book the first session when a plan goes active",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "active" }],
        actions: [{ type: "create_task", title: "Book the first session", dueInDays: 1 }],
      }),
      createAutomation({
        id: "au_renewal_nudge",
        name: "Talk about renewal two weeks out",
        trigger: {
          type: "date_reached",
          objectKey: "contact",
          fieldId: fieldId("contact", "membership_renews"),
          offsetDays: -14,
        },
        conditions: [],
        actions: [{ type: "create_task", title: "Talk to this client about renewing", dueInDays: 0 }],
      }),
    ];
  },
};
