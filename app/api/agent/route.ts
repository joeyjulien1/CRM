import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { getCurrentVersion } from "@/lib/config/version";
import { countByObject } from "@/lib/runtime/records";
import { runAgentTurn } from "@/lib/agent/execute";
import { BudgetError } from "@/lib/agent/budget";
import { readImportSample } from "@/lib/import/sample";
import { activeTemplate } from "@/lib/templates/apply";

/** Newline-delimited JSON, so the panel can render text as it arrives. */
export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Sign in to continue.", { status: 401 });

  const body = (await request.json()) as { prompt?: string };
  const prompt = body.prompt?.trim();
  if (!prompt) return new Response("Ask the agent something.", { status: 400 });

  const { config, counts, template } = await withTenant(session.tenantId, async (db) => ({
    config: (await getCurrentVersion(db, session.tenantId)).config,
    counts: await countByObject(db, session.tenantId),
    template: await activeTemplate(db, session.tenantId),
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const result = await runAgentTurn({
          tenantId: session.tenantId,
          userId: session.userId,
          config,
          counts,
          history: [],
          prompt,
          templateBrief: template?.brief,
          onText: (delta) => send({ type: "text", delta }),
          sampleImportFile: (fileId) => readImportSample(session.tenantId, fileId),
        });

        if (result.patches.length > 0 && result.impact) {
          send({ type: "patch", patches: result.patches, impact: result.impact });
        }
        if (result.failure) {
          send({
            type: "error",
            message: `That change could not be made: ${result.failure}`,
          });
        }
        send({ type: "budget", remaining: result.budget.remaining, fraction: result.budget.fraction });
      } catch (error) {
        const message =
          error instanceof BudgetError
            ? error.message
            : "The agent could not finish that. Try again, or rephrase what you need.";
        if (!(error instanceof BudgetError)) console.error("agent turn failed:", error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
