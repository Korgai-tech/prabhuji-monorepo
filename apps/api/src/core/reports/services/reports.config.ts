/**
 * Reports module tunables.
 *
 * Plain exported constants rather than env vars, matching `core/otp`'s
 * `otp.config.ts`: these are product limits, not per-environment configuration,
 * and an env var would need an `EnvSchema` entry plus a Terraform apply per
 * environment to change.
 */

/** Max reports one account may file inside `REPORT_RATE_LIMIT_WINDOW_SECONDS`. */
export const REPORT_RATE_LIMIT_MAX = 5;

/** Rate-limit window. Generous enough for a genuine reporting spree of one screen. */
export const REPORT_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

/** Redis key namespace, following the `otp:send:*` / `otp:verify:*` convention. */
export const REPORT_RATE_LIMIT_KEY_PREFIX = "reports:create";
