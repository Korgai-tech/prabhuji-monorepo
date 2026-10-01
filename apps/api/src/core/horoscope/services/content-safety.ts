/**
 * Content-safety guardrail (TAM-73, PRD §6.11). ENFORCED, NOT ADVISORY — this
 * validator runs on the SEED path (nothing prohibited is ever stored) AND on the
 * SERVE path (nothing prohibited is ever returned, even if it somehow got into a
 * row). A step failing any category is rejected; only `passed` content is served.
 *
 * The deny-list is keyword/pattern based per the PRD's prohibited categories:
 *   - medical cures / disease claims
 *   - financial / legal guarantees
 *   - fear-based remedies / panic warnings
 *   - expensive / mandatory ritual pressure
 *   - guaranteed-harm claims
 *
 * Deliberately conservative and simple — a Phase-1 guardrail over developer-
 * authored placeholder devotional copy, not an NLP classifier. AI-generated
 * content runs through this SAME validator before storing.
 *
 * ## Language coverage (read before trusting a `passed` verdict)
 *
 * The original list was English-only, which made it VACUOUS for the Hindi,
 * Marathi and Telugu content the generation pipeline produces — every Indic
 * string passed unconditionally. `INDIC_DENY_LIST` closes that hole for the
 * obvious phrasings.
 *
 * It does not close it completely, and no keyword list could. The Indic patterns
 * were authored from the PRD's prohibited categories and NEED NATIVE-SPEAKER
 * REVIEW before they should be relied on — Marathi and Telugu especially. They
 * are one layer: the generation pipeline also runs an LLM judge, which catches
 * the paraphrases a deny-list structurally cannot.
 *
 * Note `\b` is deliberately absent from the Indic patterns: JavaScript's `\b` is
 * defined over ASCII word characters, so it does not mark word boundaries in
 * Devanagari or Telugu and would silently never match.
 */

export type SafetyCategory =
  | "medical"
  | "financial"
  | "fear"
  | "ritual_pressure"
  | "harm";

export interface SafetyVerdict {
  passed: boolean;
  /** The first violated category + the matched phrase, for logs (only when failed). */
  category?: SafetyCategory;
  matched?: string;
}

/** Text carrying user-visible content for a single step. */
export interface SafetyInput {
  title?: string;
  displayText: string;
  ttsText?: string;
}

interface DenyBucket {
  category: SafetyCategory;
  patterns: RegExp[];
}

const DENY_LIST: DenyBucket[] = [
  {
    // Medical CURE/treatment CLAIMS only — deliberately phrase-based so a
    // legitimate zodiac term (e.g. the sign "Cancer") is NOT a false positive.
    category: "medical",
    patterns: [
      /\bcure(s|d)?\s+(your|the|any|all)?\s*(disease|illness|cancer|diabetes|ailment|sickness)/i,
      /\b(will|can|shall)\s+(cure|heal)\b/i,
      /\bheal(s|ed)?\s+(your|the)\s+(disease|illness|cancer|diabetes|ailment)/i,
      /\bmiracle\s+(cure|remedy|medicine)/i,
      /\bguaranteed?\s+(cure|recovery|healing)/i,
      /\bstop\s+taking\s+(your\s+)?medicine/i,
    ],
  },
  {
    category: "financial",
    patterns: [
      /\bguaranteed?\s+(wealth|money|riches|profit|returns?|income)/i,
      /\bget\s+rich\b/i,
      /\bdouble\s+your\s+(money|wealth|investment)/i,
      /\bsure\s+shot\s+(profit|gain)/i,
      /\bwin\s+the\s+lottery\b/i,
      /\blegal\s+case\s+(will|guaranteed)/i,
    ],
  },
  {
    category: "fear",
    patterns: [
      /\byou\s+will\s+die\b/i,
      /\bdeath\s+is\s+(near|coming)/i,
      /\bcurse(d)?\b/i,
      /\bblack\s+magic\b/i,
      /\bevil\s+eye\s+will\s+(harm|destroy)/i,
      /\bdisaster\s+will\s+strike\b/i,
      /\bbeware\s+or\s+you/i,
    ],
  },
  {
    category: "ritual_pressure",
    patterns: [
      /\bpay\s+(₹|rs\.?|inr)?\s*\d/i,
      /\bexpensive\s+(ritual|puja|pooja|yagna|homa)/i,
      /\byou\s+must\s+(donate|pay|buy)/i,
      /\bonly\s+this\s+(ritual|puja|pooja)\s+can\s+save/i,
    ],
  },
  {
    category: "harm",
    patterns: [
      /\bguaranteed?\s+(harm|loss|failure|ruin)/i,
      /\bwill\s+definitely\s+(fail|lose|suffer)/i,
      /\bharm\s+(your\s+)?(enemy|enemies)/i,
    ],
  },
];

/**
 * Hindi / Marathi (Devanagari) and Telugu patterns for the SAME five categories.
 *
 * ⚠️ AUTHORED FROM THE PRD, NOT BY A NATIVE SPEAKER. These catch the direct
 * phrasings of each prohibited category and will miss idiomatic ones. Treat
 * additions here as content work requiring review, not as a code change.
 *
 * Hindi and Marathi share Devanagari and much vocabulary, so most patterns serve
 * both; Marathi-specific verb forms are listed alongside rather than separately,
 * because the validator does not know which language it is looking at (and for
 * a deny-list it does not need to — a Hindi phrase appearing in Marathi copy is
 * equally unwanted).
 */
const INDIC_DENY_LIST: DenyBucket[] = [
  {
    category: "medical",
    patterns: [
      // hi/mr — guaranteed cure / disease removal / stop-your-medicine
      /(रोग|बीमारी|आजार|व्याधी)\s*(पूरी तरह|पूर्ण|निश्चित|नक्की)?\s*(ठीक|दूर|बरा|नष्ट)\s*(हो|होईल|हो जाएगा|हो जाएगी)/,
      /(निश्चित|पक्का|खात्रीशीर|चमत्कारी|चमत्कारिक)\s*(इलाज|उपचार|दवा|औषध)/,
      /(दवा|दवाई|औषध)\s*(बंद|छोड़)/,
      /रोग\s*मुक्त\s*(हो|होईल)/,
      // te — cure claims / stop medicine
      /(రోగం|వ్యాధి)\s*(ఖచ్చితంగా)?\s*నయం\s*(అవుతుంది|అవుతారు)/,
      /(ఖచ్చితమైన|అద్భుత)\s*(నివారణ|చికిత్స|మందు)/,
      /మందు\s*(ఆపండి|ఆపు|మానండి)/,
    ],
  },
  {
    category: "financial",
    patterns: [
      // hi/mr — guaranteed profit / doubling / lottery
      /(निश्चित|पक्का|गारंटी|नक्की|खात्रीशीर)\s*(लाभ|मुनाफा|धन|फायदा|नफा)/,
      /(धन|पैसा|पैसे|संपत्ति)\s*(दोगुना|दुप्पट|दुगना)/,
      /मालामाल\s*(हो|होईल)/,
      /(लॉटरी|लाॅटरी)\s*(जीत|जिंका)/,
      // te — guaranteed profit / doubling / lottery
      /ఖచ్చితం(గా|ైన)\s*(లాభం|ధనలాభం|డబ్బు)/,
      /(ధనం|డబ్బు)\s*రెట్టింపు/,
      /లాటరీ\s*గెలుస్తారు/,
      /ధనవంతులు\s*అవుతారు/,
    ],
  },
  {
    category: "fear",
    patterns: [
      // hi/mr — death / curse / black magic / certain ruin
      /(मृत्यु|मौत|मृत्यू)\s*(निश्चित|नजदीक|जवळ|नक्की)/,
      /आप\s*मर\s*(जाएंगे|जाओगे)/,
      /(श्राप|शाप|शापित)/,
      /(काला\s*जादू|काळी\s*जादू)/,
      /(बुरी\s*नजर|वाईट\s*नजर)\s*(से)?\s*(नाश|विनाश|नुकसान)/,
      /(अनिष्ट|विनाश|सर्वनाश)\s*(होगा|होईल)/,
      // te — death / curse / sorcery / destruction
      /మరణం\s*(ఖాయం|ఖచ్చితం|దగ్గరలో)/,
      /మీరు\s*చనిపోతారు/,
      /(శాపం|చేతబడి|క్షుద్ర)/,
      /(వినాశనం|సర్వనాశనం)\s*(జరుగుతుంది|అవుతుంది)/,
      /దుష్ట\s*దృష్టి\s*(వల్ల)?\s*(నష్టం|హాని)/,
    ],
  },
  {
    category: "ritual_pressure",
    patterns: [
      // hi/mr — pay money / expensive puja / mandatory donation / only-this-saves
      /(₹|रु\.?|रुपये|रुपए)\s*\d/,
      /(महंगी|महँगी|महागडी|महागड्या)\s*(पूजा|पूजन|अनुष्ठान|यज्ञ|विधी)/,
      /(दान|दक्षिणा|पैसे)\s*(करना|देना|करावेच)\s*(ही\s*)?(होगा|पड़ेगा|लागेल|अनिवार्य)/,
      /(यह|ही|हीच)\s*पूजा\s*(ही\s*)?(आपको\s*)?(बचा|वाचव)/,
      // te — pay money / expensive puja / mandatory donation
      /(₹|రూ\.?|రూపాయ)\s*\d/,
      /(ఖరీదైన|ధరైన)\s*(పూజ|హోమం|యజ్ఞం)/,
      /(డబ్బు|దానం)\s*(తప్పనిసరిగా|తప్పకుండా)?\s*(చెల్లించాలి|ఇవ్వాలి)/,
      /ఈ\s*పూజ\s*మాత్రమే\s*(కాపాడుతుంది|రక్షిస్తుంది)/,
    ],
  },
  {
    category: "harm",
    patterns: [
      // hi/mr — certain loss / certain failure / destroy your enemy
      /(निश्चित|पक्का|नक्की|खात्रीने)\s*(हानि|नुकसान|असफलता|अपयश)/,
      /(असफल|अपयशी)\s*(हो\s*जाएंगे|व्हाल)/,
      /(शत्रु|शत्रू|दुश्मन)\s*(का|चा)?\s*(नाश|विनाश)/,
      // te — certain loss / certain failure / destroy enemy
      /ఖచ్చితంగా\s*(నష్టం|వైఫల్యం)/,
      /తప్పకుండా\s*(విఫలం|ఓడిపోతారు)/,
      /శత్రువు\s*(ను)?\s*నాశనం/,
    ],
  },
];

/** Every bucket the validator walks — English first (cheapest, most mature). */
const ALL_BUCKETS: DenyBucket[] = [...DENY_LIST, ...INDIC_DENY_LIST];

/**
 * Validate a single step's user-visible text. Returns `{ passed: true }` for
 * calm devotional copy; `{ passed: false, category, matched }` on the first
 * prohibited match found across title + displayText + ttsText.
 */
export function validateContentSafety(input: SafetyInput): SafetyVerdict {
  const haystack = [input.title ?? "", input.displayText, input.ttsText ?? ""]
    .join("\n")
    .toLowerCase();
  for (const bucket of ALL_BUCKETS) {
    for (const pattern of bucket.patterns) {
      const m = pattern.exec(haystack);
      if (m) {
        return { passed: false, category: bucket.category, matched: m[0] };
      }
    }
  }
  return { passed: true };
}
