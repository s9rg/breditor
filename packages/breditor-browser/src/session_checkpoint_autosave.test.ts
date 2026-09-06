import { describe, expect, it, vi } from "vitest";

import {
  BreditorSessionCheckpointAutosave,
  DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
  DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS,
  MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS,
  MAX_SESSION_CHECKPOINT_AUTOSAVE_STATUS_OBSERVERS,
  type SessionCheckpointAutosaveCapturePort,
  type SessionCheckpointAutosaveCaptureResult,
  type SessionCheckpointAutosaveSavePort,
  type SessionCheckpointAutosaveSaveResult,
  type SessionCheckpointAutosaveScheduler,
} from "./session_checkpoint_autosave.js";

interface Token {
  readonly generation: number;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

interface ScheduledTask {
  readonly id: number;
  readonly due: number;
  readonly callback: () => void;
}

class ManualScheduler implements SessionCheckpointAutosaveScheduler {
  time = 0;
  nextId = 1;
  readonly tasks = new Map<number, ScheduledTask>();
  readonly delays: number[] = [];

  now(): number {
    return this.time;
  }

  schedule(callback: () => void, delayMs: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.delays.push(delayMs);
    this.tasks.set(id, { id, due: this.time + delayMs, callback });
    return id;
  }

  cancel(handle: unknown): void {
    if (typeof handle === "number") this.tasks.delete(handle);
  }

  advance(milliseconds: number): void {
    this.time += milliseconds;
    for (;;) {
      const ready = [...this.tasks.values()]
        .filter((task) => task.due <= this.time)
        .sort((left, right) => left.due - right.due || left.id - right.id)[0];
      if (ready === undefined) return;
      this.tasks.delete(ready.id);
      ready.callback();
    }
  }
}

class SequenceCapture implements SessionCheckpointAutosaveCapturePort {
  calls = 0;

  constructor(
    readonly values: Array<
      | SessionCheckpointAutosaveCaptureResult
      | undefined
      | (() => SessionCheckpointAutosaveCaptureResult | undefined)
    >,
  ) {}

  read(): SessionCheckpointAutosaveCaptureResult | undefined {
    this.calls += 1;
    const value = this.values.shift();
    return typeof value === "function" ? value() : value;
  }
}

class ControlledSavePort implements SessionCheckpointAutosaveSavePort<Token> {
  readonly calls: Array<Readonly<{ token: Token; checkpointJson: string }>> = [];
  readonly pending: Array<Deferred<SessionCheckpointAutosaveSaveResult<Token>>> = [];

  save(
    token: Token,
    checkpointJson: string,
  ): Promise<SessionCheckpointAutosaveSaveResult<Token>> {
    this.calls.push({ token, checkpointJson });
    const pending = deferred<SessionCheckpointAutosaveSaveResult<Token>>();
    this.pending.push(pending);
    return pending.promise;
  }
}

function token(generation: number): Token {
  return Object.freeze({ generation });
}

function checkpoint(
  checkpointJson: string,
): SessionCheckpointAutosaveCaptureResult {
  return Object.freeze({
    ok: true,
    checkpoint: Object.freeze({
      checkpointJson,
      checkpointUtf8Bytes: new TextEncoder().encode(checkpointJson).byteLength,
    }),
  });
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  if (resolvePromise === undefined || rejectPromise === undefined) {
    throw new Error("deferred fixture did not initialize");
  }
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function drainMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function coordinator(
  capture: SessionCheckpointAutosaveCapturePort,
  save: SessionCheckpointAutosaveSavePort<Token>,
  scheduler = new ManualScheduler(),
): Readonly<{
  autosave: BreditorSessionCheckpointAutosave<Token>;
  scheduler: ManualScheduler;
}> {
  return {
    autosave: new BreditorSessionCheckpointAutosave(capture, save, token(0), {
      scheduler,
    }),
    scheduler,
  };
}

describe("BreditorSessionCheckpointAutosave", () => {
  it("uses one trailing timer and captures only when that timer fires", () => {
    const capture = new SequenceCapture([checkpoint('{"revision":1}')]);
    const save = new ControlledSavePort();
    const { autosave, scheduler } = coordinator(capture, save);
    const observer = autosave.commitObserver;

    expect(autosave.commitObserver).toBe(observer);
    expect(() =>
      observer(
        new Proxy(
          {},
          {
            get: () => {
              throw new Error("delivery payload must not be inspected");
            },
          },
        ),
      ),
    ).not.toThrow();
    expect(capture.calls).toBe(0);
    expect(save.calls).toHaveLength(0);
    expect(scheduler.tasks.size).toBe(1);
    expect(autosave.getStatus()).toEqual({ phase: "scheduled", dirty: true });

    scheduler.advance(DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS - 1);
    expect(capture.calls).toBe(0);
    scheduler.advance(1);

    expect(capture.calls).toBe(1);
    expect(save.calls).toEqual([
      { token: token(0), checkpointJson: '{"revision":1}' },
    ]);
    expect(autosave.getStatus()).toEqual({ phase: "saving", dirty: true });
  });

  it("resets the trailing edge but enforces maximum latency", () => {
    const capture = new SequenceCapture([checkpoint("{}")]);
    const save = new ControlledSavePort();
    const { autosave, scheduler } = coordinator(capture, save);

    autosave.commitObserver(undefined);
    for (let elapsed = 200; elapsed < DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS; elapsed += 200) {
      scheduler.advance(200);
      expect(capture.calls).toBe(0);
      autosave.commitObserver(undefined);
      expect(scheduler.tasks.size).toBe(1);
    }
    scheduler.advance(200);

    expect(scheduler.time).toBe(DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS);
    expect(capture.calls).toBe(1);
    expect(save.calls).toHaveLength(1);
  });

  it("coalesces edits during one save and gives each flush its exact epoch", async () => {
    const capture = new SequenceCapture([
      checkpoint('{"revision":1}'),
      checkpoint('{"revision":2}'),
    ]);
    const save = new ControlledSavePort();
    const { autosave } = coordinator(capture, save);

    autosave.markDirty();
    const firstFlush = autosave.flush();
    expect(save.calls).toHaveLength(1);

    autosave.markDirty();
    const secondFlush = autosave.flush();
    expect(save.calls).toHaveLength(1);

    save.pending[0]?.resolve({ ok: true, token: token(1) });
    await drainMicrotasks();

    await expect(firstFlush).resolves.toEqual({ status: "committed" });
    expect(save.calls).toEqual([
      { token: token(0), checkpointJson: '{"revision":1}' },
      { token: token(1), checkpointJson: '{"revision":2}' },
    ]);
    expect(autosave.getStatus()).toEqual({ phase: "saving", dirty: true });

    save.pending[1]?.resolve({ ok: true, token: token(2) });
    await drainMicrotasks();
    await expect(secondFlush).resolves.toEqual({ status: "committed" });
    expect(autosave.getStatus()).toEqual({ phase: "idle", dirty: false });
  });

  it("reports background persistence failure with its stable cause code", async () => {
    const capture = new SequenceCapture([checkpoint("{}")]);
    const save = new ControlledSavePort();
    const { autosave, scheduler } = coordinator(capture, save);
    const statuses: unknown[] = [];
    const sibling = vi.fn((status: unknown) => {
      statuses.push(status);
    });
    autosave.observeStatus(() => {
      throw new Error("observer failure is contained");
    });
    autosave.observeStatus(() => Promise.reject(new Error("rejection is contained")));
    autosave.observeStatus(sibling);

    autosave.markDirty();
    scheduler.advance(DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS);
    save.pending[0]?.resolve({
      ok: false,
      error: { code: "session_checkpoint.quota" },
    });
    await drainMicrotasks();

    expect(statuses.filter(
      (status) => (status as { phase?: unknown }).phase === "paused",
    )).toEqual([
      {
        phase: "paused",
        dirty: true,
        failure: {
          code: "session_checkpoint_autosave.save_failed",
          causeCode: "session_checkpoint.quota",
        },
      },
    ]);
    expect(sibling).toHaveBeenCalled();
    autosave.dispose();
    await drainMicrotasks();
    expect(statuses.at(-1)).toEqual({ phase: "disposed", dirty: true });
  });

  it("bounds status observers and releases registrations idempotently", async () => {
    const { autosave } = coordinator(
      new SequenceCapture([checkpoint("{}")]),
      new ControlledSavePort(),
    );
    const releases = Array.from(
      { length: MAX_SESSION_CHECKPOINT_AUTOSAVE_STATUS_OBSERVERS },
      () => autosave.observeStatus(() => undefined),
    );

    expect(() => autosave.observeStatus(() => undefined)).toThrow(RangeError);
    releases[0]?.();
    releases[0]?.();
    expect(() => autosave.observeStatus(() => undefined)).not.toThrow();
    autosave.dispose();
    await drainMicrotasks();
    expect(() => autosave.observeStatus(() => undefined)).toThrow(/disposed/u);
  });

  it("delivers the current status only to each newly registered observer", async () => {
    const { autosave } = coordinator(
      new SequenceCapture([checkpoint("{}")]),
      new ControlledSavePort(),
    );
    const first = vi.fn();
    const second = vi.fn();

    autosave.observeStatus(first);
    await drainMicrotasks();
    expect(first).toHaveBeenCalledTimes(1);

    autosave.observeStatus(second);
    await drainMicrotasks();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    autosave.markDirty();
    await drainMicrotasks();
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("publishes a sampled transition and then disposal when an observer disposes", async () => {
    const { autosave } = coordinator(
      new SequenceCapture([checkpoint("{}")]),
      new ControlledSavePort(),
    );
    const first: string[] = [];
    const sibling: string[] = [];
    autosave.observeStatus((status) => {
      first.push(status.phase);
      if (status.phase === "scheduled") autosave.dispose();
    });
    autosave.observeStatus((status) => {
      sibling.push(status.phase);
    });
    await drainMicrotasks();

    autosave.markDirty();
    await drainMicrotasks();

    expect(first).toEqual(["idle", "scheduled", "disposed"]);
    expect(sibling).toEqual(["idle", "scheduled", "disposed"]);
  });

  it("defers an expected unavailable capture without failing or losing flushes", async () => {
    const capture = new SequenceCapture([undefined, checkpoint('{"ready":true}')]);
    const save = new ControlledSavePort();
    const { autosave, scheduler } = coordinator(capture, save);

    autosave.markDirty();
    const flush = autosave.flush();
    expect(capture.calls).toBe(1);
    expect(save.calls).toHaveLength(0);
    expect(autosave.getStatus()).toEqual({ phase: "scheduled", dirty: true });
    expect(scheduler.tasks.size).toBe(1);

    scheduler.advance(DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS);
    expect(capture.calls).toBe(2);
    expect(save.calls).toHaveLength(1);
    save.pending[0]?.resolve({ ok: true, token: token(1) });
    await drainMicrotasks();

    await expect(flush).resolves.toEqual({ status: "committed" });
    expect(autosave.getStatus()).toEqual({ phase: "idle", dirty: false });
  });

  it("pauses on capture and save failures, retains dirtiness, and retries explicitly", async () => {
    const capture = new SequenceCapture([
      Object.freeze({ ok: false }),
      checkpoint('{"retry":1}'),
      checkpoint('{"retry":2}'),
    ]);
    const save = new ControlledSavePort();
    const { autosave } = coordinator(capture, save);

    autosave.markDirty();
    await expect(autosave.flush()).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.capture_failed" },
    });
    expect(autosave.getStatus()).toEqual({
      phase: "paused",
      dirty: true,
      failure: { code: "session_checkpoint_autosave.capture_failed" },
    });
    await expect(autosave.flush()).resolves.toMatchObject({ status: "failed" });

    const firstRetry = autosave.retry();
    save.pending[0]?.reject(new Error("redacted database failure"));
    await drainMicrotasks();
    await expect(firstRetry).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.save_failed" },
    });
    expect(autosave.getStatus()).toMatchObject({
      phase: "paused",
      dirty: true,
    });

    const secondRetry = autosave.retry();
    save.pending[1]?.resolve({ ok: true, token: token(1) });
    await drainMicrotasks();
    await expect(secondRetry).resolves.toEqual({ status: "committed" });
    expect(autosave.getStatus()).toEqual({ phase: "idle", dirty: false });
  });

  it("requires exact well-formed UTF-8 accounting before storage", async () => {
    const invalidCount = Object.freeze({
      ok: true as const,
      checkpoint: Object.freeze({
        checkpointJson: '{"emoji":"😀"}',
        checkpointUtf8Bytes: 14,
      }),
    });
    const loneSurrogate = Object.freeze({
      ok: true as const,
      checkpoint: Object.freeze({
        checkpointJson: "\ud800",
        checkpointUtf8Bytes: 3,
      }),
    });
    const capture = new SequenceCapture([invalidCount, loneSurrogate]);
    const save = new ControlledSavePort();
    const { autosave } = coordinator(capture, save);

    autosave.markDirty();
    await expect(autosave.flush()).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.capture_invalid" },
    });
    expect(save.calls).toHaveLength(0);

    await expect(autosave.retry()).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.capture_invalid" },
    });
    expect(save.calls).toHaveLength(0);
  });

  it("rejects and contains thenable capture impostors before storage", async () => {
    const rejected = Promise.reject(new Error("private capture rejection"));
    Object.defineProperties(rejected, {
      ok: { value: true },
      checkpoint: {
        value: {
          checkpointJson: "{}",
          checkpointUtf8Bytes: 2,
        },
      },
    });
    const throwingThen = Object.freeze({
      ok: true,
      checkpoint: Object.freeze({
        checkpointJson: "{}",
        checkpointUtf8Bytes: 2,
      }),
      get then(): never {
        throw new Error("private then getter");
      },
    });
    const nestedRejected = Promise.reject(new Error("private nested rejection"));
    Object.defineProperties(nestedRejected, {
      checkpointJson: { value: "{}" },
      checkpointUtf8Bytes: { value: 2 },
    });
    const values: unknown[] = [
      rejected,
      throwingThen,
      Object.freeze({ ok: true, checkpoint: nestedRejected }),
    ];
    const capture: SessionCheckpointAutosaveCapturePort = {
      read: () => values.shift() as SessionCheckpointAutosaveCaptureResult,
    };
    const save = new ControlledSavePort();
    const { autosave } = coordinator(capture, save);

    autosave.markDirty();
    await expect(autosave.flush()).resolves.toMatchObject({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.capture_invalid" },
    });
    await expect(autosave.retry()).resolves.toMatchObject({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.capture_invalid" },
    });
    await expect(autosave.retry()).resolves.toMatchObject({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.capture_invalid" },
    });
    expect(save.calls).toHaveLength(0);
    await drainMicrotasks();
  });

  it("fails closed on malformed save success and contains thrown schedulers", async () => {
    const capture = new SequenceCapture([checkpoint("{}")]);
    const malformedSave: SessionCheckpointAutosaveSavePort<Token> = {
      save: async () =>
        Object.create(null, {
          ok: { value: true },
          token: { get: () => token(1) },
        }) as SessionCheckpointAutosaveSaveResult<Token>,
    };
    const first = coordinator(capture, malformedSave).autosave;
    first.markDirty();
    await expect(first.flush()).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.save_invalid" },
    });

    const throwingScheduler: SessionCheckpointAutosaveScheduler = {
      now: () => 0,
      schedule: () => {
        throw new Error("scheduler payload must be redacted");
      },
      cancel: () => undefined,
    };
    const second = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("{}")]),
      new ControlledSavePort(),
      token(0),
      { scheduler: throwingScheduler },
    );
    expect(() => second.commitObserver(undefined)).not.toThrow();
    expect(second.getStatus()).toEqual({
      phase: "paused",
      dirty: true,
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });
  });

  it("rejects and contains a thenable successor-token impostor", async () => {
    const rejectedToken = Promise.reject(new Error("private token rejection"));
    const save: SessionCheckpointAutosaveSavePort<Token> = {
      save: async () => ({
        ok: true,
        token: rejectedToken as unknown as Token,
      }),
    };
    const autosave = coordinator(
      new SequenceCapture([checkpoint("{}")]),
      save,
    ).autosave;

    autosave.markDirty();
    await expect(autosave.flush()).resolves.toMatchObject({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.save_invalid" },
    });
    await drainMicrotasks();
  });

  it("bounds flush retention and disposes timers and in-flight work deterministically", async () => {
    const capture = new SequenceCapture([checkpoint("{}")]);
    const save = new ControlledSavePort();
    const { autosave, scheduler } = coordinator(capture, save);
    autosave.markDirty();

    const pending = Array.from(
      { length: MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS },
      () => autosave.flush(),
    );
    await expect(autosave.flush()).resolves.toEqual({
      status: "rejected",
      reason: "capacity",
    });
    expect(save.calls).toHaveLength(1);

    autosave.dispose();
    autosave.dispose();
    expect(scheduler.tasks.size).toBe(0);
    expect(autosave.getStatus()).toEqual({ phase: "disposed", dirty: true });
    await expect(Promise.all(pending)).resolves.toEqual(
      Array.from({ length: pending.length }, () => ({ status: "disposed" })),
    );
    await expect(autosave.flush()).resolves.toEqual({ status: "disposed" });

    save.pending[0]?.reject(new Error("late rejection must be consumed"));
    await drainMicrotasks();
    expect(autosave.getStatus()).toEqual({ phase: "disposed", dirty: true });
    autosave.commitObserver(undefined);
    expect(capture.calls).toBe(1);
  });

  it("cannot be resurrected or dispatch storage through reentrant result inspection", async () => {
    const captureSave = new ControlledSavePort();
    let captureAutosave: BreditorSessionCheckpointAutosave<Token>;
    const reentrantCapture: SessionCheckpointAutosaveCapturePort = {
      read: () =>
        new Proxy(checkpoint("{}"), {
          getOwnPropertyDescriptor(target, property) {
            captureAutosave.dispose();
            return Reflect.getOwnPropertyDescriptor(target, property);
          },
        }),
    };
    captureAutosave = coordinator(reentrantCapture, captureSave).autosave;
    captureAutosave.markDirty();
    await expect(captureAutosave.flush()).resolves.toEqual({ status: "disposed" });
    expect(captureSave.calls).toHaveLength(0);
    expect(captureAutosave.getStatus()).toEqual({ phase: "disposed", dirty: true });

    let saveAutosave: BreditorSessionCheckpointAutosave<Token>;
    const reentrantSave: SessionCheckpointAutosaveSavePort<Token> = {
      save: async () =>
        new Proxy(
          Object.freeze({ ok: true as const, token: token(1) }),
          {
            getOwnPropertyDescriptor(target, property) {
              saveAutosave.dispose();
              return Reflect.getOwnPropertyDescriptor(target, property);
            },
          },
        ),
    };
    saveAutosave = coordinator(
      new SequenceCapture([checkpoint("{}")]),
      reentrantSave,
    ).autosave;
    saveAutosave.markDirty();
    const saveFlush = saveAutosave.flush();
    await drainMicrotasks();
    await expect(saveFlush).resolves.toEqual({ status: "disposed" });
    expect(saveAutosave.getStatus()).toEqual({ phase: "disposed", dirty: true });
  });

  it("keeps queue, timer, and promise callbacks behind private methods", async () => {
    class ShadowingAutosave extends BreditorSessionCheckpointAutosave<Token> {
      override markDirty(): never {
        throw new Error("public markDirty must not receive queue authority");
      }

      override flush(): never {
        throw new Error("public flush must not receive timer authority");
      }

      override retry(): never {
        throw new Error("public retry must not receive promise authority");
      }
    }

    const capture = new SequenceCapture([checkpoint("{}")]);
    const save = new ControlledSavePort();
    const scheduler = new ManualScheduler();
    const autosave = new ShadowingAutosave(capture, save, token(0), { scheduler });
    Object.defineProperty(autosave, "markDirty", {
      value: () => {
        throw new Error("own shadow must not receive queue authority");
      },
    });

    expect(() => autosave.commitObserver(undefined)).not.toThrow();
    scheduler.advance(DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS);
    expect(save.calls).toHaveLength(1);
    save.pending[0]?.resolve({ ok: true, token: token(1) });
    await drainMicrotasks();
    expect(autosave.getStatus()).toEqual({ phase: "idle", dirty: false });
  });

  it("fails closed when scheduler cancellation reenters flush", async () => {
    let autosave: BreditorSessionCheckpointAutosave<Token>;
    let nestedFlush: Promise<unknown> | undefined;
    let reentered = false;
    const save = new ControlledSavePort();
    const scheduler: SessionCheckpointAutosaveScheduler = {
      now: () => 0,
      schedule: () => 7,
      cancel: () => {
        if (!reentered) {
          reentered = true;
          nestedFlush = autosave.flush();
        }
      },
    };
    autosave = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("x")]),
      save,
      token(0),
      { scheduler },
    );

    autosave.markDirty();
    const flush = autosave.flush();

    await expect(flush).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });
    await expect(nestedFlush).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });
    expect(save.calls).toHaveLength(0);
    expect(autosave.getStatus()).toEqual({
      phase: "paused",
      dirty: true,
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });
  });

  it("settles a dispatched save before pausing scheduler reentry and retries with its token", async () => {
    let autosave: BreditorSessionCheckpointAutosave<Token>;
    let reenterClock = false;
    let reentered = false;
    let nestedFlush: Promise<unknown> | undefined;
    const scheduler: SessionCheckpointAutosaveScheduler = {
      now: () => {
        if (reenterClock && !reentered) {
          reentered = true;
          nestedFlush = autosave.flush();
        }
        return 0;
      },
      schedule: () => 1,
      cancel: () => undefined,
    };
    const capture = new SequenceCapture([
      checkpoint('{"revision":1}'),
      checkpoint('{"revision":2}'),
    ]);
    const save = new ControlledSavePort();
    autosave = new BreditorSessionCheckpointAutosave(
      capture,
      save,
      token(0),
      { scheduler },
    );

    autosave.markDirty();
    const firstFlush = autosave.flush();
    expect(save.calls).toEqual([
      { token: token(0), checkpointJson: '{"revision":1}' },
    ]);

    reenterClock = true;
    autosave.markDirty();
    if (nestedFlush === undefined) throw new Error("clock did not reenter flush");
    await expect(nestedFlush).resolves.toEqual({
      status: "failed",
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });
    expect(autosave.getStatus()).toEqual({ phase: "saving", dirty: true });

    save.pending[0]?.resolve({ ok: true, token: token(1) });
    await drainMicrotasks();
    await expect(firstFlush).resolves.toEqual({ status: "committed" });
    expect(autosave.getStatus()).toEqual({
      phase: "paused",
      dirty: true,
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });

    const retry = autosave.retry();
    expect(save.calls).toEqual([
      { token: token(0), checkpointJson: '{"revision":1}' },
      { token: token(1), checkpointJson: '{"revision":2}' },
    ]);
    save.pending[1]?.resolve({ ok: true, token: token(2) });
    await drainMicrotasks();
    await expect(retry).resolves.toEqual({ status: "committed" });
    expect(autosave.getStatus()).toEqual({ phase: "idle", dirty: false });
  });

  it("does not carry a failed attempt's timing fault into its retry", async () => {
    let autosave: BreditorSessionCheckpointAutosave<Token>;
    let reenterClock = false;
    let reentered = false;
    const scheduler = new ManualScheduler();
    const originalNow = scheduler.now.bind(scheduler);
    scheduler.now = () => {
      if (reenterClock && !reentered) {
        reentered = true;
        void autosave.flush();
      }
      return originalNow();
    };
    const capture = new SequenceCapture([
      checkpoint('{"revision":1}'),
      checkpoint('{"revision":2}'),
      checkpoint('{"revision":3}'),
    ]);
    const save = new ControlledSavePort();
    autosave = new BreditorSessionCheckpointAutosave(
      capture,
      save,
      token(0),
      { scheduler },
    );

    autosave.markDirty();
    const firstFlush = autosave.flush();
    reenterClock = true;
    autosave.markDirty();
    save.pending[0]?.resolve({ ok: false });
    await drainMicrotasks();
    await expect(firstFlush).resolves.toMatchObject({ status: "failed" });
    expect(autosave.getStatus()).toMatchObject({ phase: "paused" });

    reenterClock = false;
    const retry = autosave.retry();
    expect(save.calls[1]).toEqual({
      token: token(0),
      checkpointJson: '{"revision":2}',
    });
    autosave.markDirty();
    save.pending[1]?.resolve({ ok: true, token: token(1) });
    await drainMicrotasks();

    await expect(retry).resolves.toEqual({ status: "committed" });
    expect(autosave.getStatus()).toEqual({ phase: "scheduled", dirty: true });
    scheduler.advance(DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS);
    expect(save.calls[2]).toEqual({
      token: token(1),
      checkpointJson: '{"revision":3}',
    });
    save.pending[2]?.resolve({ ok: true, token: token(2) });
    await drainMicrotasks();
    expect(autosave.getStatus()).toEqual({ phase: "idle", dirty: false });
  });

  it("fails closed when scheduler clock or installation reenters public state", () => {
    let clockAutosave: BreditorSessionCheckpointAutosave<Token>;
    let clockReentered = false;
    const clockSchedule = vi.fn();
    const clockScheduler: SessionCheckpointAutosaveScheduler = {
      now: () => {
        if (!clockReentered) {
          clockReentered = true;
          clockAutosave.markDirty();
        }
        return 0;
      },
      schedule: clockSchedule,
      cancel: vi.fn(),
    };
    clockAutosave = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("x")]),
      new ControlledSavePort(),
      token(0),
      { scheduler: clockScheduler },
    );

    clockAutosave.markDirty();

    expect(clockSchedule).not.toHaveBeenCalled();
    expect(clockAutosave.getStatus()).toEqual({
      phase: "paused",
      dirty: true,
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });

    let scheduleAutosave: BreditorSessionCheckpointAutosave<Token>;
    const cancel = vi.fn();
    const scheduleScheduler: SessionCheckpointAutosaveScheduler = {
      now: () => 0,
      schedule: () => {
        scheduleAutosave.dispose();
        return 9;
      },
      cancel,
    };
    scheduleAutosave = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("x")]),
      new ControlledSavePort(),
      token(0),
      { scheduler: scheduleScheduler },
    );

    scheduleAutosave.markDirty();

    expect(scheduleAutosave.getStatus()).toEqual({
      phase: "disposed",
      dirty: true,
    });
    expect(cancel).toHaveBeenCalledWith(9);
  });

  it("contains rejected thenables returned by every scheduler method", async () => {
    const nowAutosave = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("x")]),
      new ControlledSavePort(),
      token(0),
      {
        scheduler: {
          now: (() => Promise.reject(new Error("private now rejection"))) as never,
          schedule: () => 1,
          cancel: () => undefined,
        },
      },
    );
    nowAutosave.markDirty();
    expect(nowAutosave.getStatus()).toMatchObject({
      phase: "paused",
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });

    const scheduleAutosave = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("x")]),
      new ControlledSavePort(),
      token(0),
      {
        scheduler: {
          now: () => 0,
          schedule: (() =>
            Promise.reject(new Error("private schedule rejection"))) as never,
          cancel: () => undefined,
        },
      },
    );
    scheduleAutosave.markDirty();
    expect(scheduleAutosave.getStatus()).toMatchObject({
      phase: "paused",
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });

    const cancelAutosave = new BreditorSessionCheckpointAutosave(
      new SequenceCapture([checkpoint("x")]),
      new ControlledSavePort(),
      token(0),
      {
        scheduler: {
          now: () => 0,
          schedule: () => 1,
          cancel: (() =>
            Promise.reject(new Error("private cancel rejection"))) as never,
        },
      },
    );
    cancelAutosave.markDirty();
    cancelAutosave.dispose();
    expect(cancelAutosave.getStatus()).toEqual({
      phase: "disposed",
      dirty: true,
    });

    await drainMicrotasks();
  });

  it("validates construction and rejects a synchronously firing timer", () => {
    const capture = new SequenceCapture([checkpoint("{}")]);
    const save = new ControlledSavePort();
    expect(
      () =>
        new BreditorSessionCheckpointAutosave(capture, save, token(0), {
          delayMs: 251,
          maxLatencyMs: 250,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new BreditorSessionCheckpointAutosave(
          {} as SessionCheckpointAutosaveCapturePort,
          save,
          token(0),
        ),
    ).toThrow(TypeError);

    const synchronousScheduler: SessionCheckpointAutosaveScheduler = {
      now: () => 0,
      schedule: (callback) => {
        callback();
        return 1;
      },
      cancel: vi.fn(),
    };
    const autosave = new BreditorSessionCheckpointAutosave(
      capture,
      save,
      token(0),
      { scheduler: synchronousScheduler },
    );
    expect(() => autosave.commitObserver(undefined)).not.toThrow();
    expect(autosave.getStatus()).toEqual({
      phase: "paused",
      dirty: true,
      failure: { code: "session_checkpoint_autosave.scheduler_failed" },
    });
    expect(capture.calls).toBe(0);
  });
});
