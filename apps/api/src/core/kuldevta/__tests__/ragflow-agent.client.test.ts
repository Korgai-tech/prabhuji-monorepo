import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@api/shared/config", () => ({
  loadEnv: () => ({
    RAGFLOW_BASE_URL: "https://ragflow.example.com",
    RAGFLOW_API_KEY: "test-key",
  }),
}));

/**
 * Deferred #7 — `callParserAgent`'s trace walk had ZERO automated coverage.
 * This drives the real function through a stubbed `fetch` returning the real
 * recorded RAGFlow shape.
 *
 * The shape is the load-bearing part: the agent's answer is NOT at
 * `data.data.content` (empty — the canvas has no Message component) but
 * DOUBLY nested at `data.data.trace[].trace[].outputs.content`, keyed off the
 * `Agent:`-prefixed `component_id`. Every level of that walk is a place a
 * silent `undefined` turns every identify call into a 502.
 */
const ANSWERS = {
  surname: "Patil",
  ancestralPlace: "Satara, Maharashtra",
  community: "Maratha",
  gotra: "pata nahi",
  templeMentioned: "Jejuri wale khandoba",
  mandirPhoto: "bhandara wale devta",
};

const PROFILE_JSON = JSON.stringify({
  surname: "Patil",
  community: "Maratha",
  soft_signals: { temple_mentioned: "Jejuri wale khandoba" },
});

/** The recorded production response shape (2026-09-01), trimmed to the fields the client reads. */
function recordedBody(content: string): unknown {
  return {
    code: 0,
    data: {
      data: {
        content: "",
        trace: [
          { component_id: "begin", trace: [] },
          {
            component_id: "Agent:LineageParser",
            trace: [{ outputs: { content } }],
          },
        ],
      },
    },
  };
}

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("callParserAgent", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts the profile from the real recorded RAGFlow trace shape", async () => {
    stubFetch(recordedBody(PROFILE_JSON));
    const { callParserAgent } = await import("../repositories/ragflow-agent.client.js");
    await expect(callParserAgent(ANSWERS)).resolves.toBe(PROFILE_JSON);
  });

  it("requests the trace, without which the answer is unreachable", async () => {
    const fetchMock = stubFetch(recordedBody(PROFILE_JSON));
    const { callParserAgent } = await import("../repositories/ragflow-agent.client.js");
    await callParserAgent(ANSWERS);

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://ragflow.example.com/api/v1/agents/chat/completions");
    const sent = JSON.parse(init.body) as { return_trace: boolean; stream: boolean; query: string };
    expect(sent.return_trace).toBe(true);
    expect(sent.stream).toBe(false);
    // All six answers must reach the agent, in the order its prompt expects.
    expect(sent.query).toContain("1. Surname: Patil");
    expect(sent.query).toContain("6. Ghar ke mandir mein photo: bhandara wale devta");
  });

  it("ignores non-Agent trace entries rather than reading the first one", async () => {
    stubFetch({
      code: 0,
      data: {
        data: {
          trace: [
            { component_id: "Message:Something", trace: [{ outputs: { content: "WRONG" } }] },
            { component_id: "Agent:LineageParser", trace: [{ outputs: { content: PROFILE_JSON } }] },
          ],
        },
      },
    });
    const { callParserAgent } = await import("../repositories/ragflow-agent.client.js");
    await expect(callParserAgent(ANSWERS)).resolves.toBe(PROFILE_JSON);
  });

  it("throws when the trace carries no agent output, rather than returning empty text", async () => {
    stubFetch({ code: 0, data: { data: { content: "", trace: [] } } });
    const { callParserAgent } = await import("../repositories/ragflow-agent.client.js");
    await expect(callParserAgent(ANSWERS)).rejects.toThrow(/no agent output in trace/);
  });

  it("throws on a non-2xx response", async () => {
    stubFetch({ code: 100, message: "boom" }, { ok: false, status: 502 });
    const { callParserAgent } = await import("../repositories/ragflow-agent.client.js");
    await expect(callParserAgent(ANSWERS)).rejects.toThrow(/HTTP 502/);
  });
});
