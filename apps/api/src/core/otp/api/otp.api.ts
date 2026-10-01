/**
 * Public facade for the OTP module.
 *
 * Currently empty on purpose — no other module consumes OTP internals yet.
 * When a real consumer appears (e.g. onboarding wanting to check if a phone
 * is verified without going through the JWT), add the method here, implement
 * it in `otp.api.impl.ts`, and register the key in
 * `shared/workspace/context.ts#GlobalServiceMap`.
 *
 * Keeping the facade type defined but empty means the layered shape is
 * consistent with the auth module (source of truth) and the arch gate
 * doesn't flag missing files.
 */
// `object` (not `{}`) is the linter-approved way to spell "any non-primitive
// object" and lets an empty class satisfy the type — see IOtpApi's usage in
// `otp.api.impl.ts`. When the first real facade method is added, replace
// this with a proper `interface IOtpApi { … }` and update the impl.
export type IOtpApi = object;
