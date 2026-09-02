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

export const recruiting: BusinessTemplate = {
  id: "recruiting",
  name: "Recruiting",
  tagline: "Roles, candidates, interviews, and placements.",
  who: "For agencies and in-house teams filling roles for clients.",
  highlights: [
    "Deals become roles: seniority, salary band, and the fee on placement.",
    "The board runs sourcing, screen, client interview, offer, placed.",
    "Contacts carry their current title, notice period and salary expectation.",
    "Candidates in an interview loop have their own list.",
    "An offer raises a task to chase the signed contract.",
  ],
  nextPrompts: [
    "Track which candidates came from which source",
    "Show me roles open longer than 30 days",
    "Add a rejection reason to lost roles",
  ],
  brief: `This workspace is a recruiting business. A deal is an open role at a client, not a
product sale — it has a seniority, a salary band, and a fee the agency earns when someone is
placed. A contact is usually a candidate: their notice period and salary expectation drive
every conversation. A company is the client hiring. When they say "pipeline" they may mean
candidates for one role rather than the roles themselves — ask which. Placement fees are a
percentage of salary, so both a currency field and a number field are usually needed. Never
propose anything that would put candidate notes in front of the client.`,

  patches: (base) => {
    const stageField = existingFieldId(base, "deal", "stage");

    return [
      ...addFields("deal", [
        {
          key: "seniority",
          label: "Seniority",
          type: "select",
          options: options(
            ["junior", "Junior"],
            ["mid", "Mid"],
            ["senior", "Senior"],
            ["lead", "Lead"],
            ["executive", "Executive"],
          ),
        },
        { key: "salary_band", label: "Salary band", type: "currency", currencyCode: "USD" },
        { key: "fee_percent", label: "Fee percent", type: "number", helpText: "Percentage of first-year salary." },
        { key: "opened_on", label: "Opened on", type: "date" },
        {
          key: "work_pattern",
          label: "Work pattern",
          type: "select",
          options: options(["onsite", "Onsite"], ["hybrid", "Hybrid"], ["remote", "Remote"]),
        },
      ]),
      ...addFields("contact", [
        { key: "current_title", label: "Current title", type: "text" },
        { key: "notice_period", label: "Notice period (weeks)", type: "number" },
        { key: "salary_expectation", label: "Salary expectation", type: "currency", currencyCode: "USD" },
        {
          key: "candidate_status",
          label: "Candidate status",
          type: "select",
          options: options(
            ["available", "Available"],
            ["interviewing", "Interviewing"],
            ["placed", "Placed"],
            ["not_looking", "Not looking"],
          ),
        },
        {
          key: "skills",
          label: "Skills",
          type: "multi_select",
          options: options(
            ["engineering", "Engineering"],
            ["design", "Design"],
            ["sales", "Sales"],
            ["marketing", "Marketing"],
            ["operations", "Operations"],
            ["finance", "Finance"],
          ),
        },
      ]),

      restagePipeline(
        "pl_sales",
        "Role pipeline",
        [
          stage("sourcing", "Sourcing", { probability: 10 }),
          stage("screen", "Screening", { probability: 25 }),
          stage("client_interview", "Client interview", { probability: 50 }),
          stage("offer", "Offer out", { probability: 80 }),
          stage("placed", "Placed", { probability: 100, isWon: true }),
          stage("closed", "Closed", { probability: 0, isLost: true }),
        ],
        [
          { from: "new", to: "sourcing" },
          { from: "qualified", to: "screen" },
          { from: "proposal", to: "client_interview" },
          { from: "negotiation", to: "offer" },
          { from: "won", to: "placed" },
          { from: "lost", to: "closed" },
        ],
      ),

      createView({
        id: "vw_open_roles",
        objectKey: "deal",
        name: "Open roles",
        renderer: "table",
        columns: [
          existingFieldId(base, "deal", "name"),
          existingFieldId(base, "deal", "company"),
          fieldId("deal", "seniority"),
          fieldId("deal", "salary_band"),
          stageField,
        ],
        filters: where({
          fieldId: stageField,
          operator: "is_any_of",
          value: ["sourcing", "screen", "client_interview", "offer"],
        }),
        sort: { fieldId: fieldId("deal", "opened_on"), direction: "asc" },
      }),
      createView({
        id: "vw_candidates_out",
        objectKey: "contact",
        name: "Candidates interviewing",
        renderer: "table",
        columns: [
          existingFieldId(base, "contact", "name"),
          fieldId("contact", "current_title"),
          fieldId("contact", "salary_expectation"),
          fieldId("contact", "notice_period"),
        ],
        filters: where({ fieldId: fieldId("contact", "candidate_status"), operator: "is", value: "interviewing" }),
        sort: { fieldId: existingFieldId(base, "contact", "name"), direction: "asc" },
      }),

      createAutomation({
        id: "au_offer_chase",
        name: "Chase the signed contract once an offer is out",
        trigger: { type: "field_changed", objectKey: "deal", fieldId: stageField },
        conditions: [{ fieldId: stageField, operator: "is", value: "offer" }],
        actions: [{ type: "create_task", title: "Chase the signed contract", dueInDays: 2 }],
      }),
    ];
  },
};
