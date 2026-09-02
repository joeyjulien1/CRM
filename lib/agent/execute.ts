import Anthropic from "@anthropic-ai/sdk";
import { withTenant } from "@/lib/db/client";
import { agentFailures } from "@/lib/db/schema";
import { applyPatches, PatchError } from "@/lib/config/patch";
import { computeImpact } from "@/lib/config/impact";
import type { Config, ConfigPatch, ImpactSummary } from "@/lib/config/types";
import { assertWithinBudget, getBudget, recordTurn, type BudgetState } from "./budget";
import { systemPrompt } from "./prompt";
import { AGENT_TOOLS, runTool, type ConnectRequest, type ImportProposal, type ToolContext } from "./tools";

const MODEL = process.env.AGENT_MODEL ?? "claude-opus-5";
const MAX_TOKENS = 16000;
const MAX_TOOL_ROUNDS = 12;

export interface AgentTurnInput {
  tenantId: string;
  userId?: string;
  config: Config;
  counts: Record<string, number>;
  history: Anthropic.MessageParam[];
  prompt: string;
  onText?: (delta: string) => void;
  sampleImportFile?: ToolContext["sampleImportFile"];
  connections?: ToolContext["connections"];
}

export interface AgentTurnResult {
  text: string;
  patches: ConfigPatch[];
  impact?: ImpactSummary;
  importProposal?: ImportProposal;
  /** Set when the agent asked the user to connect a third-party account. */
  connectRequest?: ConnectRequest;
  history: Anthropic.MessageParam[];
  budget: BudgetState;
  /** Set when the agent could not produce a patch the config would accept. */
  failure?: string;
}

/**
 * One turn. Tools stage patches; the patches validate as a set at the end; an
 * invalid set is handed back to the model once, and if the retry also fails the
 * user is told rather than shown a broken diff.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const { tenantId, config, counts } = input;

  // Before the call, never after. Each database touch is its own short
  // transaction — a transaction must never stay open across a model call.
  const budget = await withTenant(tenantId, (db) => assertWithinBudget(db, tenantId));

  const client = new Anthropic();
  const system = systemPrompt(config, counts);

  let importProposal: ImportProposal | undefined;
  let connectRequest: ConnectRequest | undefined;
  const context: ToolContext = {
    config,
    counts,
    sampleImportFile: input.sampleImportFile,
    connections: input.connections,
    onImportProposal: (proposal) => {
      importProposal = proposal;
    },
    onConnectRequest: (request) => {
      connectRequest = request;
    },
  };

  const messages: Anthropic.MessageParam[] = [
    ...input.history,
    { role: "user", content: input.prompt },
  ];

  let inputTokens = 0;
  let outputTokens = 0;

  const converse = async (): Promise<{ text: string; patches: ConfigPatch[] }> => {
    const patches: ConfigPatch[] = [];
    let text = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system,
        tools: AGENT_TOOLS,
        messages,
      });

      if (input.onText) {
        stream.on("text", (delta) => input.onText?.(delta));
      }

      const response = await stream.finalMessage();
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      for (const block of response.content) {
        if (block.type === "text") text += block.text;
      }

      // Thinking blocks travel back unchanged, so append the content as-is.
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (toolUses.length === 0) break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const outcome = await runTool(
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>,
          context,
        );
        patches.push(...outcome.patches);
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: outcome.message,
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }

      // Every result goes back in one user message, never split across several.
      messages.push({ role: "user", content: results });
    }

    return { text, patches };
  };

  let { text, patches } = await converse();
  let failure: string | undefined;

  if (patches.length > 0) {
    try {
      applyPatches(config, patches);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logFailure(tenantId, "invalid_patch", input.prompt, { error: message, patches });

      messages.push({
        role: "user",
        content: `That set of changes does not apply to this configuration: ${message}. Either correct it, or explain to me what you need to know.`,
      });

      // One retry, then the failure surfaces to the user.
      const retry = await converse();
      text = retry.text;
      patches = retry.patches;

      if (patches.length > 0) {
        try {
          applyPatches(config, patches);
        } catch (secondError) {
          const secondMessage =
            secondError instanceof Error ? secondError.message : String(secondError);
          await logFailure(tenantId, "invalid_patch_retry", input.prompt, {
            error: secondMessage,
            patches,
          });
          patches = [];
          failure = secondMessage;
        }
      }
    }
  }

  if (patches.length === 0 && !importProposal && !failure) {
    // Not an error, but worth knowing: it is the log that tells you what people
    // expect the agent to do that it cannot.
    await logFailure(tenantId, "no_patch", input.prompt, { reply: text.slice(0, 2000) });
  }

  const [impact, nextBudget] = await withTenant(tenantId, async (db) => {
    await recordTurn(db, tenantId, {
      userId: input.userId,
      model: MODEL,
      inputTokens,
      outputTokens,
      producedPatch: patches.length > 0,
    });

    return [
      patches.length > 0 ? await computeImpact(db, tenantId, config, patches) : undefined,
      await getBudget(db, tenantId),
    ] as const;
  });

  return {
    text,
    patches,
    impact,
    importProposal,
    connectRequest,
    history: messages,
    budget: nextBudget ?? budget,
    failure,
  };
}

async function logFailure(
  tenantId: string,
  kind: string,
  prompt: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await withTenant(tenantId, (db) =>
    db.insert(agentFailures).values({ tenantId, kind, prompt: prompt.slice(0, 4000), detail }),
  );
}

export { PatchError };
