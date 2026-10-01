import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { RagflowClient } from "../ragflow.client.js";

/**
 * What the wire log has to guarantee.
 *
 * The bodies are logged so a failing turn can be replayed against the provider,
 * which only works if they are logged VERBATIM — and the same lines must never
 * carry the API key, since they leave the box for ClickHouse.
 */
const API_KEY = "ragflow-secret-key-do-not-log";
const OK_BODY = JSON.stringify({
  code: 0,
  data: {
    session_id: "sess-1",
    message_id: "msg-1",
    data: { outputs: { content: "Namaste" } },
  },
});

const emitted: unknown[] = [];

// The logger is faked at the module seam rather than spied on the real one, so
// these assertions read the exact objects the client passed to it.
vi.mock("@api/shared/logs", () => {
  const record =
    (level: string) =>
    (...args: unknown[]) =>
      emitted.push([level, ...args]);
  return {
    createModuleLogger: () => ({
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
      debug: record("debug"),
    }),
  };
});

/** Every field of every log line this call emitted, as one searchable string. */
function captureLogs(): { lines: () => string } {
  emitted.length = 0;
  return { lines: () => JSON.stringify(emitted) };
}

function respond(body: string, status = 200): Response {
  return { status, text: () => Promise.resolve(body) } as unknown as Response;
}

describe("RagflowClient wire logging", () => {
  beforeEach(() => {
    process.env.RAGFLOW_BASE_URL = "https://ragflow.example.com";
    process.env.RAGFLOW_API_KEY = API_KEY;
    process.env.RAGFLOW_TIMEOUT_MS = "1000";
    resetEnvCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetEnvCache();
  });

  /**
   * Drive a failing call to its conclusion without waiting out the retry
   * backoff. A non-JSON body is a generic fault, so it is retried the full three
   * times — six real seconds of `setTimeout` this suite should not spend.
   */
  async function askThroughRetries(): Promise<unknown> {
    vi.useFakeTimers();
    const settled = new RagflowClient()
      .ask({ agentId: "agent-1", query: "namaste?" })
      .catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    return settled;
  }

  test("logs the request and response bodies verbatim, without the api key", async () => {
    const logs = captureLogs();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(OK_BODY));

    await new RagflowClient().ask({ agentId: "agent-1", query: "namaste?" });

    const text = logs.lines();
    // The exact bytes that went out and came back — not a reshaping of them.
    expect(text).toContain(JSON.stringify(OK_BODY).slice(1, -1));
    expect(text).toContain('agent_id\\\":\\\"agent-1');
    expect(text).not.toContain(API_KEY);
  });

  test("a non-JSON reply fails with the status, not a SyntaxError", async () => {
    captureLogs();
    // What a Render cold start actually serves.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      respond("<html>502 Bad Gateway</html>", 502)
    );

    expect(String(await askThroughRetries())).toContain(
      "non-JSON response (status 502)"
    );
  });

  test("the html body itself is logged, so the cold start is diagnosable", async () => {
    const logs = captureLogs();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      respond("<html>502 Bad Gateway</html>", 502)
    );

    await askThroughRetries();

    expect(logs.lines()).toContain("502 Bad Gateway");
  });
});
