import { evaluateAbtest } from '@api/shared/abtest';
import { loadEnv } from '@api/shared/config';
import { createModuleLogger } from '@api/shared/logs';
import { decodeRotationCursor } from '@api/shared/pagination';

const log = createModuleLogger('rotation:deity-split-experiment');

/**
 * The abtesting **apiId** for the feed algorithm experiment (TAM-180).
 *
 * An apiId, not an experimentId — the same distinction `HOME_GRID_ABTEST_API_ID`
 * spells out: the apiId is OURS and stable, the console may run many
 * experiments against it over time, and naming one of them here would couple
 * a deploy to a console object.
 */
export const FEED_DEITY_SPLIT_ABTEST_API_ID = 'feed.deity_split';

/**
 * Which ordering a feed session gets.
 *
 * - `deity_split` — the TAM-175 weave: the user's two gods pulled into page
 *   one's slot map over the shared rotation.
 * - `rotation` — the pre-TAM-175 order: the shared rotation alone. Served by
 *   passing the weave an EMPTY pair, which is proven byte-identical to the
 *   unpersonalised feed (`docs/FEED-ROTATION.md`, rule 3) — there is no second
 *   code path.
 */
export type FeedAlgorithm = 'deity_split' | 'rotation';

export interface FeedAlgorithmDecision {
  algorithm: FeedAlgorithm;
  /**
   * What decided it, for the log line: the variant id when an experiment
   * answered, otherwise one of the fixed markers below. Never personal data.
   */
  arm: string;
  source: 'kill_switch' | 'experiment' | 'api_default' | 'outside' | 'fallback';
}

/** The console's payload key. A variant's config object is `{ deitySplit: boolean }`. */
const PAYLOAD_KEY = 'deitySplit';

/** The variant id the ladder reads as "old algorithm" when its payload says nothing. */
const CONTROL_VARIANT_ID = 'control';

const LIVE_FALLBACK: FeedAlgorithmDecision = {
  algorithm: 'deity_split',
  arm: 'fallback',
  source: 'fallback',
};

function readFlag(config: Record<string, unknown> | null): boolean | null {
  if (config === null || !(PAYLOAD_KEY in config)) return null;
  const value = config[PAYLOAD_KEY];
  return typeof value === 'boolean' ? value : null;
}

/**
 * Decide the feed algorithm for one user — the TAM-180 ladder, top to bottom:
 *
 * 1. `ENABLE_DEITY_SPLIT=false` ⇒ `rotation`, and the service is NOT called.
 *    The kill switch sits ABOVE the experiment so switching the feature off
 *    records no exposures.
 * 2. The service names a variant ⇒ its payload's `deitySplit` boolean. A
 *    payload without the key falls back to the variant's NAME: `control` is
 *    the old algorithm, anything else the new one — so a console experiment
 *    seeded with bare variants still behaves.
 * 3. `inExperiment: false` ⇒ the api default's `deitySplit` if it carries one,
 *    otherwise `rotation`. "Outside every bucket range" IS the old algorithm;
 *    that is the whole shape of this experiment.
 * 4. No answer (`evaluateAbtest` returned `null`: unconfigured, timeout, 5xx,
 *    fail-soft) ⇒ `deity_split`, today's live behaviour. A null means "no
 *    answer", not "outside the range" — degrading every user to the old feed
 *    because the platform service blinked would be a regression, and such
 *    users are not in the exposures table, so they never pollute the read.
 *
 * Never throws. Never sends an empty subject: the service would persist a
 * sticky assignment for `""`.
 */
export async function resolveFeedAlgorithm(
  userId: string,
): Promise<FeedAlgorithmDecision> {
  if (!loadEnv().ENABLE_DEITY_SPLIT) {
    return { algorithm: 'rotation', arm: 'off', source: 'kill_switch' };
  }
  if (userId.trim() === '') return LIVE_FALLBACK;

  const evaluation = await evaluateAbtest(
    userId,
    FEED_DEITY_SPLIT_ABTEST_API_ID,
  );
  if (evaluation === null) {
    log.warn(
      { api_id: FEED_DEITY_SPLIT_ABTEST_API_ID },
      'feed algorithm experiment unanswered; serving the live (deity_split) feed',
    );
    return LIVE_FALLBACK;
  }

  if (evaluation.inExperiment) {
    const flag = readFlag(evaluation.payload);
    const deitySplit = flag ?? evaluation.variantId !== CONTROL_VARIANT_ID;
    return {
      algorithm: deitySplit ? 'deity_split' : 'rotation',
      arm: evaluation.variantId,
      source: 'experiment',
    };
  }

  const defaultFlag = readFlag(evaluation.defaultConfig);
  if (defaultFlag !== null) {
    return {
      algorithm: defaultFlag ? 'deity_split' : 'rotation',
      arm: 'api_default',
      source: 'api_default',
    };
  }
  return { algorithm: 'rotation', arm: 'outside', source: 'outside' };
}

/**
 * Does this cursor already carry the deity pair its session was decided with?
 *
 * Absent, unreadable, or pre-TAM-175 (no `d1`) all read as "no", and the
 * session is decided afresh — the same restart-not-400 rule `rotationPage`
 * applies to an unreadable cursor. A cursor that DOES name the pair (a pinned
 * `null` included) is the whole reason a cursor page never re-evaluates: the
 * pair reproduces page one, and an arm cannot flip a session already open.
 */
export function cursorNamesPair(cursor: string | undefined): boolean {
  if (cursor === undefined) return false;
  const decoded = decodeRotationCursor(cursor);
  return decoded !== null && decoded.d1 !== undefined;
}

/** The TAM-180 fields of a feed log line; a cursor page reports what decided it. */
export function feedAlgorithmLogFields(
  decision: FeedAlgorithmDecision | null,
): {
  feed_algorithm: string;
  abtest_arm: string;
} {
  return decision === null
    ? { feed_algorithm: 'cursor', abtest_arm: 'cursor' }
    : { feed_algorithm: decision.algorithm, abtest_arm: decision.arm };
}
