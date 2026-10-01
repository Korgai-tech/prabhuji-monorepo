import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("kuldevta:ragflow-agent-client");

/**
 * The six free-text answers a family gives about their lineage, in the
 * fixed order the parser agent's prompt expects.
 */
export interface SixAnswers {
  surname: string;
  ancestralPlace: string;
  community: string;
  gotra: string;
  templeMentioned: string;
  mandirPhoto: string;
}

/**
 * Verified RAGFlow agent id for the kuldevta lineage parser (2026-09-01).
 * Do not change without re-verifying against the RAGFlow canvas — a wrong id
 * silently talks to a different agent.
 */
const PARSER_AGENT_ID = "e00c9c78a60511f18e582d93545b9663";

function formatQuery(a: SixAnswers): string {
  return [
    `1. Surname: ${a.surname}`,
    `2. Parivar kaha se: ${a.ancestralPlace}`,
    `3. Samaj: ${a.community}`,
    `4. Gotra: ${a.gotra}`,
    `5. Dada dadi konse mandir jaate the: ${a.templeMentioned}`,
    `6. Ghar ke mandir mein photo: ${a.mandirPhoto}`,
  ].join("\n");
}

interface RagflowTraceEntry {
  component_id: string;
  trace?: { outputs?: { content?: string } }[];
}

interface RagflowChatResponse {
  data?: { data?: { trace?: RagflowTraceEntry[] } };
}

/**
 * Calls the RAGFlow lineage-parser agent with the family's six answers and
 * returns its raw text output (untouched — repair/parsing is the caller's
 * job via `repairAndParseProfile`, kept in `services/` per the architecture
 * boundary: no JSON parsing/repair logic lives here).
 *
 * The output is NOT at `data.data.content` — that field comes back empty
 * because the RAGFlow canvas driving this agent has no Message component
 * wired up. The only place the agent's answer actually lands is the trace
 * entry for the Agent node itself, which is why the request sets
 * `return_trace: true` and why this reads `data.data.trace[]` instead
 * (verified against production, 2026-09-01).
 */
export async function callParserAgent(answers: SixAnswers): Promise<string> {
  const env = loadEnv();
  if (!env.RAGFLOW_BASE_URL || !env.RAGFLOW_API_KEY) {
    throw new Error(
      "RAGFLOW_BASE_URL / RAGFLOW_API_KEY is not set — callParserAgent must only be invoked when RAGFlow is configured"
    );
  }

  const startedAt = Date.now();
  const res = await fetch(`${env.RAGFLOW_BASE_URL}/api/v1/agents/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RAGFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      agent_id: PARSER_AGENT_ID,
      query: formatQuery(answers),
      stream: false,
      return_trace: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`RAGFlow parser HTTP ${res.status}`);
  }

  const body = (await res.json()) as RagflowChatResponse;
  const entries = body.data?.data?.trace ?? [];
  const agentEntry = entries.find((t) => t.component_id.startsWith("Agent:"));
  const content = agentEntry?.trace?.[0]?.outputs?.content;

  log.info(
    { latencyMs: Date.now() - startedAt, hasContent: Boolean(content) },
    "kuldevta parser agent call complete"
  );

  if (!content) {
    throw new Error("RAGFlow parser returned no agent output in trace");
  }
  return content;
}
