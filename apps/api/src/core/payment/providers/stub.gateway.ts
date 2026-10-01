import { PROVIDER } from "@api/shared/config";
import type { CallbackKind } from "@api/core/payment/constants.js";
import type {
  CallbackAuthenticator,
  PaymentGateway,
} from "@api/core/payment/gateway.js";
import type { CallbackRef } from "@api/core/payment/types";
import { StubMandateProvider } from "@api/core/payment/repositories/stub-mandate.repository.js";

/**
 * The stub provider has no real webhooks — it auto-approves in-memory — so its
 * authenticator rejects everything and `callbackKindFor` never classifies.
 */
const rejectAllAuthenticator: CallbackAuthenticator = {
  authenticate: () => false,
};

/**
 * Stub gateway plug-in — in-memory provider for local dev, tests, and emulator
 * runs. The default `PAYMENT_PROVIDER`.
 */
export const stubGateway: PaymentGateway = {
  name: PROVIDER.STUB,

  createProvider: () => new StubMandateProvider(),

  createCallbackAuthenticator: () => rejectAllAuthenticator,

  // Never invoked (callbackKindFor returns null), but the seam requires it.
  extractRef: (kind: CallbackKind): CallbackRef => ({
    kind,
    referenceId: null,
    providerMandateId: null,
    presentationSequenceId: null,
    callbackTxnId: null,
    callbackAttempt: null,
    // The stub reports its own debit instant, so nothing is synthesised for
    // it and a delivery confirmation would have nothing to correct.
    notificationDeliveredAt: null,
  }),

  callbackKindFor: () => null,
};
