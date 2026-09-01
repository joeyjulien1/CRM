import { validateConfig } from "./patch";
import type { Config } from "./types";

/**
 * The config every tenant starts from. Core objects are fixed for v1 — the
 * agent customises them but cannot create an object from nothing.
 */
export function defaultConfig(): Config {
  return validateConfig({
    schemaVersion: 1,
    objects: [
      {
        key: "contact",
        label: "Contact",
        labelPlural: "Contacts",
        titleFieldId: "fld_contact_name",
        fields: [
          { id: "fld_contact_name", key: "name", label: "Name", type: "text", required: true, system: true },
          { id: "fld_contact_email", key: "email", label: "Email", type: "email", required: false, system: true },
          { id: "fld_contact_phone", key: "phone", label: "Phone", type: "phone", required: false, system: false },
          { id: "fld_contact_title", key: "job_title", label: "Job title", type: "text", required: false, system: false },
          {
            id: "fld_contact_company",
            key: "company",
            label: "Company",
            type: "relation",
            relationKey: "company_contacts",
            required: false,
            system: false,
          },
          { id: "fld_contact_owner", key: "owner", label: "Owner", type: "user", required: false, system: false },
          { id: "fld_contact_notes", key: "notes", label: "Notes", type: "long_text", required: false, system: false },
        ],
        layout: {
          groups: [
            { label: "Details", fieldIds: ["fld_contact_name", "fld_contact_email", "fld_contact_phone", "fld_contact_title"] },
            { label: "Relationships", fieldIds: ["fld_contact_company", "fld_contact_owner"] },
            { label: "Notes", fieldIds: ["fld_contact_notes"] },
          ],
        },
      },
      {
        key: "company",
        label: "Company",
        labelPlural: "Companies",
        titleFieldId: "fld_company_name",
        fields: [
          { id: "fld_company_name", key: "name", label: "Name", type: "text", required: true, system: true },
          { id: "fld_company_domain", key: "domain", label: "Domain", type: "url", required: false, system: true },
          {
            id: "fld_company_industry",
            key: "industry",
            label: "Industry",
            type: "select",
            required: false,
            system: false,
            options: [
              { value: "software", label: "Software" },
              { value: "services", label: "Services" },
              { value: "manufacturing", label: "Manufacturing" },
              { value: "retail", label: "Retail" },
              { value: "other", label: "Other" },
            ],
          },
          { id: "fld_company_employees", key: "employees", label: "Employees", type: "number", required: false, system: false },
          { id: "fld_company_owner", key: "owner", label: "Owner", type: "user", required: false, system: false },
        ],
        layout: {
          groups: [
            { label: "Details", fieldIds: ["fld_company_name", "fld_company_domain", "fld_company_industry", "fld_company_employees"] },
            { label: "Relationships", fieldIds: ["fld_company_owner"] },
          ],
        },
      },
      {
        key: "deal",
        label: "Deal",
        labelPlural: "Deals",
        titleFieldId: "fld_deal_name",
        fields: [
          { id: "fld_deal_name", key: "name", label: "Name", type: "text", required: true, system: true },
          {
            id: "fld_deal_amount",
            key: "amount",
            label: "Amount",
            type: "currency",
            currencyCode: "USD",
            required: false,
            system: false,
          },
          {
            id: "fld_deal_stage",
            key: "stage",
            label: "Stage",
            type: "select",
            required: true,
            system: true,
            options: [
              { value: "new", label: "New" },
              { value: "qualified", label: "Qualified" },
              { value: "proposal", label: "Proposal" },
              { value: "negotiation", label: "Negotiation" },
              { value: "won", label: "Won" },
              { value: "lost", label: "Lost" },
            ],
          },
          { id: "fld_deal_close_date", key: "close_date", label: "Close date", type: "date", required: false, system: false },
          {
            id: "fld_deal_company",
            key: "company",
            label: "Company",
            type: "relation",
            relationKey: "company_deals",
            required: false,
            system: false,
          },
          { id: "fld_deal_owner", key: "owner", label: "Owner", type: "user", required: false, system: false },
        ],
        layout: {
          groups: [
            { label: "Details", fieldIds: ["fld_deal_name", "fld_deal_amount", "fld_deal_stage", "fld_deal_close_date"] },
            { label: "Relationships", fieldIds: ["fld_deal_company", "fld_deal_owner"] },
          ],
        },
      },
      {
        key: "activity",
        label: "Activity",
        labelPlural: "Activities",
        titleFieldId: "fld_activity_subject",
        fields: [
          { id: "fld_activity_subject", key: "subject", label: "Subject", type: "text", required: true, system: true },
          {
            id: "fld_activity_type",
            key: "activity_type",
            label: "Type",
            type: "select",
            required: false,
            system: false,
            options: [
              { value: "call", label: "Call" },
              { value: "meeting", label: "Meeting" },
              { value: "task", label: "Task" },
              { value: "email", label: "Email" },
            ],
          },
          { id: "fld_activity_due", key: "due_at", label: "Due", type: "datetime", required: false, system: false },
          { id: "fld_activity_done", key: "completed", label: "Completed", type: "boolean", required: false, system: false },
          {
            id: "fld_activity_contact",
            key: "contact",
            label: "Contact",
            type: "relation",
            relationKey: "contact_activities",
            required: false,
            system: false,
          },
          { id: "fld_activity_owner", key: "owner", label: "Owner", type: "user", required: false, system: false },
          { id: "fld_activity_notes", key: "notes", label: "Notes", type: "long_text", required: false, system: false },
        ],
        layout: {
          groups: [
            { label: "Details", fieldIds: ["fld_activity_subject", "fld_activity_type", "fld_activity_due", "fld_activity_done"] },
            { label: "Relationships", fieldIds: ["fld_activity_contact", "fld_activity_owner"] },
            { label: "Notes", fieldIds: ["fld_activity_notes"] },
          ],
        },
      },
    ],
    relations: [
      { key: "company_contacts", fromObject: "company", toObject: "contact", kind: "one_to_many", label: "Contacts" },
      { key: "company_deals", fromObject: "company", toObject: "deal", kind: "one_to_many", label: "Deals" },
      { key: "contact_activities", fromObject: "contact", toObject: "activity", kind: "one_to_many", label: "Activities" },
    ],
    pipelines: [
      {
        id: "pl_sales",
        objectKey: "deal",
        name: "Sales pipeline",
        stageFieldId: "fld_deal_stage",
        stages: [
          { key: "new", label: "New", probability: 10 },
          { key: "qualified", label: "Qualified", probability: 30 },
          { key: "proposal", label: "Proposal", probability: 50 },
          { key: "negotiation", label: "Negotiation", probability: 75 },
          { key: "won", label: "Won", probability: 100, isWon: true },
          { key: "lost", label: "Lost", probability: 0, isLost: true },
        ],
      },
    ],
    views: [
      {
        id: "vw_contacts",
        objectKey: "contact",
        name: "All contacts",
        renderer: "table",
        columns: ["fld_contact_name", "fld_contact_email", "fld_contact_phone", "fld_contact_company", "fld_contact_owner"],
        sort: { fieldId: "fld_contact_name", direction: "asc" },
      },
      {
        id: "vw_companies",
        objectKey: "company",
        name: "All companies",
        renderer: "table",
        columns: ["fld_company_name", "fld_company_domain", "fld_company_industry", "fld_company_employees"],
        sort: { fieldId: "fld_company_name", direction: "asc" },
      },
      {
        id: "vw_deals",
        objectKey: "deal",
        name: "All deals",
        renderer: "table",
        columns: ["fld_deal_name", "fld_deal_amount", "fld_deal_stage", "fld_deal_close_date", "fld_deal_company"],
        sort: { fieldId: "fld_deal_close_date", direction: "asc" },
      },
      {
        id: "vw_deal_board",
        objectKey: "deal",
        name: "Deal board",
        renderer: "kanban",
        pipelineId: "pl_sales",
        columns: ["fld_deal_name", "fld_deal_amount", "fld_deal_close_date"],
      },
      {
        id: "vw_open_activities",
        objectKey: "activity",
        name: "Open activities",
        renderer: "table",
        columns: ["fld_activity_subject", "fld_activity_type", "fld_activity_due", "fld_activity_contact"],
        filters: { join: "and", conditions: [{ fieldId: "fld_activity_done", operator: "is_false" }], groups: [] },
        sort: { fieldId: "fld_activity_due", direction: "asc" },
      },
    ],
    automations: [],
  });
}
