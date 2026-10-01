import { FAILURE_SUB_CODE } from "@api/core/payment/failure-sub-code";
import { randomUUID } from "node:crypto";
import { createModuleLogger } from "@api/shared/logs";
import type {
  CreateMandateInput,
  CreateMandateResult,
  DebitStatusInput,
  MandateProvider,
  MandateStatusResult,
  PreDebitInput,
  PreDebitResult,
  PreDebitStatusInput,
  PreDebitStatusResult,
  PresentDebitInput,
  PresentDebitResult,
} from "@api/core/payment/mandate.provider.js";

const log = createModuleLogger("payment:stub-provider");

/**
 * In-memory mandate provider for local development, tests, and emulator runs.
 *
 * Mirrors `StubOtpProvider`: the same seam the real adapter implements, so the
 * entire flow — registration, approval, PDN, debit, entitlement — is
 * exercisable with no vendor credentials, no callback whitelisting, and no
 * real UPI app. That matters more here than for OTP: an Android emulator has
 * no GPay/PhonePe to approve a mandate with, so without this the payment path
 * would be untestable outside a physical device on stage.
 *
 * Auto-approval is the key affordance. `STUB_AUTO_APPROVE_MS` after
 * registration, `getMandateStatus` starts reporting `active` — standing in for
 * the user tapping approve. The client's existing poll-on-resume loop then
 * behaves exactly as it will against the real provider.
 *
 * Deliberately NOT persistent: state lives in a Map and dies with the process,
 * same as `StubOtpProvider`. A restart mid-flow reports `pending` forever,
 * which is the correct signal that this is not a production provider.
 */
export const STUB_AUTO_APPROVE_MS = 2_000;

/** Approval outcome, forced by a magic plan/amount for failure-path testing. */
type StubOutcome = "approve" | "reject" | "hang";

/**
 * How a presented debit settles, also forced by a magic amount.
 *
 * `sync_*` answers from `presentDebit` itself; `async_*` answers `pending` and
 * only reveals the outcome to `getDebitStatus` — which is what the real
 * provider does in the normal case, and therefore the branch that most needs
 * to be reachable in tests without a network.
 */
type StubDebitOutcome = "sync_success" | "async_success" | "async_failure";

interface StubMandate {
  referenceId: string;
  providerMandateId: string;
  createdAt: number;
  outcome: StubOutcome;
  revoked: boolean;
}

/** One presented debit, remembered so `getDebitStatus` answers consistently. */
interface StubDebit {
  outcome: StubDebitOutcome;
  providerTxnId: string;
  bankReferenceNumber: string;
  npciTransactionId: string;
}

export class StubMandateProvider implements MandateProvider {
  readonly name = "stub";

  /**
   * Mirrors Decentro's shape (`presentDebit` is the money-moving call) so the
   * integration suites exercise the branch a real gateway takes rather than a
   * stub-only special case.
   */
  readonly chargePhase = "submission" as const;

  /**
   * True so the deposit ledger path is exercised end to end in tests — the stub
   * is where "registration records the initial deposit" is asserted.
   */
  readonly supportsInitialDeposit = true;

  /** Mirrors the real gateways so window tests exercise the same band. */
  readonly pdnLeadHours = { min: 24, max: 48 } as const;

  /**
   * `null` — the stub reports its own instant, like Decentro. Local and e2e
   * runs must not sit out a synthetic turnaround before anything is presented:
   * the point of this adapter is that the whole flow completes in a sitting.
   */
  readonly presentationTatHours = null;


  /** Deterministic, like Cashfree's, so recovery tests have a key to match on. */
  debitRequestId(referenceId: string, cycleDate: Date): string {
    return `stub_pay_${referenceId}_${cycleDate.toISOString().slice(0, 10)}`;
  }

  private readonly mandates = new Map<string, StubMandate>();
  /** Cycles already presented, so a replay is visible in tests. */
  private readonly presented = new Map<string, StubDebit>();

  createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
    const providerMandateId = `stub_mandate_${randomUUID()}`;
    const outcome = outcomeFor(input.amountPaise);
    this.mandates.set(input.referenceId, {
      referenceId: input.referenceId,
      providerMandateId,
      createdAt: Date.now(),
      outcome,
      revoked: false,
    });

    // A `upi://` URI so the mobile launcher exercises its real code path,
    // including the Android package-visibility query. On an emulator with no
    // UPI app installed the launch fails, which is itself the case we want the
    // client to handle — and the poll loop still converges via auto-approval.
    const authUrl =
      `upi://mandate?pa=stub@prabhuji&pn=Prabhuji&am=` +
      `${(input.amountPaise / 100).toFixed(2)}&tr=${input.referenceId}&cu=INR`;

    log.info(
      {
        event: "stub_mandate_created",
        reference_id: input.referenceId,
        outcome,
        auto_approve_ms: STUB_AUTO_APPROVE_MS,
      },
      "stub mandate created — will auto-approve shortly"
    );

    return Promise.resolve({
      providerMandateId,
      providerTxnId: `stub_txn_${randomUUID()}`,
      authUrl,
      authExpiresAt: new Date(Date.now() + input.expiryMinutes * 60_000),
      state: "pending",
    });
  }

  getMandateStatus(input: {
    referenceId: string;
    providerMandateId: string | null;
  }): Promise<MandateStatusResult> {
    const held = this.mandates.get(input.referenceId);
    if (!held) {
      // Unknown reference — the process restarted, or this is a forged
      // callback. Either way: not active.
      return Promise.resolve(statusResult("failed", "unknown_reference"));
    }
    if (held.revoked) return Promise.resolve(statusResult("revoked", "revoked"));

    const elapsed = Date.now() - held.createdAt;
    if (elapsed < STUB_AUTO_APPROVE_MS) {
      return Promise.resolve(statusResult("pending", "awaiting_approval"));
    }
    if (held.outcome === "hang") {
      return Promise.resolve(statusResult("pending", "awaiting_approval"));
    }
    if (held.outcome === "reject") {
      return Promise.resolve(statusResult("rejected", "user_declined"));
    }

    return Promise.resolve({
      ...statusResult("active", null),
      providerMandateId: held.providerMandateId,
      payerHandleMasked: "st***@stubbank",
      payerNameMasked: "S*** U***",
      // NULL on purpose, matching a gateway that does not own the debit clock
      // (`is_managed_by_decentro: false` — our scheduler decides). It used to
      // echo the mandate's `start_date`, which now means the REGISTRATION day;
      // reporting that would overwrite the trial-aware `nextDebitDate` written
      // at registration with today, and `applyStatus` only skips null.
      nextDebitDate: null,
    });
  }

  notifyPreDebit(input: PreDebitInput): Promise<PreDebitResult> {
    return Promise.resolve({
      presentationSequenceId: stubSequenceId(input.referenceId, input.cycleDate),
      // SYNCHRONOUS, like Cashfree: the stub hands back an id immediately, so the
      // notification is addressable at once.
      //
      // Deliberately not modelling the asynchronous path here. A stub that
      // sometimes withheld the id would make every local run and every existing
      // integration test non-deterministic, and the asynchronous behaviour is
      // exercised where it belongs — against a faked Decentro client, in
      // decentro-mandate.repository.test.ts.
      status: "accepted",
      providerTxnId: `stub_txn_${randomUUID()}`,
    });
  }

  /** Nothing to poll: this stub's notify is synchronous. Echo what we were given. */
  getPreDebitStatus(input: PreDebitStatusInput): Promise<PreDebitStatusResult> {
    return Promise.resolve({
      status: input.presentationSequenceId ? "accepted" : "sent",
      presentationSequenceId: input.presentationSequenceId,
      failureCode: null,
      failureMessage: null,
      // No failure to classify on this path (TAM-186).
      failureSubCode: null,
    });
  }

  presentDebit(input: PresentDebitInput): Promise<PresentDebitResult> {
    const key = debitKey(input.referenceId, input.cycleDate);
    if (this.presented.has(key)) {
      // Should be unreachable — the (mandateId, cycleDate) constraint is
      // supposed to prevent it. Loud, because reaching this means the
      // idempotency guard upstream has a hole.
      log.error(
        { event: "stub_duplicate_presentation", reference_id: input.referenceId },
        "same cycle presented twice — upstream idempotency guard failed"
      );
    }

    const held = this.mandates.get(input.referenceId);
    if (!held || held.revoked) {
      // Not recorded: there is no debit in flight to read back later.
      return Promise.resolve({
        outcome: "failed",
        providerTxnId: null,
        bankReferenceNumber: null,
        npciTransactionId: null,
        failureCode: "MANDATE_NOT_ACTIVE",
        failureSubCode: FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED,
        failureMessage: "mandate is not active",
      });
    }

    const debit: StubDebit = {
      outcome: debitOutcomeFor(input.amountPaise),
      providerTxnId: `stub_txn_${randomUUID()}`,
      bankReferenceNumber: `stub_brn_${input.referenceId}`,
      npciTransactionId: `stub_npci_${randomUUID()}`,
    };
    this.presented.set(key, debit);

    // The async outcomes withhold the verdict here — the caller must read it
    // back through `getDebitStatus`, which is the real provider's normal path.
    if (debit.outcome !== "sync_success") {
      return Promise.resolve({
        outcome: "pending",
        providerTxnId: debit.providerTxnId,
        bankReferenceNumber: null,
        npciTransactionId: null,
        failureCode: null,
        failureMessage: null,
        // No failure to classify on this path (TAM-186).
        failureSubCode: null,
      });
    }

    return Promise.resolve(settledResult(debit));
  }

  getDebitStatus(input: DebitStatusInput): Promise<PresentDebitResult> {
    const debit = this.presented.get(
      debitKey(input.referenceId, input.cycleDate)
    );
    if (!debit) {
      // Nothing was ever presented under this key — the process restarted, or
      // the caller is asking about a debit that does not exist. `pending` is
      // the only safe answer: it settles nothing and costs one more poll.
      return Promise.resolve({
        outcome: "pending",
        providerTxnId: null,
        bankReferenceNumber: null,
        npciTransactionId: null,
        failureCode: null,
        failureMessage: null,
        // No failure to classify on this path (TAM-186).
        failureSubCode: null,
      });
    }
    return Promise.resolve(settledResult(debit));
  }

  revokeMandate(input: { referenceId: string }): Promise<void> {
    const held = this.mandates.get(input.referenceId);
    if (held) held.revoked = true;
    return Promise.resolve();
  }

  /** Test affordance: force approval without waiting out the delay. */
  approveNow(referenceId: string): void {
    const held = this.mandates.get(referenceId);
    if (held) held.createdAt = 0;
  }
}

/**
 * Magic amounts select a failure path, so the reject/hang branches are
 * reachable from the app without a code change. ₹299 (the real plan) always
 * approves.
 */
function outcomeFor(amountPaise: number): StubOutcome {
  if (amountPaise === 1_00) return "reject"; // ₹1
  if (amountPaise === 2_00) return "hang"; // ₹2
  return "approve";
}

/**
 * Magic amounts select how a debit settles. ₹299 (the real plan) settles
 * synchronously, which keeps the happy path fast for anyone driving the app by
 * hand; ₹3 and ₹4 reach the asynchronous branches.
 */
function debitOutcomeFor(amountPaise: number): StubDebitOutcome {
  if (amountPaise === 3_00) return "async_success"; // ₹3
  if (amountPaise === 4_00) return "async_failure"; // ₹4
  return "sync_success";
}

/** One presented debit's terminal answer, shared by both read paths. */
function settledResult(debit: StubDebit): PresentDebitResult {
  if (debit.outcome === "async_failure") {
    return {
      outcome: "failed",
      providerTxnId: debit.providerTxnId,
      bankReferenceNumber: null,
      npciTransactionId: null,
      failureCode: "INSUFFICIENT_FUNDS",
      failureMessage: "stub: insufficient balance",
      // The stub's decline models the real world's dominant one: 91% of
      // production declines are this (TAM-186).
      failureSubCode: FAILURE_SUB_CODE.INSUFFICIENT_FUNDS,
    };
  }
  return {
    outcome: "succeeded",
    providerTxnId: debit.providerTxnId,
    bankReferenceNumber: debit.bankReferenceNumber,
    npciTransactionId: debit.npciTransactionId,
    failureCode: null,
    failureMessage: null,
    // No failure to classify on this path (TAM-186).
    failureSubCode: null,
  };
}

/** Cycle dates are date-only, so the ISO string is a stable key. */
function debitKey(referenceId: string, cycleDate: Date): string {
  return `${referenceId}:${cycleDate.toISOString()}`;
}

/**
 * Deterministic per (reference, cycle), so `notifyPreDebit` and
 * `getPreDebitStatus` agree without the stub holding any state for it.
 */
function stubSequenceId(referenceId: string, cycleDate: Date): string {
  return `stub_seq_${referenceId}_${cycleDate.toISOString().slice(0, 10)}`;
}

function statusResult(
  state: MandateStatusResult["state"],
  reason: string | null
): MandateStatusResult {
  return {
    state,
    stateReason: reason,
    providerMandateId: null,
    providerTxnId: null,
    npciTransactionId: null,
    payerHandleMasked: null,
    payerNameMasked: null,
    nextDebitDate: null,
  };
}
