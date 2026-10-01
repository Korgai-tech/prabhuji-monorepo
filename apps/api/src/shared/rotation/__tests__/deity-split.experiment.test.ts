import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@api/shared/config';
import { encodeRotationCursor } from '@api/shared/pagination';
import {
  cursorNamesPair,
  FEED_DEITY_SPLIT_ABTEST_API_ID,
  resolveFeedAlgorithm,
} from '../deity-split.experiment.js';

/**
 * The TAM-180 ladder, exercised through the REAL abtest client: env configures
 * it and a stubbed global `fetch` plays the service, so what is asserted here
 * is the resolution ORDER and what each rung answers — mirroring the TAM-173
 * blocks in `chat.service.test.ts` / `home.service.test.ts`.
 */

const ORIGINAL_ENV = { ...process.env };

const baseEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'a-sufficiently-long-secret',
  MEDIA_BUCKET: 'test-bucket',
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.test',
  ABTEST_BASE_URL: 'https://platform.example.test/abtesting',
  ABTEST_TENANT_KEY: 'prabhuji.keyid.secret',
  ENABLE_DEITY_SPLIT: 'true',
};

const SUBJECT = '019f5f4c-793c-7358-aec3-f7941d852db6';

/** A `fetch` that answers with `body` and records every call. */
const answer = (body: unknown, status = 200): ReturnType<typeof vi.fn> => {
  const spy = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...baseEnv };
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  resetEnvCache();
});

describe('resolveFeedAlgorithm', () => {
  it('asks the service about the feed api id with the user as subject', async () => {
    const spy = answer({ inExperiment: false, bucket: 12 });
    await resolveFeedAlgorithm(SUBJECT);
    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      subjectId: SUBJECT,
      apiId: FEED_DEITY_SPLIT_ABTEST_API_ID,
    });
  });

  describe('the kill switch sits above the experiment', () => {
    it('ENABLE_DEITY_SPLIT=false ⇒ rotation, and the service is never called', async () => {
      process.env.ENABLE_DEITY_SPLIT = 'false';
      resetEnvCache();
      const spy = answer({
        inExperiment: true,
        bucket: 700,
        variant: { id: 'treatment' },
      });

      const decision = await resolveFeedAlgorithm(SUBJECT);

      expect(decision).toEqual({
        algorithm: 'rotation',
        arm: 'off',
        source: 'kill_switch',
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('a variant answers', () => {
    it('payload deitySplit:true ⇒ deity_split, arm = the variant id', async () => {
      answer({
        inExperiment: true,
        bucket: 700,
        variant: { id: 'treatment', payload: { deitySplit: true } },
      });
      expect(await resolveFeedAlgorithm(SUBJECT)).toEqual({
        algorithm: 'deity_split',
        arm: 'treatment',
        source: 'experiment',
      });
    });

    it('payload deitySplit:false ⇒ rotation', async () => {
      answer({
        inExperiment: true,
        bucket: 100,
        variant: { id: 'control', payload: { deitySplit: false } },
      });
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        algorithm: 'rotation',
        arm: 'control',
        source: 'experiment',
      });
    });

    // The console always sends a payload OBJECT (possibly empty) for a variant;
    // one with no payload at all is the shared client's "unexpected shape".
    it('empty payload: a variant named control ⇒ rotation, anything else ⇒ deity_split', async () => {
      answer({
        inExperiment: true,
        bucket: 100,
        variant: { id: 'control', payload: {} },
      });
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        algorithm: 'rotation',
      });

      answer({
        inExperiment: true,
        bucket: 700,
        variant: { id: 'split_v1', payload: {} },
      });
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        algorithm: 'deity_split',
        arm: 'split_v1',
      });
    });

    it('a non-boolean deitySplit is ignored, not trusted', async () => {
      answer({
        inExperiment: true,
        bucket: 100,
        variant: { id: 'control', payload: { deitySplit: 'yes' } },
      });
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        algorithm: 'rotation',
      });
    });
  });

  describe('outside every experiment', () => {
    it('with no api default ⇒ rotation (the old algorithm is the default)', async () => {
      answer({ inExperiment: false, bucket: 12 });
      expect(await resolveFeedAlgorithm(SUBJECT)).toEqual({
        algorithm: 'rotation',
        arm: 'outside',
        source: 'outside',
      });
    });

    it('with an api default deitySplit:true ⇒ deity_split', async () => {
      answer({
        inExperiment: false,
        bucket: 12,
        defaultConfig: { deitySplit: true },
      });
      expect(await resolveFeedAlgorithm(SUBJECT)).toEqual({
        algorithm: 'deity_split',
        arm: 'api_default',
        source: 'api_default',
      });
    });

    it('with an api default that says nothing about the feed ⇒ rotation', async () => {
      answer({ inExperiment: false, bucket: 12, defaultConfig: { other: 1 } });
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        algorithm: 'rotation',
      });
    });
  });

  describe("no answer ⇒ today's live behaviour (deity_split), never a degraded feed", () => {
    it('service unconfigured', async () => {
      process.env.ABTEST_BASE_URL = '';
      process.env.ABTEST_TENANT_KEY = '';
      resetEnvCache();
      const spy = answer({ inExperiment: false, bucket: 12 });

      expect(await resolveFeedAlgorithm(SUBJECT)).toEqual({
        algorithm: 'deity_split',
        arm: 'fallback',
        source: 'fallback',
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('service 5xx', async () => {
      answer({ error: 'boom' }, 503);
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        source: 'fallback',
      });
    });

    it('service fail-soft (bucket -1)', async () => {
      answer({ inExperiment: false, bucket: -1 });
      expect(await resolveFeedAlgorithm(SUBJECT)).toMatchObject({
        source: 'fallback',
      });
    });
  });

  it('an empty subject never reaches the service', async () => {
    const spy = answer({
      inExperiment: true,
      bucket: 700,
      variant: { id: 'treatment' },
    });
    expect(await resolveFeedAlgorithm('  ')).toMatchObject({
      source: 'fallback',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('cursorNamesPair', () => {
  it("absent, unreadable, and pre-TAM-175 cursors all read as 'decide afresh'", () => {
    expect(cursorNamesPair(undefined)).toBe(false);
    expect(cursorNamesPair('@@bad@@')).toBe(false);
    expect(cursorNamesPair(encodeRotationCursor({ epoch: 1, offset: 2 }))).toBe(
      false,
    );
  });

  it('a pinned pair — null included — is a named pair', () => {
    expect(
      cursorNamesPair(
        encodeRotationCursor({ epoch: 1, offset: 2, d1: 'shiva', d2: null }),
      ),
    ).toBe(true);
    expect(
      cursorNamesPair(
        encodeRotationCursor({ epoch: 1, offset: 2, d1: null, d2: null }),
      ),
    ).toBe(true);
  });
});
