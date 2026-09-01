import { getSession } from "@/lib/auth/session";
import { drainQueues } from "@/lib/jobs/drain";

/**
 * Serverless has nowhere to run a worker process, so the queue is drained by
 * request instead. Signed-in users only — this is not a public endpoint, and it
 * returns counts rather than anything about the jobs themselves.
 */
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Sign in to continue.", { status: 401 });

  try {
    const result = await drainQueues();
    return Response.json(result);
  } catch (error) {
    console.error("drain failed:", error);
    return new Response("Queued work could not be processed.", { status: 500 });
  }
}
