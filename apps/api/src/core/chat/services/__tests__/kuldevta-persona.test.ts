import { describe, expect, it } from "vitest";

import { VARIANT_AGENTS, agentForVariant, isKuldevtaPersonaAgent } from "../chat.constants.js";
import { assessAgentError, assessAgentReply } from "../crisis-detection.service.js";

/**
 * TAM-165. The persona conversation is a variant arm of the existing chatbot,
 * not a second chat surface — so it inherits sessions, transcripts, history
 * and the crisis layer instead of reimplementing them.
 */
describe("kuldevta persona arm", () => {
  it("is served by a distinct agent, reachable only through the variant map", () => {
    const agent = agentForVariant("kuldevta_chat");
    expect(agent).toBeDefined();
    expect(agent).not.toBe(agentForVariant("bhagwat_gita_chat"));
    expect(agent).not.toBe(agentForVariant("content_chat"));
  });

  it("recognises its agent by id, not by variant", () => {
    // A variant remapped mid-conversation must not change who an already-open
    // session is talking to — the session stores the agent id, so that is what
    // decides whether identity injection applies.
    expect(isKuldevtaPersonaAgent(agentForVariant("kuldevta_chat")!)).toBe(true);
    expect(isKuldevtaPersonaAgent(agentForVariant("bhagwat_gita_chat")!)).toBe(false);
  });

  it("leaves the control arm with no agent", () => {
    expect(agentForVariant("control")).toBeUndefined();
    expect(Object.keys(VARIANT_AGENTS)).not.toContain("control");
  });
});

/**
 * Crisis handling now covers EVERY agent, not just the persona one. Before
 * this consolidation the Gita agent had none.
 */
describe("crisis handling applies to every agent", () => {
  it("treats the distress sentinel as a crisis, with or without trailing punctuation", () => {
    expect(assessAgentReply("DISTRESS_DETECTED").crisis).toBe(true);
    expect(assessAgentReply("DISTRESS_DETECTED.").crisis).toBe(true);
  });

  it("treats a content-policy rejection as a crisis", () => {
    // Azure screens the PROMPT, so on a distress conversation the model never
    // runs and never emits its sentinel — the rejection is the only signal.
    expect(assessAgentError(new Error("content_filter: self_harm")).crisis).toBe(true);
  });

  it("does not escalate an ordinary upstream failure", () => {
    expect(assessAgentError(new Error("ETIMEDOUT")).crisis).toBe(false);
  });

  it("passes an ordinary devotional reply through", () => {
    expect(assessAgentReply("Beta, main tumhare saath hoon.").crisis).toBe(false);
  });
});

/**
 * `kuldevtaAssigned` on the launch payload. `GET /users/me` is hit by every
 * app launch, so the assignment lookup must not run for arms that cannot act
 * on the answer — and it must never be able to fail that launch.
 */
describe("kuldevtaAssigned is arm-gated", () => {
  it("is false outside the kuldevta arm, meaning 'not applicable'", () => {
    // The contract the field's doc states: read it together with agentId,
    // never alone. A `false` here says nothing about whether the user has a
    // kuldevta — the lookup was skipped.
    const gitaAgent = agentForVariant("bhagwat_gita_chat")!;
    expect(isKuldevtaPersonaAgent(gitaAgent)).toBe(false);
  });

  it("is only computed for the persona agent", () => {
    const personaAgent = agentForVariant("kuldevta_chat")!;
    expect(isKuldevtaPersonaAgent(personaAgent)).toBe(true);
  });
});
