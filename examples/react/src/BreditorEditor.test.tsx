// @vitest-environment jsdom

import { StrictMode, act, createRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeWasm: vi.fn(() => Promise.resolve()),
  openEditor: vi.fn(),
  profileBootstrapJson: '{"profile":"reference-showcase"}',
  renderManifest: Object.freeze({ recipes: Object.freeze([]) }),
  sampleDocumentJson: '{"document":"reference-showcase-v2"}',
  toolbarManifest: Object.freeze({
    label: "Showcase toolbar",
    controls: Object.freeze([]),
  }),
}));

vi.mock("@breditor/wasm", () => ({
  default: mocks.initializeWasm,
  BreditorEngine: {},
}));

vi.mock("@breditor/browser", () => ({
  openBreditorBrowserEditor: mocks.openEditor,
}));

vi.mock("@breditor/reference-highlight", () => ({
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON: mocks.profileBootstrapJson,
  REFERENCE_SHOWCASE_RENDER_MANIFEST: mocks.renderManifest,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON: mocks.sampleDocumentJson,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST: mocks.toolbarManifest,
}));

import { BreditorEditor, type BreditorEditorHandle } from "./BreditorEditor.js";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

interface FakeEditor {
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly focus: ReturnType<typeof vi.fn>;
  readonly getSnapshot: ReturnType<typeof vi.fn>;
  readonly getStatus: ReturnType<typeof vi.fn>;
  readonly flushPersistence: ReturnType<typeof vi.fn>;
  readonly retryPersistence: ReturnType<typeof vi.fn>;
  readonly subscribe: ReturnType<typeof vi.fn>;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
}

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function fakeEditor(
  documentJson = '{"test":"document"}',
  persistence: Readonly<Record<string, unknown>> = Object.freeze({
    phase: "disabled",
    dirty: false,
  }),
): FakeEditor {
  const unsubscribe = vi.fn();
  const snapshot = Object.freeze({
    status: Object.freeze({ phase: "live" }),
    document: Object.freeze({ documentJson }),
    actionState: Object.freeze({ status: "fresh", lastError: undefined }),
    persistence,
  });
  return {
    dispose: vi.fn(),
    focus: vi.fn(() => true),
    flushPersistence: vi.fn(() => Promise.resolve({ status: "committed" })),
    getSnapshot: vi.fn(() => snapshot),
    getStatus: vi.fn(() => Object.freeze({ phase: "live" })),
    retryPersistence: vi.fn(() => Promise.resolve({ status: "committed" })),
    subscribe: vi.fn(() => unsubscribe),
    unsubscribe,
  };
}

function successful(editor: FakeEditor): unknown {
  return { ok: true, editor };
}

function failed(message: string, causeCode?: string): unknown {
  return {
    ok: false,
    error: {
      code: "browser_editor.setup_failed",
      message,
      ...(causeCode === undefined ? {} : { causeCode }),
    },
  };
}

function view(
  label = "Example document",
  primaryModifier: "control" | "meta" = "control",
  strict = false,
): ReactElement {
  const editor = (
    <BreditorEditor label={label} primaryModifier={primaryModifier} />
  );
  return strict ? <StrictMode>{editor}</StrictMode> : editor;
}

async function render(element: ReactElement): Promise<{
  readonly container: HTMLDivElement;
  readonly root: Root;
}> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ container, root });
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function shell(container: HTMLElement): HTMLElement {
  const result = container.querySelector<HTMLElement>(".editor-shell");
  if (result === null) throw new Error("editor shell was not rendered");
  return result;
}

function status(container: HTMLElement): string {
  return container.querySelector("[role=status]")?.textContent ?? "";
}

beforeEach(() => {
  mocks.openEditor.mockReset();
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (mounted === undefined) continue;
    await act(async () => mounted.root.unmount());
    await settle();
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("BreditorEditor lifecycle", () => {
  it("passes the complete showcase toolbar manifest into empty runtime-owned mounts", async () => {
    const editor = fakeEditor();
    let mountsWereEmpty = false;
    let showcaseToolbarManifestWasPassed = false;
    mocks.openEditor.mockImplementation((options: Record<string, unknown>) => {
      const host = options["host"] as HTMLDivElement;
      const toolbar = options["toolbar"] as {
        readonly host: HTMLDivElement;
        readonly manifest: unknown;
      };
      mountsWereEmpty =
        host.childNodes.length === 0 && toolbar.host.childNodes.length === 0;
      showcaseToolbarManifestWasPassed =
        toolbar.manifest === mocks.toolbarManifest;
      return Promise.resolve(successful(editor));
    });

    const mounted = await render(view("Reference Showcase demo", "meta"));
    await settle();

    expect(mountsWereEmpty).toBe(true);
    expect(showcaseToolbarManifestWasPassed).toBe(true);
    expect(mounted.container.querySelectorAll(".toolbar-mount")).toHaveLength(1);
    expect(
      mounted.container.querySelector(".toolbar-mount")?.parentElement,
    ).toBe(shell(mounted.container));
    expect(mocks.openEditor).toHaveBeenCalledTimes(1);
    expect(mocks.openEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Reference Showcase demo",
        initialDocument: {
          lineageId: "breditor-react-reference-showcase",
          documentJson: mocks.sampleDocumentJson,
          historyCapacity: 100,
        },
        semanticProfile: {
          bootstrapJson: mocks.profileBootstrapJson,
          formatVersion: 2,
        },
        rendering: mocks.renderManifest,
        keyboard: {
          editing: "beforeinputPrimary",
          primaryModifier: "meta",
          shortcuts: "enabled",
        },
        toolbar: expect.objectContaining({ manifest: mocks.toolbarManifest }),
        persistence: expect.objectContaining({
          scope: {
            kind: "slot",
            name: "breditor.react-reference-showcase.v1",
          },
        }),
      }),
    );
  });

  it("owns exactly one live editor through a StrictMode mount and cleanup", async () => {
    const editor = fakeEditor();
    mocks.openEditor.mockResolvedValue(successful(editor));

    const mounted = await render(view("Strict editor", "control", true));
    await settle();

    expect(mocks.openEditor).toHaveBeenCalledTimes(1);
    expect(editor.focus).toHaveBeenCalledTimes(1);
    expect(editor.dispose).not.toHaveBeenCalled();
    expect(shell(mounted.container).getAttribute("aria-busy")).toBe("false");

    await act(async () => mounted.root.unmount());
    mountedRoots.pop();
    mounted.container.remove();

    expect(editor.unsubscribe).toHaveBeenCalledTimes(1);
    expect(editor.dispose).toHaveBeenCalledTimes(1);
  });

  it("retires the old editor and exposes only starting state during a prop restart", async () => {
    const first = fakeEditor('{"version":1}');
    const second = fakeEditor('{"version":2}');
    const nextOpen = deferred<unknown>();
    mocks.openEditor
      .mockResolvedValueOnce(successful(first))
      .mockReturnValueOnce(nextOpen.promise);

    const mounted = await render(view("First label"));
    await settle();
    expect(status(mounted.container)).toBe("Autosave is off.");

    await act(async () => {
      mounted.root.render(view("Second label", "meta"));
    });

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(shell(mounted.container).getAttribute("aria-busy")).toBe("true");
    expect(status(mounted.container)).toBe("Starting editor…");

    await act(async () => nextOpen.resolve(successful(second)));
    await settle();

    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    expect(shell(mounted.container).getAttribute("aria-busy")).toBe("false");
    expect(status(mounted.container)).toBe("Autosave is off.");
  });

  it("clears a terminal failure when a later configuration succeeds", async () => {
    const recovered = fakeEditor();
    const recovery = deferred<unknown>();
    mocks.openEditor
      .mockResolvedValueOnce(failed("First configuration failed."))
      .mockReturnValueOnce(recovery.promise);

    const mounted = await render(view("Invalid configuration"));
    await settle();

    expect(status(mounted.container)).toBe("First configuration failed.");
    expect(shell(mounted.container).getAttribute("aria-busy")).toBe("false");

    await act(async () => {
      mounted.root.render(view("Recovered configuration", "meta"));
    });

    expect(status(mounted.container)).toBe("Starting editor…");
    expect(shell(mounted.container).getAttribute("aria-busy")).toBe("true");

    await act(async () => recovery.resolve(successful(recovered)));
    await settle();

    expect(status(mounted.container)).toBe("Autosave is off.");
    expect(shell(mounted.container).getAttribute("aria-busy")).toBe("false");
  });

  it("shows redacted startup diagnostics and retries the editor in place", async () => {
    const recovered = fakeEditor();
    mocks.openEditor
      .mockResolvedValueOnce(
        failed("The editor profile could not be loaded.", "profile.invalid"),
      )
      .mockResolvedValueOnce(successful(recovered));

    const mounted = await render(view("Recoverable editor"));
    await settle();

    expect(status(mounted.container)).toBe(
      "The editor profile could not be loaded.",
    );
    expect(mounted.container.textContent).toContain(
      "browser_editor.setup_failed",
    );
    expect(mounted.container.textContent).toContain("profile.invalid");
    const retry = Array.from(
      mounted.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Retry editor");
    expect(retry).toBeDefined();

    await act(async () => retry?.click());
    await settle();

    expect(mocks.openEditor).toHaveBeenCalledTimes(2);
    expect(recovered.focus).toHaveBeenCalledTimes(1);
    expect(status(mounted.container)).toBe("Autosave is off.");
  });

  it("disposes a stale async success without publishing or focusing it", async () => {
    const stale = fakeEditor();
    const current = fakeEditor();
    const staleOpen = deferred<unknown>();
    mocks.openEditor
      .mockReturnValueOnce(staleOpen.promise)
      .mockResolvedValueOnce(successful(current));

    const mounted = await render(view("Slow configuration"));
    await act(async () => {
      mounted.root.render(view("Current configuration", "meta"));
    });
    await settle();

    expect(current.focus).not.toHaveBeenCalled();
    await act(async () => staleOpen.resolve(successful(stale)));
    await settle();

    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(stale.focus).not.toHaveBeenCalled();
    expect(current.focus).toHaveBeenCalledTimes(1);
    expect(current.dispose).not.toHaveBeenCalled();
    expect(status(mounted.container)).toBe("Autosave is off.");
  });

  it("flushes a dirty editor before disposal and serializes its replacement", async () => {
    const first = fakeEditor('{"version":1}', {
      phase: "scheduled",
      dirty: true,
    });
    const second = fakeEditor('{"version":2}');
    const flush = deferred<unknown>();
    const events: string[] = [];
    first.flushPersistence.mockImplementation(() => {
      events.push("flush-first");
      return flush.promise;
    });
    first.dispose.mockImplementation(() => events.push("dispose-first"));
    mocks.openEditor
      .mockResolvedValueOnce(successful(first))
      .mockImplementationOnce(() => {
        events.push("open-second");
        return Promise.resolve(successful(second));
      });

    const mounted = await render(view("Dirty editor"));
    await settle();
    expect(status(mounted.container)).toBe("Unsaved changes; save scheduled.");

    await act(async () => {
      mounted.root.render(view("Replacement editor", "meta"));
    });
    await settle();

    const editorMount =
      mounted.container.querySelector<HTMLDivElement>(".editor-mount");
    const toolbarMount =
      mounted.container.querySelector<HTMLDivElement>(".toolbar-mount");
    expect(editorMount?.inert).toBe(true);
    expect(toolbarMount?.inert).toBe(true);
    expect(editorMount?.getAttribute("contenteditable")).toBe("false");
    expect(events).toEqual(["flush-first"]);
    expect(first.dispose).not.toHaveBeenCalled();
    expect(mocks.openEditor).toHaveBeenCalledTimes(1);

    await act(async () => {
      flush.resolve({
        status: "failed",
        failure: { code: "session_checkpoint_autosave.save_failed" },
      });
    });
    await settle();

    expect(events).toEqual(["flush-first", "dispose-first", "open-second"]);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.openEditor).toHaveBeenCalledTimes(2);
    expect(editorMount?.inert).toBe(false);
    expect(toolbarMount?.inert).toBe(false);
    expect(second.focus).toHaveBeenCalledTimes(1);
  });

  it("always disposes and continues replacement after a flush rejection", async () => {
    const first = fakeEditor();
    const second = fakeEditor();
    first.flushPersistence.mockRejectedValue(new Error("storage failed"));
    mocks.openEditor
      .mockResolvedValueOnce(successful(first))
      .mockResolvedValueOnce(successful(second));

    const mounted = await render(view("First editor"));
    await settle();
    await act(async () => {
      mounted.root.render(view("Second editor", "meta"));
    });
    await settle();

    expect(first.flushPersistence).toHaveBeenCalledTimes(1);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.focus).toHaveBeenCalledTimes(1);
  });

  it("retires exactly once when focus throws and cleanup reenters during flush", async () => {
    vi.useFakeTimers();
    try {
      const editor = fakeEditor();
      editor.focus.mockImplementation(() => {
        throw new Error("focus failed");
      });
      editor.flushPersistence.mockReturnValue(new Promise(() => {}));
      mocks.openEditor.mockResolvedValue(successful(editor));

      const mounted = await render(view("Throwing focus"));
      await settle();
      expect(editor.flushPersistence).toHaveBeenCalledTimes(1);

      await act(async () => mounted.root.unmount());
      mountedRoots.pop();
      mounted.container.remove();
      expect(editor.flushPersistence).toHaveBeenCalledTimes(1);
      expect(editor.dispose).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      await settle();

      expect(editor.flushPersistence).toHaveBeenCalledTimes(1);
      expect(editor.dispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a hung retirement before opening the replacement", async () => {
    vi.useFakeTimers();
    try {
      const first = fakeEditor();
      const second = fakeEditor();
      first.flushPersistence.mockReturnValue(new Promise(() => {}));
      mocks.openEditor
        .mockResolvedValueOnce(successful(first))
        .mockResolvedValueOnce(successful(second));

      const mounted = await render(view("Hung persistence"));
      await settle();
      await act(async () => {
        mounted.root.render(view("Replacement after timeout", "meta"));
      });
      await settle();

      expect(first.dispose).not.toHaveBeenCalled();
      expect(mocks.openEditor).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_999);
      });
      expect(first.dispose).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await settle();

      expect(first.dispose).toHaveBeenCalledTimes(1);
      expect(mocks.openEditor).toHaveBeenCalledTimes(2);
      expect(second.focus).toHaveBeenCalledTimes(1);

      await act(async () => mounted.root.unmount());
      mountedRoots.pop();
      mounted.container.remove();
      await settle();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [{ phase: "idle", dirty: false }, "All changes saved."],
    [{ phase: "scheduled", dirty: true }, "Unsaved changes; save scheduled."],
    [{ phase: "saving", dirty: true }, "Saving changes…"],
    [
      {
        phase: "paused",
        dirty: true,
        failure: { code: "session_checkpoint_autosave.save_failed" },
      },
      "Autosave paused; changes are not saved.",
    ],
  ])(
    "reports persistence state honestly for %o",
    async (persistence, message) => {
      const editor = fakeEditor(undefined, persistence);
      mocks.openEditor.mockResolvedValue(successful(editor));

      const mounted = await render(view("Persistence status"));
      await settle();

      expect(status(mounted.container)).toBe(message);
      expect(status(mounted.container)).not.toMatch(/^Saved state:/u);
    },
  );

  it("offers one bounded persistence retry while autosave is paused", async () => {
    const retry = deferred<unknown>();
    const editor = fakeEditor(undefined, {
      phase: "paused",
      dirty: true,
      failure: {
        code: "session_checkpoint_autosave.save_failed",
        causeCode: "indexed_db.transaction_failed",
      },
    });
    editor.retryPersistence.mockReturnValue(retry.promise);
    mocks.openEditor.mockResolvedValue(successful(editor));

    const mounted = await render(view("Paused persistence"));
    await settle();

    expect(mounted.container.textContent).toContain(
      "session_checkpoint_autosave.save_failed",
    );
    expect(mounted.container.textContent).toContain(
      "indexed_db.transaction_failed",
    );
    const retryButton = Array.from(
      mounted.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Retry saving");
    expect(retryButton).toBeDefined();

    await act(async () => retryButton?.click());
    await settle();

    expect(editor.retryPersistence).toHaveBeenCalledTimes(1);
    expect(retryButton?.disabled).toBe(true);
    expect(retryButton?.textContent).toBe("Retrying save…");

    await act(async () => retry.resolve({ status: "committed" }));
    await settle();

    expect(retryButton?.disabled).toBe(false);
    expect(editor.retryPersistence).toHaveBeenCalledTimes(1);
  });

  it("exposes a bounded controlled-navigation flush without disposing", async () => {
    const editor = fakeEditor();
    editor.flushPersistence.mockResolvedValue({ status: "committed" });
    mocks.openEditor.mockResolvedValue(successful(editor));
    const editorRef = createRef<BreditorEditorHandle>();

    const mounted = await render(
      <BreditorEditor
        ref={editorRef}
        label="Controlled navigation"
        primaryModifier="control"
      />,
    );
    await settle();

    await expect(editorRef.current?.flushBeforeNavigation()).resolves.toEqual({
      status: "settled",
      result: { status: "committed" },
    });
    expect(editor.dispose).not.toHaveBeenCalled();

    vi.useFakeTimers();
    try {
      editor.flushPersistence.mockReturnValueOnce(new Promise(() => {}));
      const pending = editorRef.current?.flushBeforeNavigation(10);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      await expect(pending).resolves.toEqual({ status: "timed_out" });
      expect(editor.dispose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }

    expect(mounted.container.isConnected).toBe(true);
  });

  it("flushes faulted editors and contains a throwing status read", async () => {
    const editor = fakeEditor();
    editor.getStatus.mockReturnValue({
      phase: "faulted",
      reason: "queueUncertain",
    });
    editor.flushPersistence.mockResolvedValue({ status: "committed" });
    mocks.openEditor.mockResolvedValue(successful(editor));
    const editorRef = createRef<BreditorEditorHandle>();

    await render(
      <BreditorEditor
        ref={editorRef}
        label="Faulted persistence"
        primaryModifier="control"
      />,
    );
    await settle();

    await expect(editorRef.current?.flushBeforeNavigation()).resolves.toEqual({
      status: "settled",
      result: { status: "committed" },
    });
    expect(editor.flushPersistence).toHaveBeenCalledTimes(1);

    editor.getStatus.mockImplementationOnce(() => {
      throw new Error("status failed");
    });
    await expect(editorRef.current?.flushBeforeNavigation()).resolves.toEqual({
      status: "unexpected_failure",
    });
  });
});
