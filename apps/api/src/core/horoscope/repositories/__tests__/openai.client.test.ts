import { describe, expect, test } from "vitest";
import { isReasoningModel } from "@api/core/horoscope/repositories/openai.client";

/**
 * The predicate decides two request parameters (`temperature` is dropped,
 * `reasoning_effort: "minimal"` is added), and both are load-bearing: sending
 * `temperature` to a gpt-5 model 400s the whole call, and omitting
 * `reasoning_effort` lets it spend the entire output-token ceiling on reasoning
 * and return nothing. A wrong answer here is a total generation outage, not a
 * degraded response — hence a test for what is otherwise a one-line regex.
 */
describe("isReasoningModel", () => {
  test.each([
    "gpt-5-nano",
    "gpt-5",
    "gpt-5.1",
    "gpt-5-codex",
    "o1",
    "o3-mini",
    "o4-mini",
    // LiteLLM-style provider prefixes must not hide the family.
    "openai/gpt-5-nano",
    "azure/o3-mini",
    // Casing comes from operator-set config, not from us.
    "GPT-5-Nano",
  ])("%s is a reasoning model", (model) => {
    expect(isReasoningModel(model)).toBe(true);
  });

  test.each([
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "openai/gpt-4o",
    "gemini-2.5-flash",
    // The gateway's own fallback targets are not OpenAI models at all.
    "gemini-2.5-flash-lite",
    // Guard the prefix match: a name that merely STARTS with the letter o is
    // an ordinary chat model and must keep its temperature.
    "omni-moderation-latest",
  ])("%s is not a reasoning model", (model) => {
    expect(isReasoningModel(model)).toBe(false);
  });
});
