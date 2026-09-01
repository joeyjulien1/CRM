"use server";

import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { records, viewPrefs } from "@/lib/db/schema";
import { getCurrentVersion } from "@/lib/config/version";
import type { CrmRecord, FilterTree, ObjectKey, Sort } from "@/lib/config/types";
import { compileSearch } from "@/lib/runtime/query";
import {
  createRecord,
  listRecords,
  RecordError,
  titlesFor,
  updateRecord,
} from "@/lib/runtime/records";
import { dispatchRecordEvent } from "@/lib/automations/dispatch";

export interface ActionError {
  message: string;
  fieldErrors?: Record<string, string>;
}

export async function listRecordsAction(
  viewId: string,
  options: { sort?: Sort; filters?: FilterTree; search?: string; offset?: number },
): Promise<{ records: CrmRecord[]; total: number; titles: Record<string, string> }> {
  const session = await requireSession();

  return withTenant(session.tenantId, async (db) => {
    const { config } = await getCurrentVersion(db, session.tenantId);
    const view = config.views.find((candidate) => candidate.id === viewId);
    if (!view) throw new Error("That view no longer exists.");

    const page = await listRecords(
      db,
      session.tenantId,
      config,
      { ...view, sort: options.sort ?? view.sort },
      { extraFilters: options.filters, search: options.search, offset: options.offset, limit: 500 },
    );

    const object = config.objects.find((candidate) => candidate.key === view.objectKey);
    const relationFieldIds = (object?.fields ?? [])
      .filter((field) => field.type === "relation")
      .map((field) => field.id);

    const referenced = page.records.flatMap((record) =>
      relationFieldIds.map((fieldId) => record.data[fieldId]).filter(Boolean).map(String),
    );
    const titles = await titlesFor(db, session.tenantId, config, referenced);

    return { ...page, titles: Object.fromEntries(titles) };
  });
}

export async function updateRecordFieldAction(
  recordId: string,
  fieldId: string,
  value: unknown,
): Promise<{ ok: true } | ActionError> {
  const session = await requireSession();

  try {
    const outcome = await withTenant(session.tenantId, async (db) => {
      const { config, version } = await getCurrentVersion(db, session.tenantId);
      return {
        result: await updateRecord(db, session.tenantId, config, recordId, { [fieldId]: value }, session.email),
        version,
      };
    });

    await dispatchRecordEvent({
      tenantId: session.tenantId,
      recordId,
      kind: "record_updated",
      changedFieldIds: outcome.result.changedFieldIds,
      configVersion: outcome.version,
    });

    revalidatePath("/views/[viewId]", "page");
    return { ok: true };
  } catch (error) {
    if (error instanceof RecordError) {
      return { message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
}

export async function createRecordAction(
  objectKey: ObjectKey,
  values: Record<string, unknown>,
): Promise<{ ok: true; id: string } | ActionError> {
  const session = await requireSession();

  try {
    const created = await withTenant(session.tenantId, async (db) => {
      const { config, version } = await getCurrentVersion(db, session.tenantId);
      const record = await createRecord(db, session.tenantId, config, objectKey, values, session.email);
      return { record, version };
    });

    await dispatchRecordEvent({
      tenantId: session.tenantId,
      recordId: created.record.id,
      kind: "record_created",
      changedFieldIds: Object.keys(values),
      configVersion: created.version,
    });

    revalidatePath("/views/[viewId]", "page");
    return { ok: true, id: created.record.id };
  } catch (error) {
    if (error instanceof RecordError) {
      return { message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
}

/** Column widths are a per-user preference, not configuration. */
export async function saveColumnWidthsAction(
  viewId: string,
  columnWidths: Record<string, number>,
): Promise<void> {
  const session = await requireSession();

  await withTenant(session.tenantId, (db) =>
    db
      .insert(viewPrefs)
      .values({ tenantId: session.tenantId, userId: session.userId, viewId, columnWidths })
      .onConflictDoUpdate({
        target: [viewPrefs.tenantId, viewPrefs.userId, viewPrefs.viewId],
        set: { columnWidths },
      }),
  );
}

export async function searchRecordsAction(
  query: string,
): Promise<{ id: string; title: string; objectKey: ObjectKey }[]> {
  const session = await requireSession();
  const term = query.trim();
  if (term.length < 2) return [];

  return withTenant(session.tenantId, async (db) => {
    const { config } = await getCurrentVersion(db, session.tenantId);

    const perObject: SQL[] = [];
    for (const object of config.objects) {
      const search = compileSearch(config, object.key, term);
      if (search) perObject.push(and(eq(records.objectKey, object.key), search)!);
    }
    if (perObject.length === 0) return [];

    const rows = await db
      .select({ id: records.id, objectKey: records.objectKey, data: records.data })
      .from(records)
      .where(and(eq(records.tenantId, session.tenantId), isNull(records.deletedAt), or(...perObject)))
      .orderBy(sql`${records.updatedAt} desc`)
      .limit(20);

    const titleFieldByObject = new Map(
      config.objects.map((object) => [object.key, object.titleFieldId ?? object.fields[0]?.id]),
    );

    return rows.map((row) => {
      const objectKey = row.objectKey as ObjectKey;
      const titleFieldId = titleFieldByObject.get(objectKey);
      const title = titleFieldId ? row.data[titleFieldId] : undefined;
      return { id: row.id, objectKey, title: title ? String(title) : "Untitled" };
    });
  });
}
