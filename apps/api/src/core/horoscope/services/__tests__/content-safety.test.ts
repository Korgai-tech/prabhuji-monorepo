import { describe, expect, test } from "vitest";
import { validateContentSafety } from "../content-safety.js";

/**
 * Unit coverage for the content-safety guardrail (TAM-73, PRD §6.11). Prohibited
 * claims across every category must be rejected; calm devotional copy (including
 * the legitimate zodiac sign "Cancer") must pass.
 */

describe("validateContentSafety — prohibited claims are rejected", () => {
  test("medical cure claim → rejected (medical)", () => {
    const v = validateContentSafety({
      displayText: "This ritual will cure your disease completely.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("medical");
  });

  test("miracle cure → rejected (medical)", () => {
    const v = validateContentSafety({ displayText: "A miracle cure awaits you." });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("medical");
  });

  test("guaranteed wealth → rejected (financial)", () => {
    const v = validateContentSafety({
      displayText: "Today brings you guaranteed wealth and riches.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("financial");
  });

  test("fear-based curse remedy → rejected (fear)", () => {
    const v = validateContentSafety({
      displayText: "Beware — a curse will harm you unless you act now.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("fear");
  });

  test("expensive ritual pressure → rejected (ritual_pressure)", () => {
    const v = validateContentSafety({
      displayText: "You must pay 5100 for this expensive puja to be safe.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("ritual_pressure");
  });

  test("guaranteed-harm claim → rejected (harm)", () => {
    const v = validateContentSafety({
      displayText: "Ignore this and you will definitely fail.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("harm");
  });

  test("a prohibited phrase hidden in ttsText is still caught", () => {
    const v = validateContentSafety({
      displayText: "A calm day ahead.",
      ttsText: "This will cure everything.",
    });
    expect(v.passed).toBe(false);
  });
});

describe("validateContentSafety — calm devotional copy passes", () => {
  test("gentle guidance passes", () => {
    expect(
      validateContentSafety({
        title: "Health care",
        displayText:
          "Care for yourself gently — rest when you need to and breathe slowly.",
      }).passed
    ).toBe(true);
  });

  test("the zodiac sign 'Cancer' is NOT a false positive", () => {
    expect(
      validateContentSafety({
        title: "Namaste",
        displayText: "Namaste, dear Cancer. May your day begin with a calm heart.",
      }).passed
    ).toBe(true);
  });

  test("honest work-and-money copy passes (no financial guarantee)", () => {
    expect(
      validateContentSafety({
        displayText:
          "Approach your work with steady focus; honest effort brings quiet progress.",
      }).passed
    ).toBe(true);
  });
});

/**
 * Indic coverage. Before these patterns the validator was English-only, which
 * made a `passed` verdict MEANINGLESS for the Hindi, Marathi and Telugu content
 * the generation pipeline produces — every Indic string passed unconditionally.
 *
 * ⚠️ The patterns are machine-authored from the PRD categories and await native
 * review; these tests pin the phrasings they currently claim to catch, not a
 * claim of exhaustive coverage.
 */
describe("validateContentSafety — Hindi / Marathi (Devanagari)", () => {
  test("guaranteed cure → rejected (medical)", () => {
    const v = validateContentSafety({
      displayText: "आज आपका रोग पूरी तरह ठीक हो जाएगा।",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("medical");
  });

  test("stop taking your medicine → rejected (medical)", () => {
    expect(
      validateContentSafety({ displayText: "आज से दवा बंद कर दीजिए।" }).passed
    ).toBe(false);
  });

  test("guaranteed profit → rejected (financial)", () => {
    const v = validateContentSafety({
      displayText: "आज निश्चित लाभ होगा और धन दोगुना होगा।",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("financial");
  });

  test("Marathi 'money will double' → rejected (financial)", () => {
    expect(
      validateContentSafety({ displayText: "आज तुमचे पैसे दुप्पट होतील." }).passed
    ).toBe(false);
  });

  test("curse / black magic → rejected (fear)", () => {
    const v = validateContentSafety({
      displayText: "आप पर काला जादू है और श्राप लगा है।",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("fear");
  });

  test("Marathi certain destruction → rejected (fear)", () => {
    expect(
      validateContentSafety({ displayText: "आज विनाश होईल असे दिसते." }).passed
    ).toBe(false);
  });

  test("expensive puja → rejected (ritual_pressure)", () => {
    const v = validateContentSafety({
      displayText: "आज महंगी पूजा करवाना जरूरी है।",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("ritual_pressure");
  });

  test("certain loss → rejected (harm)", () => {
    const v = validateContentSafety({
      displayText: "आज निश्चित नुकसान होगा।",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("harm");
  });

  test("calm Hindi devotional copy passes", () => {
    expect(
      validateContentSafety({
        title: "नमस्ते",
        displayText:
          "आज मन स्थिर रहेगा और अधूरे काम पूरे करने का अच्छा अवसर मिलेगा। धैर्य रखें।",
      }).passed
    ).toBe(true);
  });

  test("calm Marathi devotional copy passes", () => {
    expect(
      validateContentSafety({
        title: "नमस्कार",
        displayText:
          "आज मन स्थिर राहील आणि अपूर्ण कामे पूर्ण करण्याची चांगली संधी मिळेल.",
      }).passed
    ).toBe(true);
  });

  test("a free devotional suggestion is NOT ritual pressure", () => {
    // The diya/gratitude suggestion is the PRD's own example of ALLOWED copy —
    // a deny-list that rejects it would block the todays_solution step outright.
    expect(
      validateContentSafety({
        displayText:
          "शाम को एक दीपक जलाएं और कुछ समय शांत मन से आभार व्यक्त करें।",
      }).passed
    ).toBe(true);
  });
});

describe("validateContentSafety — Telugu", () => {
  test("guaranteed cure → rejected (medical)", () => {
    const v = validateContentSafety({
      displayText: "ఈరోజు మీ రోగం ఖచ్చితంగా నయం అవుతుంది.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("medical");
  });

  test("guaranteed profit → rejected (financial)", () => {
    const v = validateContentSafety({
      displayText: "ఈరోజు ఖచ్చితంగా లాభం మరియు ధనం రెట్టింపు అవుతుంది.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("financial");
  });

  test("sorcery / curse → rejected (fear)", () => {
    const v = validateContentSafety({ displayText: "మీపై శాపం ఉంది." });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("fear");
  });

  test("expensive puja → rejected (ritual_pressure)", () => {
    const v = validateContentSafety({
      displayText: "ఈరోజు ఖరీదైన పూజ చేయాలి.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("ritual_pressure");
  });

  test("certain loss → rejected (harm)", () => {
    const v = validateContentSafety({
      displayText: "ఈరోజు ఖచ్చితంగా నష్టం జరుగుతుంది.",
    });
    expect(v.passed).toBe(false);
    expect(v.category).toBe("harm");
  });

  test("calm Telugu devotional copy passes", () => {
    expect(
      validateContentSafety({
        title: "నమస్తే",
        displayText:
          "ఈరోజు మనసు స్థిరంగా ఉంటుంది మరియు పెండింగ్ పనులు పూర్తి చేయడానికి మంచి అవకాశం.",
      }).passed
    ).toBe(true);
  });
});
