/** Default trailing quiet period before a dirty editor is checkpointed. */
export const DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS = 250;

/** Default maximum age of one continuously changing dirty interval. */
export const DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS = 2_000;

/** Maximum configurable delay, keeping accidental timers within a minute. */
export const MAX_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS = 60_000;

/** Maximum flush promises retained by one coordinator. */
export const MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS = 1_024;

/** Maximum independent status listeners retained by one coordinator. */
export const MAX_SESSION_CHECKPOINT_AUTOSAVE_STATUS_OBSERVERS = 64;

/** Maximum checkpoint size accepted at this orchestration boundary. */
export const MAX_SESSION_CHECKPOINT_AUTOSAVE_UTF8_BYTES = 16 * 1024 * 1024;

/** Minimal synchronous shape produced by the validated Wasm checkpoint reader. */
export type SessionCheckpointAutosaveCaptureResult =
  | Readonly<{
      ok: true;
      checkpoint: Readonly<{
        checkpointJson: string;
        checkpointUtf8Bytes: number;
      }>;
    }>
  | Readonly<{ ok: false; error?: Readonly<{ code: string }> }>;

/** Structural capture port; the concrete Wasm reader may carry extra fields. */
export interface SessionCheckpointAutosaveCapturePort {
  read(): SessionCheckpointAutosaveCaptureResult | undefined;
}

/** Minimal CAS outcome; the concrete IndexedDB store may carry extra fields. */
export type SessionCheckpointAutosaveSaveResult<TToken> =
  | Readonly<{ ok: true; token: TToken }>
  | Readonly<{ ok: false; error?: Readonly<{ code: string }> }>;

/** Structural store port used without exposing IndexedDB to the coordinator. */
export interface SessionCheckpointAutosaveSavePort<TToken> {
  save(
    expectedToken: TToken,
    checkpointJson: string,
  ): PromiseLike<SessionCheckpointAutosaveSaveResult<TToken>>;
}

/** Injectable monotonic timer boundary for deterministic hosts and tests. */
export interface SessionCheckpointAutosaveScheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

/** Construction policy for one autosave coordinator. */
export interface SessionCheckpointAutosaveOptions {
  readonly delayMs?: number;
  readonly maxLatencyMs?: number;
  readonly scheduler?: SessionCheckpointAutosaveScheduler;
}

/** Payload-free reason why automatic persistence is paused. */
export type SessionCheckpointAutosaveFailureCode =
  | "session_checkpoint_autosave.capture_failed"
  | "session_checkpoint_autosave.capture_invalid"
  | "session_checkpoint_autosave.save_failed"
  | "session_checkpoint_autosave.save_invalid"
  | "session_checkpoint_autosave.scheduler_failed";

/** Immutable, payload-redacted failure safe to expose to application UI. */
export interface SessionCheckpointAutosaveFailure {
  readonly code: SessionCheckpointAutosaveFailureCode;
  /** Stable payload-free code copied from the failing capture/store port. */
  readonly causeCode?: string;
}

/** Notification-only listener for coalesced immutable lifecycle snapshots. */
export type SessionCheckpointAutosaveStatusObserver = (
  status: SessionCheckpointAutosaveStatus,
) => unknown;

/** Observable lifecycle. A paused coordinator remains dirty until retry. */
export type SessionCheckpointAutosaveStatus =
  | Readonly<{ phase: "idle"; dirty: false }>
  | Readonly<{ phase: "scheduled"; dirty: true }>
  | Readonly<{ phase: "saving"; dirty: true }>
  | Readonly<{
      phase: "paused";
      dirty: true;
      failure: SessionCheckpointAutosaveFailure;
    }>
  | Readonly<{ phase: "disposed"; dirty: boolean }>;

/** Settlement of one flush target, never containing checkpoint or storage data. */
export type SessionCheckpointAutosaveFlushResult =
  | Readonly<{ status: "committed" }>
  | Readonly<{
      status: "failed";
      failure: SessionCheckpointAutosaveFailure;
    }>
  | Readonly<{ status: "disposed" }>
  | Readonly<{ status: "rejected"; reason: "capacity" }>;

interface FlushWaiter {
  readonly targetEpoch: bigint;
  readonly resolve: (result: SessionCheckpointAutosaveFlushResult) => void;
}

interface ActiveAttempt {
  readonly id: bigint;
  readonly targetEpoch: bigint;
}

interface CapturedCheckpoint {
  readonly checkpointJson: string;
}

interface PortFailure {
  readonly kind: "failure";
  readonly causeCode?: string;
}

interface StatusObserverRegistration {
  readonly observer: SessionCheckpointAutosaveStatusObserver;
  deliveredRevision: bigint | undefined;
}

const CAPTURE_FAILED: SessionCheckpointAutosaveFailure = Object.freeze({
  code: "session_checkpoint_autosave.capture_failed",
});
const CAPTURE_INVALID: SessionCheckpointAutosaveFailure = Object.freeze({
  code: "session_checkpoint_autosave.capture_invalid",
});
const SAVE_FAILED: SessionCheckpointAutosaveFailure = Object.freeze({
  code: "session_checkpoint_autosave.save_failed",
});
const SAVE_INVALID: SessionCheckpointAutosaveFailure = Object.freeze({
  code: "session_checkpoint_autosave.save_invalid",
});
const SCHEDULER_FAILED: SessionCheckpointAutosaveFailure = Object.freeze({
  code: "session_checkpoint_autosave.scheduler_failed",
});

const COMMITTED: SessionCheckpointAutosaveFlushResult = Object.freeze({
  status: "committed",
});
const DISPOSED: SessionCheckpointAutosaveFlushResult = Object.freeze({
  status: "disposed",
});
const CAPACITY_REJECTED: SessionCheckpointAutosaveFlushResult = Object.freeze({
  status: "rejected",
  reason: "capacity",
});
const NO_TIMER = Symbol("breditor.session-checkpoint-autosave.no-timer");
const UTF8_ENCODER = new TextEncoder();
const STATUS_PROMISE = Promise.resolve();
const STATUS_PROMISE_THEN = Promise.prototype.then;

const DEFAULT_SCHEDULER: SessionCheckpointAutosaveScheduler = Object.freeze({
  now: (): number => {
    const performance = globalThis.performance;
    return performance === undefined ? Date.now() : performance.now();
  },
  schedule: (callback: () => void, delayMs: number): number =>
    globalThis.setTimeout(callback, delayMs),
  cancel: (handle: unknown): void => {
    globalThis.clearTimeout(handle as number);
  },
});

/**
 * Coordinates bounded, trailing-edge session checkpoint persistence.
 *
 * The adapter core-commit observer performs no capture or I/O: it only advances
 * a private dirty epoch and arms one timer. Capture happens at the instant an
 * attempt starts. At most one CAS save is active, edits arriving during that
 * save are coalesced into the next attempt, and every failure pauses automatic
 * work while retaining dirtiness. `retry()` is the only way to resume a paused
 * instance. A flush promise belongs to the epoch visible at its call and is
 * settled only when that epoch commits, the coordinator pauses, or is disposed.
 */
export class BreditorSessionCheckpointAutosave<TToken> {
  readonly #capture: () => unknown;
  readonly #save: (token: TToken, checkpointJson: string) => unknown;
  readonly #now: () => unknown;
  readonly #schedule: (callback: () => void, delayMs: number) => unknown;
  readonly #cancel: (handle: unknown) => unknown;
  readonly #delayMs: number;
  readonly #maxLatencyMs: number;
  readonly #commitObserver = (_commit: unknown): void => {
    this.#markDirty();
  };
  readonly #flushWaiters: FlushWaiter[] = [];
  readonly #statusObservers = new Map<symbol, StatusObserverRegistration>();

  #token: TToken;
  #phase: SessionCheckpointAutosaveStatus["phase"] = "idle";
  #failure: SessionCheckpointAutosaveFailure | undefined;
  #dirtyEpoch = 0n;
  #committedEpoch = 0n;
  #nextAttemptId = 1n;
  #attempt: ActiveAttempt | undefined;
  #storageDispatchedAttemptId: bigint | undefined;
  #firstDirtyAt: number | undefined;
  #lastDirtyAt: number | undefined;
  #lastClockValue = 0;
  #timingFaultDuringSave = false;
  #timerHandle: unknown | typeof NO_TIMER = NO_TIMER;
  #timerGeneration = 0;
  #installingTimer = false;
  #timerFiredDuringInstall = false;
  #schedulerCallDepth = 0;
  #drainingDeferredCancellations = false;
  #statusRevision = 0n;
  #statusFingerprint = "idle:false";
  #statusNotificationScheduled = false;
  readonly #deferredCancellations: unknown[] = [];

  constructor(
    capturePort: SessionCheckpointAutosaveCapturePort,
    savePort: SessionCheckpointAutosaveSavePort<TToken>,
    initialToken: TToken,
    options: SessionCheckpointAutosaveOptions = {},
  ) {
    const capture = readCallable(capturePort, "read");
    const save = readCallable(savePort, "save");
    const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    const now = readCallable(scheduler, "now");
    const schedule = readCallable(scheduler, "schedule");
    const cancel = readCallable(scheduler, "cancel");

    const delayMs = options.delayMs ?? DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS;
    const maxLatencyMs =
      options.maxLatencyMs ?? DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS;
    requireDelay(delayMs, "autosave delay");
    requireDelay(maxLatencyMs, "autosave maximum latency");
    if (maxLatencyMs < delayMs) {
      throw new RangeError("autosave maximum latency must cover its delay");
    }

    this.#capture = () => Reflect.apply(capture, capturePort, []) as unknown;
    this.#save = (token, checkpointJson) =>
      Reflect.apply(save, savePort, [token, checkpointJson]) as unknown;
    this.#now = () => Reflect.apply(now, scheduler, []) as unknown;
    this.#schedule = (callback, delay) =>
      Reflect.apply(schedule, scheduler, [callback, delay]) as unknown;
    this.#cancel = (handle) => Reflect.apply(cancel, scheduler, [handle]) as unknown;
    this.#token = initialToken;
    this.#delayMs = delayMs;
    this.#maxLatencyMs = maxLatencyMs;
  }

  /** Stable listener to register directly with the adapter's core-commit feed. */
  get commitObserver(): (_commit: unknown) => void {
    return this.#commitObserver;
  }

  /**
   * Observes coalesced lifecycle snapshots on a microtask after transitions.
   *
   * Registration queues the current state. Listener throws and rejected
   * thenables are contained; listeners must make retry/conflict decisions
   * explicitly rather than automatically looping on a paused notification.
   */
  observeStatus(observer: SessionCheckpointAutosaveStatusObserver): () => void {
    if (typeof observer !== "function") {
      throw new TypeError("session checkpoint autosave status observer must be callable");
    }
    if (this.#phase === "disposed") {
      throw new TypeError("session checkpoint autosave is disposed");
    }
    if (
      this.#statusObservers.size >=
      MAX_SESSION_CHECKPOINT_AUTOSAVE_STATUS_OBSERVERS
    ) {
      throw new RangeError("session checkpoint autosave status observer capacity is exhausted");
    }
    const token = Symbol("breditor.session-checkpoint-autosave.status-observer");
    this.#statusObservers.set(token, {
      observer,
      deliveredRevision: undefined,
    });
    this.#queueStatusNotification();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#statusObservers.delete(token);
    };
  }

  /** Current immutable, payload-redacted state. */
  getStatus(): SessionCheckpointAutosaveStatus {
    const dirty = this.#dirtyEpoch > this.#committedEpoch;
    switch (this.#phase) {
      case "idle":
        return Object.freeze({ phase: "idle", dirty: false });
      case "scheduled":
        return Object.freeze({ phase: "scheduled", dirty: true });
      case "saving":
        return Object.freeze({ phase: "saving", dirty: true });
      case "paused":
        return Object.freeze({
          phase: "paused",
          dirty: true,
          failure: this.#failure ?? SCHEDULER_FAILED,
        });
      case "disposed":
        return Object.freeze({ phase: "disposed", dirty });
    }
  }

  /** Marks one new semantic command epoch without synchronously checkpointing. */
  markDirty(): void {
    this.#markDirty();
  }

  /**
   * Forces the current dirty epoch toward storage and waits for its outcome.
   *
   * A flush never resumes a paused coordinator; use `retry()` after inspecting
   * its redacted failure status. Calls made while clean resolve immediately.
   */
  flush(): Promise<SessionCheckpointAutosaveFlushResult> {
    return this.#flush(false);
  }

  /** Explicitly resumes paused persistence and immediately targets all dirtiness. */
  retry(): Promise<SessionCheckpointAutosaveFlushResult> {
    return this.#flush(true);
  }

  /**
   * Permanently stops timers and future work.
   *
   * IndexedDB work already submitted cannot be recalled. Its eventual promise
   * is consumed but ignored, and outstanding flushes settle as `disposed`.
   */
  dispose(): void {
    this.#dispose();
  }

  #markDirty(): void {
    if (this.#phase === "disposed") return;
    this.#dirtyEpoch += 1n;
    if (this.#schedulerCallDepth > 0) {
      this.#failSchedulerReentry();
      return;
    }
    if (this.#phase === "paused") return;

    const now = this.#readClock();
    if (this.#isStopped()) return;
    if (now === undefined) {
      if (this.#phase === "saving") {
        this.#timingFaultDuringSave = true;
      } else {
        this.#pause(SCHEDULER_FAILED);
      }
      return;
    }
    this.#firstDirtyAt ??= now;
    this.#lastDirtyAt = now;

    if (this.#phase === "saving") return;
    this.#scheduleDirty();
  }

  #flush(resume: boolean): Promise<SessionCheckpointAutosaveFlushResult> {
    if (this.#phase === "disposed") return Promise.resolve(DISPOSED);
    if (this.#dirtyEpoch <= this.#committedEpoch) return Promise.resolve(COMMITTED);
    if (this.#schedulerCallDepth > 0) {
      this.#failSchedulerReentry();
      return Promise.resolve(failedFlush(SCHEDULER_FAILED));
    }
    if (this.#phase === "paused" && !resume) {
      return Promise.resolve(failedFlush(this.#failure ?? SCHEDULER_FAILED));
    }
    if (this.#flushWaiters.length >= MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS) {
      return Promise.resolve(CAPACITY_REJECTED);
    }

    const targetEpoch = this.#dirtyEpoch;
    const promise = new Promise<SessionCheckpointAutosaveFlushResult>((resolve) => {
      this.#flushWaiters.push({ targetEpoch, resolve });
    });

    if (this.#phase === "paused") {
      this.#failure = undefined;
      this.#phase = "scheduled";
    }
    if (this.#phase !== "saving") this.#startSave();
    return promise;
  }

  #startSave(): void {
    if (
      this.#phase === "disposed" ||
      this.#phase === "paused" ||
      this.#attempt !== undefined ||
      this.#dirtyEpoch <= this.#committedEpoch
    ) {
      return;
    }

    const attempt: ActiveAttempt = Object.freeze({
      id: this.#nextAttemptId,
      targetEpoch: this.#dirtyEpoch,
    });
    this.#nextAttemptId += 1n;
    this.#attempt = attempt;
    this.#storageDispatchedAttemptId = undefined;
    this.#timingFaultDuringSave = false;
    this.#phase = "saving";
    this.#queueStatusTransition();
    this.#cancelTimer();
    if (!this.#attemptIsCurrent(attempt)) return;

    let rawCapture: unknown;
    try {
      rawCapture = this.#capture();
    } catch {
      this.#failAttempt(attempt, CAPTURE_FAILED);
      return;
    }
    if (!this.#attemptIsCurrent(attempt)) {
      containAsyncRejection(rawCapture);
      return;
    }
    // The Wasm adapter deliberately reports `undefined` while composition or
    // another exclusive engine lease owns capture. That is expected backpressure,
    // not data loss: retain every flush target and try again after one quiet delay.
    if (rawCapture === undefined) {
      this.#deferUnavailableCapture(attempt);
      return;
    }
    if (objectLike(rawCapture) && containThenable(rawCapture)) {
      this.#failAttempt(attempt, CAPTURE_INVALID);
      return;
    }

    const captured = snapshotCapture(rawCapture);
    if (!this.#attemptIsCurrent(attempt)) {
      containAsyncRejection(rawCapture);
      return;
    }
    if (captured !== undefined && "kind" in captured) {
      this.#failAttempt(
        attempt,
        failureWithCause(CAPTURE_FAILED, captured.causeCode),
      );
      return;
    }
    if (captured === undefined) {
      containAsyncRejection(rawCapture);
      this.#failAttempt(attempt, CAPTURE_INVALID);
      return;
    }

    let rawSave: unknown;
    // Once the storage boundary is entered, a transaction may have escaped
    // even if hostile synchronous code reenters us. Preserve this attempt
    // until its promise settles so a committed successor token is not lost.
    this.#storageDispatchedAttemptId = attempt.id;
    try {
      rawSave = this.#save(this.#token, captured.checkpointJson);
    } catch {
      this.#failAttempt(attempt, SAVE_FAILED);
      return;
    }
    if (!this.#attemptIsCurrent(attempt)) {
      containAsyncRejection(rawSave);
      return;
    }

    // A fresh native Promise contains hostile thenables and guarantees that the
    // rejection branch is installed. Both callbacks trap every internal edge,
    // so no storage rejection can become an unhandled application rejection.
    const contained = new Promise<unknown>((resolve) => {
      resolve(rawSave);
    });
    void contained.then(
      (value) => {
        try {
          this.#settleSave(attempt, value);
        } catch {
          this.#failAttempt(attempt, SAVE_INVALID);
        }
      },
      () => {
        try {
          this.#failAttempt(attempt, SAVE_FAILED);
        } catch {
          this.#failAttempt(attempt, SAVE_INVALID);
        }
      },
    );
  }

  #settleSave(attempt: ActiveAttempt, rawResult: unknown): void {
    if (!this.#attemptIsCurrent(attempt)) return;
    const result = snapshotSaveResult<TToken>(rawResult);
    if (!this.#attemptIsCurrent(attempt)) return;
    if (result !== undefined && "kind" in result) {
      this.#failAttempt(
        attempt,
        failureWithCause(SAVE_FAILED, result.causeCode),
      );
      return;
    }
    if (result === undefined) {
      this.#failAttempt(attempt, SAVE_INVALID);
      return;
    }

    this.#token = result.token;
    this.#committedEpoch = attempt.targetEpoch;
    this.#attempt = undefined;
    this.#storageDispatchedAttemptId = undefined;
    this.#failure = undefined;
    this.#resolveCommittedWaiters();

    if (this.#dirtyEpoch <= this.#committedEpoch) {
      this.#phase = "idle";
      this.#resetDirtyTiming();
      this.#queueStatusTransition();
      return;
    }
    if (this.#timingFaultDuringSave) {
      this.#timingFaultDuringSave = false;
      this.#pause(SCHEDULER_FAILED);
      return;
    }

    this.#phase = "scheduled";
    if (this.#hasForcedTarget()) {
      this.#startSave();
      return;
    }
    if (this.#firstDirtyAt === undefined || this.#lastDirtyAt === undefined) {
      const now = this.#readClock();
      if (this.#phase !== "scheduled") return;
      if (now === undefined) {
        this.#pause(SCHEDULER_FAILED);
        return;
      }
      this.#firstDirtyAt = now;
      this.#lastDirtyAt = now;
    }
    this.#scheduleDirty();
  }

  #scheduleDirty(): void {
    if (
      this.#phase === "disposed" ||
      this.#phase === "paused" ||
      this.#phase === "saving" ||
      this.#dirtyEpoch <= this.#committedEpoch
    ) {
      return;
    }
    const first = this.#firstDirtyAt;
    const last = this.#lastDirtyAt;
    if (first === undefined || last === undefined) {
      this.#pause(SCHEDULER_FAILED);
      return;
    }
    const deadline = Math.min(last + this.#delayMs, first + this.#maxLatencyMs);
    this.#phase = "scheduled";
    this.#armTimer(deadline);
  }

  #deferUnavailableCapture(attempt: ActiveAttempt): void {
    if (!this.#attemptIsCurrent(attempt)) return;
    this.#attempt = undefined;
    this.#phase = "scheduled";
    const now = this.#readClock();
    if (this.#phase !== "scheduled") return;
    if (now === undefined) {
      this.#pause(SCHEDULER_FAILED);
      return;
    }
    // Do not reuse an already-expired maximum-latency deadline: doing so would
    // create a zero-delay polling loop for a long native composition.
    this.#armTimer(now + Math.max(1, this.#delayMs));
  }

  #armTimer(deadline: number): void {
    this.#cancelTimer();
    if (this.#phase !== "scheduled") return;
    const now = this.#readClock();
    if (this.#phase !== "scheduled") return;
    if (now === undefined) {
      this.#pause(SCHEDULER_FAILED);
      return;
    }
    const delay = Math.max(0, Math.ceil(deadline - now));
    const generation = this.#timerGeneration + 1;
    this.#timerGeneration = generation;
    this.#installingTimer = true;
    this.#timerFiredDuringInstall = false;

    let handle: unknown;
    try {
      const invocation = this.#invokeScheduler(() =>
        this.#schedule(() => this.#timerFired(generation), delay),
      );
      handle = invocation.value;
      if (invocation.thenable) {
        this.#installingTimer = false;
        this.#safeCancel(handle);
        this.#pause(SCHEDULER_FAILED);
        return;
      }
    } catch {
      this.#installingTimer = false;
      this.#pause(SCHEDULER_FAILED);
      return;
    }
    this.#installingTimer = false;
    if (generation !== this.#timerGeneration) {
      // A hostile scheduler reentered while installing. The newer logical
      // timer owns the generation; discard this superseded physical handle.
      this.#safeCancel(handle);
      return;
    }
    if (this.#timerFiredDuringInstall || this.#phase !== "scheduled") {
      this.#safeCancel(handle);
      this.#pause(SCHEDULER_FAILED);
      return;
    }
    this.#timerHandle = handle;
    this.#phase = "scheduled";
    this.#queueStatusTransition();
  }

  #timerFired(generation: number): void {
    if (generation !== this.#timerGeneration || this.#phase === "disposed") return;
    if (this.#installingTimer) {
      this.#timerFiredDuringInstall = true;
      return;
    }
    if (this.#timerHandle === NO_TIMER || this.#phase !== "scheduled") return;
    this.#timerHandle = NO_TIMER;
    this.#timerGeneration += 1;
    this.#startSave();
  }

  #cancelTimer(): void {
    if (this.#timerHandle === NO_TIMER) return;
    const handle = this.#timerHandle;
    this.#timerHandle = NO_TIMER;
    this.#timerGeneration += 1;
    this.#safeCancel(handle);
  }

  #safeCancel(handle: unknown): void {
    try {
      this.#invokeScheduler(() => this.#cancel(handle));
    } catch {
      // Generation invalidation makes a late callback inert even if host
      // cancellation fails, so timer cleanup failure is not semantic failure.
    }
  }

  #readClock(): number | undefined {
    let raw: unknown;
    try {
      const invocation = this.#invokeScheduler(() => this.#now());
      if (invocation.thenable) return undefined;
      raw = invocation.value;
    } catch {
      return undefined;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return undefined;
    }
    this.#lastClockValue = Math.max(this.#lastClockValue, raw);
    return this.#lastClockValue;
  }

  #failAttempt(
    attempt: ActiveAttempt,
    failure: SessionCheckpointAutosaveFailure,
  ): void {
    if (!this.#attemptIsCurrent(attempt)) return;
    this.#attempt = undefined;
    this.#storageDispatchedAttemptId = undefined;
    this.#pause(failure);
  }

  #pause(failure: SessionCheckpointAutosaveFailure): void {
    if (this.#phase === "disposed") return;
    this.#attempt = undefined;
    this.#storageDispatchedAttemptId = undefined;
    this.#timingFaultDuringSave = false;
    this.#phase = "paused";
    this.#failure = failure;
    this.#resolveAllWaiters(failedFlush(failure));
    this.#cancelTimer();
    this.#queueStatusTransition();
  }

  #attemptIsCurrent(attempt: ActiveAttempt): boolean {
    return this.#phase === "saving" && this.#attempt?.id === attempt.id;
  }

  #hasForcedTarget(): boolean {
    return this.#flushWaiters.some(
      (waiter) => waiter.targetEpoch > this.#committedEpoch,
    );
  }

  #resolveCommittedWaiters(): void {
    const pending: FlushWaiter[] = [];
    const committed: FlushWaiter[] = [];
    for (const waiter of this.#flushWaiters) {
      (waiter.targetEpoch <= this.#committedEpoch ? committed : pending).push(
        waiter,
      );
    }
    this.#flushWaiters.splice(0, this.#flushWaiters.length, ...pending);
    for (const waiter of committed) waiter.resolve(COMMITTED);
  }

  #resolveAllWaiters(result: SessionCheckpointAutosaveFlushResult): void {
    const waiters = this.#flushWaiters.splice(0, this.#flushWaiters.length);
    for (const waiter of waiters) waiter.resolve(result);
  }

  #resetDirtyTiming(): void {
    this.#firstDirtyAt = undefined;
    this.#lastDirtyAt = undefined;
    this.#timingFaultDuringSave = false;
  }

  #dispose(): void {
    if (this.#phase === "disposed") return;
    this.#attempt = undefined;
    this.#storageDispatchedAttemptId = undefined;
    this.#timingFaultDuringSave = false;
    this.#phase = "disposed";
    this.#failure = undefined;
    this.#resolveAllWaiters(DISPOSED);
    this.#cancelTimer();
    this.#queueStatusTransition();
  }

  /**
   * Scheduler implementations are untrusted synchronous boundaries. Reentry
   * through one of their methods is failed closed so it cannot recursively arm
   * timers, start a second CAS attempt, or revive a paused/disposed transition.
   */
  #failSchedulerReentry(): void {
    if (this.#phase === "disposed") return;
    if (
      this.#phase === "saving" &&
      this.#attempt !== undefined &&
      this.#storageDispatchedAttemptId === this.#attempt.id
    ) {
      this.#timingFaultDuringSave = true;
      return;
    }
    this.#attempt = undefined;
    this.#storageDispatchedAttemptId = undefined;
    this.#phase = "paused";
    this.#failure = SCHEDULER_FAILED;
    this.#resolveAllWaiters(failedFlush(SCHEDULER_FAILED));
    const handle = this.#detachTimer();
    if (handle !== NO_TIMER) this.#deferredCancellations.push(handle);
    this.#queueStatusTransition();
  }

  #invokeScheduler(
    callback: () => unknown,
  ): Readonly<{ value: unknown; thenable: boolean }> {
    this.#schedulerCallDepth += 1;
    try {
      const value = callback();
      return Object.freeze({
        value,
        thenable: objectLike(value) && containThenable(value),
      });
    } finally {
      this.#schedulerCallDepth -= 1;
      if (this.#schedulerCallDepth === 0) this.#drainDeferredCancellations();
    }
  }

  #drainDeferredCancellations(): void {
    if (this.#drainingDeferredCancellations) return;
    this.#drainingDeferredCancellations = true;
    try {
      for (;;) {
        if (this.#deferredCancellations.length === 0) return;
        const [handle] = this.#deferredCancellations.splice(0, 1);
        this.#schedulerCallDepth += 1;
        try {
          const returned = this.#cancel(handle);
          if (objectLike(returned)) containThenable(returned);
        } catch {
          // Logical generation invalidation already made the callback inert.
        } finally {
          this.#schedulerCallDepth -= 1;
        }
      }
    } finally {
      this.#drainingDeferredCancellations = false;
    }
  }

  #detachTimer(): unknown | typeof NO_TIMER {
    if (this.#timerHandle === NO_TIMER) return NO_TIMER;
    const handle = this.#timerHandle;
    this.#timerHandle = NO_TIMER;
    this.#timerGeneration += 1;
    return handle;
  }

  #queueStatusNotification(): void {
    if (this.#statusNotificationScheduled || this.#statusObservers.size === 0) return;
    this.#statusNotificationScheduled = true;
    Reflect.apply(STATUS_PROMISE_THEN, STATUS_PROMISE, [() => {
      this.#deliverStatusNotification();
    }]);
  }

  #queueStatusTransition(): void {
    const fingerprint = statusFingerprint(this.getStatus());
    if (fingerprint === this.#statusFingerprint) return;
    this.#statusFingerprint = fingerprint;
    this.#statusRevision += 1n;
    this.#queueStatusNotification();
  }

  #deliverStatusNotification(): void {
    this.#statusNotificationScheduled = false;
    const status = this.getStatus();
    const revision = this.#statusRevision;
    const observers = Array.from(this.#statusObservers.entries());
    for (const [token, registration] of observers) {
      if (
        registration.deliveredRevision === revision ||
        this.#statusObservers.get(token) !== registration
      ) {
        continue;
      }
      registration.deliveredRevision = revision;
      try {
        containAsyncRejection(registration.observer(status));
      } catch {
        // Status notification is observational and cannot affect persistence.
      }
    }
    if (status.phase === "disposed") this.#statusObservers.clear();
  }

  #isStopped(): boolean {
    return this.#phase === "disposed" || this.#phase === "paused";
  }
}

function statusFingerprint(status: SessionCheckpointAutosaveStatus): string {
  switch (status.phase) {
    case "paused":
      return `${status.phase}:${status.dirty}:${status.failure.code}:${status.failure.causeCode ?? ""}`;
    case "disposed":
      return `${status.phase}:${status.dirty}`;
    case "idle":
    case "scheduled":
    case "saving":
      return `${status.phase}:${status.dirty}`;
  }
}

function requireDelay(value: number, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS
  ) {
    throw new RangeError(`${label} is outside its fixed bounds`);
  }
}

function readCallable(object: unknown, key: string): (...args: never[]) => unknown {
  let candidate: unknown;
  try {
    if ((typeof object !== "object" && typeof object !== "function") || object === null) {
      throw new TypeError();
    }
    candidate = Reflect.get(object, key);
  } catch {
    throw new TypeError(`session checkpoint autosave ${key} port is invalid`);
  }
  if (typeof candidate !== "function") {
    throw new TypeError(`session checkpoint autosave ${key} port is invalid`);
  }
  return candidate as (...args: never[]) => unknown;
}

function snapshotCapture(
  value: unknown,
): CapturedCheckpoint | PortFailure | undefined {
  const ok = ownData(value, "ok");
  if (!ok.present) return undefined;
  if (ok.value === false) return portFailure(value);
  if (ok.value !== true) return undefined;

  const checkpointField = ownData(value, "checkpoint");
  if (!checkpointField.present) return undefined;
  if (
    objectLike(checkpointField.value) &&
    containThenable(checkpointField.value)
  ) {
    return undefined;
  }
  const jsonField = ownData(checkpointField.value, "checkpointJson");
  const byteField = ownData(checkpointField.value, "checkpointUtf8Bytes");
  if (
    !jsonField.present ||
    typeof jsonField.value !== "string" ||
    jsonField.value.length === 0 ||
    jsonField.value.length > MAX_SESSION_CHECKPOINT_AUTOSAVE_UTF8_BYTES ||
    !byteField.present ||
    typeof byteField.value !== "number" ||
    !Number.isSafeInteger(byteField.value) ||
    byteField.value < 1 ||
    byteField.value > MAX_SESSION_CHECKPOINT_AUTOSAVE_UTF8_BYTES
  ) {
    return undefined;
  }
  const actualUtf8Bytes = exactUtf8ByteLength(jsonField.value);
  if (actualUtf8Bytes === undefined || actualUtf8Bytes !== byteField.value) {
    return undefined;
  }
  return Object.freeze({ checkpointJson: jsonField.value });
}

function exactUtf8ByteLength(value: string): number | undefined {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) return undefined;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return undefined;
    }
  }
  try {
    return UTF8_ENCODER.encode(value).byteLength;
  } catch {
    return undefined;
  }
}

function snapshotSaveResult<TToken>(
  value: unknown,
): Readonly<{ token: TToken }> | PortFailure | undefined {
  const ok = ownData(value, "ok");
  if (!ok.present) return undefined;
  if (ok.value === false) return portFailure(value);
  if (ok.value !== true) return undefined;
  const token = ownData(value, "token");
  if (!token.present) return undefined;
  if (objectLike(token.value) && containThenable(token.value)) return undefined;
  return Object.freeze({ token: token.value as TToken });
}

function portFailure(value: unknown): PortFailure {
  const errorField = ownData(value, "error");
  if (!errorField.present) return Object.freeze({ kind: "failure" });
  if (objectLike(errorField.value) && containThenable(errorField.value)) {
    return Object.freeze({ kind: "failure" });
  }
  const codeField = ownData(errorField.value, "code");
  return codeField.present &&
    typeof codeField.value === "string" &&
    stableFailureCode(codeField.value)
    ? Object.freeze({ kind: "failure", causeCode: codeField.value })
    : Object.freeze({ kind: "failure" });
}

function failureWithCause(
  failure: SessionCheckpointAutosaveFailure,
  causeCode: string | undefined,
): SessionCheckpointAutosaveFailure {
  return causeCode === undefined
    ? failure
    : Object.freeze({ code: failure.code, causeCode });
}

function stableFailureCode(value: string): boolean {
  return (
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?$/u.test(value)
  );
}

function ownData(
  object: unknown,
  key: string,
): Readonly<{ present: true; value: unknown }> | Readonly<{ present: false }> {
  try {
    if ((typeof object !== "object" && typeof object !== "function") || object === null) {
      return Object.freeze({ present: false });
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return Object.freeze({ present: false });
    }
    return Object.freeze({ present: true, value: descriptor.value });
  } catch {
    return Object.freeze({ present: false });
  }
}

function containAsyncRejection(value: unknown): void {
  if (objectLike(value)) containThenable(value);
}

function containThenable(value: object): boolean {
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  try {
    const contained = new Promise<unknown>((resolve) => resolve(value));
    void contained.then(
      () => undefined,
      () => undefined,
    );
  } catch {
    // Hostile thenable inspection is itself contained.
  }
  return true;
}

function objectLike(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  );
}

function failedFlush(
  failure: SessionCheckpointAutosaveFailure,
): SessionCheckpointAutosaveFlushResult {
  return Object.freeze({ status: "failed", failure });
}
