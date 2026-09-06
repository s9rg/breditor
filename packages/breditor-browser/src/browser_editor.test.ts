import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BreditorBrowserEditor,
  MAX_BROWSER_EDITOR_SUBSCRIBERS,
  openBreditorBrowserEditor,
  type BreditorBrowserEditorOptions,
} from "./browser_editor.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import { IndexedDbSessionCheckpointStore } from "./indexeddb_session_checkpoint.js";
import { createToolbarManifest } from "./toolbar_manifest.js";
import type {
  WasmActionStateSnapshotView,
  WasmActionStateStringResultView,
  WasmActionStatesResultView,
} from "./wasm_action_state_adapter.js";
import {
  type WasmCommandObservationView,
  type WasmCommandResultView,
  type WasmSelectionResultView,
} from "./wasm_command_adapter.js";
import {
  BREDITOR_WASM_ABI_VERSION,
  type WasmBootstrappedEngineView,
  type WasmEngineBootstrapFactoryView,
  type WasmEngineBootstrapModuleView,
  type WasmEngineBootstrapResultView,
  type WasmProjectionReadResultView,
} from "./wasm_engine_bootstrap.js";
import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
} from "./wasm_projection_adapter.js";
import type { SemanticSelectionView } from "./wasm_selection_adapter.js";
import type { WasmSessionCheckpointStringResultView } from "./wasm_session_checkpoint.js";

const LINEAGE = "browser-editor-tests";
const STATE_ID = "example/control-toggle";
const ACTION_ID = "example/toggle";
const KEYBOARD = Object.freeze({
  editing: "structuralFallback" as const,
  primaryModifier: "control" as const,
  shortcuts: "enabled" as const,
});
const TOOLBAR_MANIFEST = createToolbarManifest({
  label: "Test controls",
  controls: [
    {
      kind: "button",
      stateId: STATE_ID,
      label: "Toggle",
      activation: "tracked",
      command: {
        kind: "action",
        actionId: ACTION_ID,
        input: { kind: "none" },
        history: "preserve",
      },
    },
  ],
});

interface EngineRecord {
  readonly rawFree: ReturnType<typeof vi.fn>;
  readonly observationFrees: ReturnType<typeof vi.fn>[];
  readonly executeNoInputAction: ReturnType<typeof vi.fn>;
  readonly actionStates: ReturnType<typeof vi.fn>;
  readonly selection: ReturnType<typeof vi.fn>;
}

interface ModuleFixture {
  readonly module: WasmEngineBootstrapModuleView;
  readonly fromDocumentJson: ReturnType<typeof vi.fn>;
  readonly fromSessionCheckpointJson: ReturnType<typeof vi.fn>;
  readonly engines: EngineRecord[];
}

interface ModuleFixtureOptions {
  readonly text?: string;
  readonly checkpoint?: Readonly<{
    lineage: string;
    revision: number;
    text: string;
  }>;
  readonly actionStateThrows?: boolean;
  readonly actionThrows?: boolean;
  readonly enableAction?: boolean;
  readonly onAction?: () => void;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("BreditorBrowserEditor", () => {
  it("cannot be directly constructed from JavaScript without the private factory token", () => {
    expect(() =>
      Reflect.construct(BreditorBrowserEditor as unknown as Function, [{}]),
    ).toThrow(/opened through its factory/u);
  });

  it("uses its private finalizer when startup aborts after full installation", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture();
    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return reads >= 3;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;
    const patchedDispose = vi
      .spyOn(BreditorBrowserEditor.prototype, "dispose")
      .mockImplementation(() => {
        throw new Error("patched public dispose");
      });

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        signal,
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "browser_editor.aborted" },
    });
    expect(patchedDispose).not.toHaveBeenCalled();
    expect(host.childNodes).toHaveLength(0);
    expect(host.attributes).toHaveLength(0);
    expect(toolbarHost.childNodes).toHaveLength(0);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it("opens one opaque runtime, installs accessible host state, and exactly restores it", async () => {
    const host = mountHost();
    host.tabIndex = 0;
    host.setAttribute("contenteditable", "false");
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Prior label");
    host.setAttribute("aria-disabled", "true");
    host.setAttribute("spellcheck", "false");
    host.setAttribute("inert", "");
    const fixture = moduleFixture({ text: "hello" });

    const result = await openBreditorBrowserEditor(
      options(host, fixture.module, {
        label: "Article body",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    const { editor } = result;
    expect(editor).toBeInstanceOf(BreditorBrowserEditor);
    expect(editor.element).toBe(host);
    expect(host.textContent).toBe("hello");
    expect(host.getAttribute("contenteditable")).toBe("true");
    expect(host.getAttribute("role")).toBe("textbox");
    expect(host.getAttribute("aria-label")).toBe("Article body");
    expect(host.getAttribute("aria-multiline")).toBe("true");
    expect(host.getAttribute("aria-disabled")).toBe("false");
    expect(host.getAttribute("spellcheck")).toBe("true");
    expect(host.hasAttribute("inert")).toBe(false);
    expect(host.hasAttribute("data-breditor-editor-root")).toBe(true);
    expect(editor.getStatus()).toBe(editor.getSnapshot().status);
    expect(editor.getStatus()).toEqual({ phase: "live" });
    expect(editor.getSnapshot()).toBe(editor.getSnapshot());
    expect(editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "0" },
      actionState: { status: "fresh" },
      persistence: { phase: "disabled", dirty: false },
    });
    expect(Object.isFrozen(editor.getSnapshot())).toBe(true);
    expect(Object.isFrozen(editor.getSnapshot().document)).toBe(true);
    expect(Object.isFrozen(editor.getSnapshot().actions)).toBe(true);
    await expect(editor.flushPersistence()).resolves.toEqual({
      status: "disabled",
    });
    await expect(editor.retryPersistence()).resolves.toEqual({
      status: "disabled",
    });
    expect(editor.focus()).toBe(true);
    expect(document.activeElement).toBe(host);

    editor.dispose();
    editor.dispose();

    expect(editor.getStatus()).toEqual({ phase: "disposed" });
    expect(editor.getSnapshot().status).toBe(editor.getStatus());
    expect(editor.getSnapshot().actionState.status).toBe("disposed");
    expect(editor.getSnapshot().persistence).toEqual({
      phase: "disabled",
      dirty: false,
    });
    expect(editor.focus()).toBe(false);
    expect(host.childNodes).toHaveLength(0);
    expect(host.getAttribute("contenteditable")).toBe("false");
    expect(host.getAttribute("role")).toBe("group");
    expect(host.getAttribute("aria-label")).toBe("Prior label");
    expect(host.hasAttribute("aria-multiline")).toBe(false);
    expect(host.getAttribute("aria-disabled")).toBe("true");
    expect(host.getAttribute("spellcheck")).toBe("false");
    expect(host.hasAttribute("inert")).toBe(true);
    expect(host.hasAttribute("data-breditor-editor-root")).toBe(false);
    expect(fixture.engines).toHaveLength(1);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
  });

  it("reserves a host synchronously, rejects a second owner, and releases ownership on dispose", async () => {
    const host = mountHost();
    const firstFixture = moduleFixture();
    const secondFixture = moduleFixture();
    const first = await BreditorBrowserEditor.open(
      options(host, firstFixture.module),
    );
    if (!first.ok) throw new Error(first.error.code);

    const duplicate = await BreditorBrowserEditor.open(
      options(host, secondFixture.module),
    );

    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: "browser_editor.host_in_use" },
    });
    expect(secondFixture.fromDocumentJson).not.toHaveBeenCalled();
    first.editor.dispose();

    const replacement = await BreditorBrowserEditor.open(
      options(host, secondFixture.module),
    );
    expect(replacement.ok).toBe(true);
    if (replacement.ok) replacement.editor.dispose();
    expect(secondFixture.fromDocumentJson).toHaveBeenCalledOnce();
  });

  it("rolls back a partially installed host attribute set and frees Wasm owners", async () => {
    const host = mountHost();
    const fixture = moduleFixture();
    const nativeSetAttribute = host.setAttribute;
    const setAttribute = vi.fn(function (
      this: HTMLElement,
      name: string,
      value: string,
    ): void {
      if (name === "role")
        throw new DOMException("private host detail", "InvalidStateError");
      Reflect.apply(nativeSetAttribute, this, [name, value]);
    });
    Object.defineProperty(host, "setAttribute", {
      configurable: true,
      value: setAttribute,
    });

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "browser_editor.setup_failed" },
    });
    expect(setAttribute).toHaveBeenCalledWith("contenteditable", "true");
    expect(host.hasAttribute("contenteditable")).toBe(false);
    expect(host.hasAttribute("role")).toBe(false);
    expect(host.childNodes).toHaveLength(0);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
  });

  it("rolls back render and selection setup failures without leaking host ownership", async () => {
    const renderHost = mountHost();
    const renderFixture = moduleFixture();
    const nativeReplaceChildren = renderHost.replaceChildren;
    Object.defineProperty(renderHost, "replaceChildren", {
      configurable: true,
      value: vi.fn(() => {
        throw new DOMException(
          "private render detail",
          "HierarchyRequestError",
        );
      }),
    });

    const renderFailure = await BreditorBrowserEditor.open(
      options(renderHost, renderFixture.module),
    );

    expect(renderFailure).toMatchObject({
      ok: false,
      error: { code: "browser_editor.initial_render_failed" },
    });
    expect(renderHost.hasAttribute("contenteditable")).toBe(false);
    expect(renderFixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(
      renderFixture.engines[0]?.observationFrees[0],
    ).toHaveBeenCalledOnce();
    Object.defineProperty(renderHost, "replaceChildren", {
      configurable: true,
      value: nativeReplaceChildren,
    });
    const renderRetry = await BreditorBrowserEditor.open(
      options(renderHost, moduleFixture().module),
    );
    expect(renderRetry.ok).toBe(true);
    if (renderRetry.ok) renderRetry.editor.dispose();

    const selectionHost = mountHost();
    const selectionFixture = moduleFixture();
    const selectionApi = vi.spyOn(window, "getSelection").mockReturnValue(null);
    const selectionFailure = await BreditorBrowserEditor.open(
      options(selectionHost, selectionFixture.module),
    );

    expect(selectionFailure).toMatchObject({
      ok: false,
      error: {
        code: "browser_editor.initial_selection_failed",
        causeCode: "browser_editor.selection_write_failed",
      },
    });
    expect(selectionHost.childNodes).toHaveLength(0);
    expect(selectionHost.hasAttribute("contenteditable")).toBe(false);
    expect(selectionFixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(
      selectionFixture.engines[0]?.observationFrees[0],
    ).toHaveBeenCalledOnce();
    selectionApi.mockRestore();
    const selectionRetry = await BreditorBrowserEditor.open(
      options(selectionHost, moduleFixture().module),
    );
    expect(selectionRetry.ok).toBe(true);
    if (selectionRetry.ok) selectionRetry.editor.dispose();
  });

  it("fails closed on the initial action-state read and releases every transferred owner", async () => {
    const host = mountHost();
    const fixture = moduleFixture({ actionStateThrows: true });

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "browser_editor.action_state_failed",
        causeCode: "action_state.read_unavailable",
      },
    });
    expect(host.childNodes).toHaveLength(0);
    expect(host.hasAttribute("contenteditable")).toBe(false);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();

    const retry = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) retry.editor.dispose();
  });

  it("redacts bootstrap failures and releases the host reservation", async () => {
    const host = mountHost();
    const fixture = moduleFixture();
    const incompatible: WasmEngineBootstrapModuleView = {
      ...fixture.module,
      breditorWasmAbiVersion: () => "private-incompatible-version",
    };

    const result = await BreditorBrowserEditor.open(
      options(host, incompatible),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "browser_editor.engine_bootstrap_failed",
        message: "The Rust editor engine could not be initialized safely.",
        causeCode: "engine_bootstrap.incompatible_wasm_abi",
      },
    });
    expect(JSON.stringify(result)).not.toContain(
      "private-incompatible-version",
    );
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
    expect(host.attributes).toHaveLength(0);

    const retry = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) retry.editor.dispose();
  });

  it("bounds duplicate-idempotent subscribers and contains throwing and rejecting listeners", async () => {
    const host = mountHost();
    const result = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    if (!result.ok) throw new Error(result.error.code);
    const editor = result.editor;
    const duplicate = vi.fn();
    const firstRelease = editor.subscribe(duplicate);
    const secondRelease = editor.subscribe(duplicate);
    firstRelease();
    firstRelease();
    editor.subscribe(() => {
      throw new Error("subscriber-local failure");
    });
    editor.subscribe(() => Promise.reject(new Error("contained rejection")));
    const sibling = vi.fn();
    editor.subscribe(sibling);
    const capacityReleases = Array.from(
      { length: MAX_BROWSER_EDITOR_SUBSCRIBERS - 4 },
      () => editor.subscribe(() => undefined),
    );
    expect(() => editor.subscribe(() => undefined)).toThrow(RangeError);
    capacityReleases[0]?.();
    expect(() => editor.subscribe(() => undefined)).not.toThrow();

    editor.dispose();
    secondRelease();
    await settleMicrotasks();

    expect(duplicate).not.toHaveBeenCalled();
    expect(sibling).toHaveBeenCalledOnce();
    expect(() => editor.subscribe("not callable" as never)).toThrow(TypeError);
    const afterDispose = vi.fn();
    const releaseAfterDispose = editor.subscribe(afterDispose);
    releaseAfterDispose();
    await settleMicrotasks();
    expect(afterDispose).not.toHaveBeenCalled();
  });

  it("routes native DOM drift through canonical reconciliation without changing the Rust snapshot", async () => {
    const host = mountHost();
    const fixture = moduleFixture({ text: "authoritative" });
    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );
    if (!result.ok) throw new Error(result.error.code);
    const before = result.editor.getSnapshot();
    const paragraph = host.firstElementChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("paragraph was not rendered");
    }
    paragraph.textContent = "untrusted native drift";

    const event = new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      inputType: "insertText",
      data: "x",
    });
    host.dispatchEvent(event);

    expect(host.textContent).toBe("authoritative");
    expect(result.editor.getStatus()).toEqual({ phase: "live" });
    expect(result.editor.getSnapshot().document).toBe(before.document);
    expect(fixture.engines[0]?.executeNoInputAction).not.toHaveBeenCalled();
    result.editor.dispose();
  });

  it("dispatches an expandable toolbar action through the queue, updates projection/state, and flushes it", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true, text: "before" });
    const indexedDB = new IDBFactory();
    const digest = digestFixture();
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        persistence: {
          indexedDB,
          crypto: digest,
          autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
        },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const editor = opened.editor;
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement))
      throw new Error("toolbar missing");
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    const listener = vi.fn();
    editor.subscribe(listener);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);

    // Completed synchronous delivery never exposes a new document revision
    // beside action state still labelled fresh for the prior revision.
    expect(editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "1" },
      actionState: { status: "fresh" },
      actions: { snapshot: { lineage: LINEAGE, revision: "1" } },
    });
    await settleMicrotasks();

    expect(click.defaultPrevented).toBe(true);
    expect(fixture.engines[0]?.executeNoInputAction).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.executeNoInputAction).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotRevision: "0" }),
      ACTION_ID,
    );
    expect(host.textContent).toBe("after");
    expect(editor.getSnapshot()).toMatchObject({
      status: { phase: "live" },
      document: { lineage: LINEAGE, revision: "1" },
      actionState: { status: "fresh" },
      actions: {
        snapshot: { lineage: LINEAGE, revision: "1" },
        entries: [
          { id: STATE_ID, availability: "enabled", activation: "active" },
        ],
      },
      persistence: { phase: "scheduled", dirty: true },
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(listener).toHaveBeenCalled();

    await expect(editor.flushPersistence()).resolves.toEqual({
      status: "committed",
    });
    expect(editor.getSnapshot().persistence).toEqual({
      phase: "idle",
      dirty: false,
    });
    const verifier = new IndexedDbSessionCheckpointStore({
      indexedDB,
      crypto: digest,
    });
    const persisted = await verifier.load();
    expect(persisted).toMatchObject({
      ok: true,
      status: "loaded",
      checkpointJson: checkpointJson(LINEAGE, 1),
    });
    verifier.close();

    editor.dispose();
    expect(toolbarHost.childNodes).toHaveLength(0);
    expect(host.childNodes).toHaveLength(0);
    expect(editor.getSnapshot().actionState.status).toBe("disposed");
    expect(editor.getSnapshot().persistence).toMatchObject({
      phase: "disposed",
    });
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees).toHaveLength(2);
    expect(
      fixture.engines[0]?.observationFrees.every(
        (free) => free.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it("never labels prior-revision actions fresh after a commit with a DOM failure", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true, text: "before" });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement))
      throw new Error("toolbar missing");
    vi.spyOn(BreditorDomRenderer.prototype, "update").mockImplementationOnce(
      () => {
        throw new DOMException("private render failure", "InvalidStateError");
      },
    );

    button.click();

    expect(opened.editor.getStatus()).toEqual({
      phase: "faulted",
      reason: "toolbarDispatchFailed",
    });
    expect(opened.editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "1" },
      actionState: {
        status: "stale",
        lastError: { code: "action_state.snapshot_mismatch" },
      },
      actions: { snapshot: { lineage: LINEAGE, revision: "0" } },
    });
    expect(JSON.stringify(opened.editor.getSnapshot())).not.toContain(
      "private render failure",
    );

    await settleMicrotasks();

    expect(opened.editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "1" },
      actionState: { status: "fresh" },
      actions: { snapshot: { lineage: LINEAGE, revision: "1" } },
    });
    opened.editor.dispose();
  });

  it("benignly rejects toolbar activation while an IME composition owns delivery", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true, text: "before" });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const button = toolbarHost.querySelector("button");
    const text = host.firstElementChild?.firstChild;
    if (!(button instanceof HTMLButtonElement) || !(text instanceof Text)) {
      throw new Error("composition fixture is unavailable");
    }
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 1);
    const selection = window.getSelection();
    if (selection === null) throw new Error("DOM selection is unavailable");
    selection.removeAllRanges();
    selection.addRange(range);
    text.parentElement?.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );

    button.click();

    expect(opened.editor.getStatus()).toEqual({ phase: "live" });
    expect(opened.editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "0" },
      actionState: { status: "fresh" },
      actions: { snapshot: { lineage: LINEAGE, revision: "0" } },
    });
    expect(fixture.engines[0]?.executeNoInputAction).not.toHaveBeenCalled();
    opened.editor.dispose();
  });

  it("faults closed when a toolbar delivery becomes uncertain and keeps explicit disposal safe", async () => {
    const host = mountHost();
    host.setAttribute("contenteditable", "plaintext-only");
    host.setAttribute("aria-disabled", "false");
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true, actionThrows: true });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const listener = vi.fn();
    opened.editor.subscribe(listener);
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement))
      throw new Error("toolbar missing");

    button.click();

    expect(host.getAttribute("contenteditable")).toBe("false");
    expect(host.getAttribute("aria-disabled")).toBe("true");
    expect(host.hasAttribute("inert")).toBe(true);
    await settleMicrotasks();

    expect(opened.editor.getStatus()).toEqual({
      phase: "faulted",
      reason: "toolbarDispatchFailed",
    });
    expect(opened.editor.focus()).toBe(false);
    expect(toolbarHost.childNodes).toHaveLength(0);
    expect(listener).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.rawFree).not.toHaveBeenCalled();
    opened.editor.dispose();
    opened.editor.dispose();
    expect(host.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(host.getAttribute("aria-disabled")).toBe("false");
    expect(host.hasAttribute("inert")).toBe(false);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it("faults on toolbar presentation loss and refreshes a committed diagnostic snapshot", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true, text: "before" });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement))
      throw new Error("toolbar missing");
    button.focus();
    Object.defineProperty(button, "focus", {
      configurable: true,
      value: () => {
        throw new DOMException("private focus failure", "InvalidStateError");
      },
    });

    button.click();
    await settleMicrotasks();

    expect(opened.editor.getStatus()).toEqual({
      phase: "faulted",
      reason: "toolbarPresentationFailed",
    });
    expect(opened.editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "1" },
      actionState: { status: "fresh" },
      actions: { snapshot: { lineage: LINEAGE, revision: "1" } },
    });
    expect(host.textContent).toBe("after");
    expect(toolbarHost.childNodes).toHaveLength(0);
    opened.editor.dispose();
  });

  it("keeps the editor live while persistence pauses on a redacted save failure", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true });
    const digest: Pick<SubtleCrypto, "digest"> = {
      digest: vi.fn(async () => {
        throw new DOMException("private digest payload", "OperationError");
      }),
    };
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        persistence: {
          indexedDB: new IDBFactory(),
          crypto: digest,
          autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
        },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement))
      throw new Error("toolbar missing");
    button.click();

    const flushed = await opened.editor.flushPersistence();

    expect(flushed).toEqual({
      status: "failed",
      failure: {
        code: "session_checkpoint_autosave.save_failed",
        causeCode: "session_checkpoint.digest_failed",
      },
    });
    expect(JSON.stringify(flushed)).not.toContain("private digest payload");
    expect(opened.editor.getStatus()).toEqual({ phase: "live" });
    expect(opened.editor.getSnapshot().document.revision).toBe("1");
    expect(opened.editor.getSnapshot().persistence).toEqual({
      phase: "paused",
      dirty: true,
      failure: {
        code: "session_checkpoint_autosave.save_failed",
        causeCode: "session_checkpoint.digest_failed",
      },
    });
    await expect(opened.editor.retryPersistence()).resolves.toMatchObject({
      status: "failed",
      failure: { causeCode: "session_checkpoint.digest_failed" },
    });
    opened.editor.dispose();
  });

  it("defers physical engine teardown when disposal reenters an in-flight Wasm command", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    let editor: BreditorBrowserEditor | undefined;
    let engineFreeCallsInsideCommand = -1;
    let fixture: ModuleFixture;
    fixture = moduleFixture({
      enableAction: true,
      onAction: () => {
        editor?.dispose();
        engineFreeCallsInsideCommand =
          fixture.engines[0]?.rawFree.mock.calls.length ?? -1;
      },
    });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    editor = opened.editor;
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement))
      throw new Error("toolbar missing");

    button.click();

    expect(editor.getStatus()).toEqual({ phase: "disposed" });
    expect(engineFreeCallsInsideCommand).toBe(0);
    expect(fixture.engines[0]?.rawFree).not.toHaveBeenCalled();
    await settleMicrotasks();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(host.childNodes).toHaveLength(0);
    expect(toolbarHost.childNodes).toHaveLength(0);
  });

  it("restores a verified stored checkpoint and never constructs the fresh document path", async () => {
    const indexedDB = new IDBFactory();
    const digest = digestFixture();
    const seededStore = new IndexedDbSessionCheckpointStore({
      indexedDB,
      crypto: digest,
    });
    const empty = await seededStore.load();
    if (!empty.ok) throw new Error(empty.error.code);
    const saved = await seededStore.save(
      empty.token,
      checkpointJson(LINEAGE, 4),
    );
    expect(saved.ok).toBe(true);
    seededStore.close();
    const host = mountHost();
    const fixture = moduleFixture({
      checkpoint: { lineage: LINEAGE, revision: 4, text: "restored" },
    });

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        persistence: { indexedDB, crypto: digest },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
    expect(fixture.fromSessionCheckpointJson).toHaveBeenCalledExactlyOnceWith(
      checkpointJson(LINEAGE, 4),
    );
    expect(host.textContent).toBe("restored");
    expect(result.editor.getSnapshot().document).toEqual({
      lineage: LINEAGE,
      revision: "4",
    });
    result.editor.dispose();
  });

  it("does not fall back to fresh content after corrupt persistence and releases the host", async () => {
    const indexedDB = new IDBFactory();
    const goodDigest = digestFixture();
    const seededStore = new IndexedDbSessionCheckpointStore({
      indexedDB,
      crypto: goodDigest,
    });
    const empty = await seededStore.load();
    if (!empty.ok) throw new Error(empty.error.code);
    await seededStore.save(empty.token, checkpointJson(LINEAGE, 2));
    seededStore.close();
    const host = mountHost();
    const fixture = moduleFixture();
    const failingDigest: Pick<SubtleCrypto, "digest"> = {
      digest: vi.fn(async () => {
        throw new DOMException("private digest detail", "OperationError");
      }),
    };

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        persistence: { indexedDB, crypto: failingDigest },
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "browser_editor.persistence_load_failed",
        message: "The persisted session checkpoint could not be loaded safely.",
        causeCode: "session_checkpoint.digest_failed",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private digest detail");
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
    expect(fixture.fromSessionCheckpointJson).not.toHaveBeenCalled();
    expect(host.attributes).toHaveLength(0);

    const retry = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) retry.editor.dispose();
  });

  it("settles an abort while IndexedDB open is pending and permits immediate reuse", async () => {
    const host = mountHost();
    const fixture = moduleFixture();
    const request = {} as IDBOpenDBRequest;
    const open = vi.fn(() => request);
    const hangingFactory = { open } as unknown as IDBFactory;
    const controller = new AbortController();
    const pending = BreditorBrowserEditor.open(
      options(host, fixture.module, {
        persistence: { indexedDB: hangingFactory, crypto: digestFixture() },
        signal: controller.signal,
      }),
    );

    controller.abort();
    const result = await pending;

    expect(result).toMatchObject({
      ok: false,
      error: { code: "browser_editor.aborted" },
    });
    expect(open).toHaveBeenCalledOnce();
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
    expect(host.attributes).toHaveLength(0);
    expect(host.childNodes).toHaveLength(0);

    const retry = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) retry.editor.dispose();
  });

  it("re-proves dedicated mounts after persistence latency without overwriting intervening app content", async () => {
    const indexedDB = new IDBFactory();
    const goodDigest = digestFixture();
    const seededStore = new IndexedDbSessionCheckpointStore({
      indexedDB,
      crypto: goodDigest,
    });
    const empty = await seededStore.load();
    if (!empty.ok) throw new Error(empty.error.code);
    await seededStore.save(empty.token, checkpointJson(LINEAGE, 3));
    seededStore.close();
    const deferred = deferredDigestFixture();
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({
      checkpoint: { lineage: LINEAGE, revision: 3, text: "stored" },
    });
    const pending = BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        persistence: { indexedDB, crypto: deferred.crypto },
      }),
    );
    await waitUntil(() => deferred.pending());
    host.append(document.createTextNode("application editor content"));
    toolbarHost.append(document.createTextNode("application toolbar content"));

    deferred.resolve();
    const result = await pending;

    expect(result).toMatchObject({
      ok: false,
      error: { code: "browser_editor.setup_failed" },
    });
    expect(host.textContent).toBe("application editor content");
    expect(toolbarHost.textContent).toBe("application toolbar content");
    expect(host.attributes).toHaveLength(0);
    expect(toolbarHost.attributes).toHaveLength(0);
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
    expect(fixture.fromSessionCheckpointJson).not.toHaveBeenCalled();

    host.replaceChildren();
    toolbarHost.replaceChildren();
    const retry = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) retry.editor.dispose();
  });

  it("rejects invalid or already-aborted setup before invoking Wasm", async () => {
    const fixture = moduleFixture();
    const disconnected = document.createElement("div");
    const dirty = mountHost();
    dirty.append(document.createTextNode("application content"));
    const sameToolbar = mountHost();
    const abortedHost = mountHost();
    const controller = new AbortController();
    controller.abort();

    await expect(
      BreditorBrowserEditor.open(options(disconnected, fixture.module)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    await expect(
      BreditorBrowserEditor.open(options(dirty, fixture.module)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    await expect(
      BreditorBrowserEditor.open(
        options(sameToolbar, fixture.module, {
          toolbar: { host: sameToolbar },
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    await expect(
      BreditorBrowserEditor.open(
        options(abortedHost, fixture.module, { signal: controller.signal }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.aborted" },
    });
    await expect(
      BreditorBrowserEditor.open(
        options(mountHost(), fixture.module, { label: "\ud800" }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    await expect(
      BreditorBrowserEditor.open(
        options(mountHost(), fixture.module, { label: " \t\n " }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
  });
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
}

function options(
  host: HTMLElement,
  wasm: WasmEngineBootstrapModuleView,
  overrides: Partial<BreditorBrowserEditorOptions> = {},
): BreditorBrowserEditorOptions {
  return {
    host,
    label: "Editor",
    wasm,
    initialDocument: {
      lineageId: LINEAGE,
      documentJson: "{}",
      historyCapacity: 100,
    },
    keyboard: KEYBOARD,
    ...overrides,
  };
}

function moduleFixture(config: ModuleFixtureOptions = {}): ModuleFixture {
  const engines: EngineRecord[] = [];
  const create = (lineage: string, revision: number, text: string) => {
    const built = engineFixture(lineage, revision, text, config);
    engines.push(built.record);
    return constructionResult(built.engine);
  };
  const fromDocumentJson = vi.fn((lineage: string) =>
    create(lineage, 0, config.text ?? "hello"),
  );
  const fromSessionCheckpointJson = vi.fn(() => {
    const checkpoint = config.checkpoint ?? {
      lineage: LINEAGE,
      revision: 0,
      text: config.text ?? "hello",
    };
    return create(checkpoint.lineage, checkpoint.revision, checkpoint.text);
  });
  const factory: WasmEngineBootstrapFactoryView = {
    fromDocumentJson,
    fromSessionCheckpointJson,
  };
  return {
    module: {
      BreditorEngine: factory,
      breditorWasmAbiVersion: () => BREDITOR_WASM_ABI_VERSION,
      breditorVersion: () => "0.0.58",
    },
    fromDocumentJson,
    fromSessionCheckpointJson,
    engines,
  };
}

function engineFixture(
  lineage: string,
  initialRevision: number,
  initialText: string,
  config: ModuleFixtureOptions,
): Readonly<{ engine: WasmBootstrappedEngineView; record: EngineRecord }> {
  let revision = initialRevision;
  let text = initialText;
  let active = false;
  const rawFree = vi.fn();
  const observationFrees: ReturnType<typeof vi.fn>[] = [];
  const makeObservation = (
    snapshotRevision: number,
  ): WasmCommandObservationView => {
    const free = vi.fn();
    observationFrees.push(free);
    return {
      snapshotLineage: lineage,
      snapshotRevision: String(snapshotRevision),
      free,
    };
  };
  const initialObservation = makeObservation(revision);
  const actionStates = vi.fn((expected: WasmCommandObservationView) => {
    if (config.actionStateThrows === true) {
      throw new Error("private action state payload");
    }
    return actionStatesResult(
      lineage,
      Number(expected.snapshotRevision),
      config.enableAction === true,
      active,
    );
  });
  const selection = vi.fn((expected: WasmCommandObservationView) =>
    selectionResult(noneSelection(lineage, Number(expected.snapshotRevision))),
  );
  const executeNoInputAction = vi.fn(
    (expected: WasmCommandObservationView, actionId: string) => {
      if (config.actionThrows === true)
        throw new Error("uncertain Wasm delivery");
      if (config.enableAction !== true || actionId !== ACTION_ID) {
        throw new Error("unexpected no-input action");
      }
      config.onAction?.();
      const baseRevision = Number(expected.snapshotRevision);
      const successorRevision = baseRevision + 1;
      const successor = makeObservation(successorRevision);
      const baseText = text;
      const nextText = "after";
      revision = successorRevision;
      text = nextText;
      active = true;
      return commandResult(
        successor,
        projectionUpdate(
          lineage,
          baseRevision,
          baseText,
          successorRevision,
          nextText,
        ),
      );
    },
  );
  const unexpected = (name: string): never => {
    throw new Error(`unexpected ${name}`);
  };
  const engine: WasmBootstrappedEngineView = {
    actionStates,
    sessionCheckpointJson: vi.fn(() => checkpointResult(lineage, revision)),
    clearSelection: vi.fn(() => unexpected("clearSelection")),
    setRangeSelection: vi.fn(() => unexpected("setRangeSelection")),
    selection,
    executeNoInputAction,
    executeStringAction: vi.fn(() => unexpected("executeStringAction")),
    undo: vi.fn(() => unexpected("undo")),
    redo: vi.fn(() => unexpected("redo")),
    closeHistoryGroup: vi.fn(() => unexpected("closeHistoryGroup")),
    observation: vi.fn(() => initialObservation),
    projection: vi.fn(() =>
      projectionReadResult(projectionView(lineage, revision, text)),
    ),
    free: rawFree,
  };
  return {
    engine,
    record: {
      rawFree,
      observationFrees,
      executeNoInputAction,
      actionStates,
      selection,
    },
  };
}

function constructionResult(
  engine: WasmBootstrappedEngineView,
): WasmEngineBootstrapResultView {
  let taken = false;
  return {
    status: "engine",
    error: undefined,
    takeEngine: () => {
      if (taken) return undefined;
      taken = true;
      return engine;
    },
    free: vi.fn(),
  };
}

function projectionReadResult(
  projection: SemanticProjectionView,
): WasmProjectionReadResultView {
  let taken = false;
  return {
    status: "projection",
    error: undefined,
    takeProjection: () => {
      if (taken) return undefined;
      taken = true;
      return projection;
    },
    free: vi.fn(),
  };
}

function projectionView(
  lineage: string,
  revision: number,
  text: string,
): SemanticProjectionView {
  return {
    schemaName: "breditor/base",
    schemaVersion: 1,
    snapshotLineage: lineage,
    snapshotRevision: String(revision),
    nodeCount: 3,
    rootIndex: 0,
    nodeKind: (index) =>
      index === 0 || index === 1 ? "element" : index === 2 ? "text" : undefined,
    elementType: (index) =>
      index === 0
        ? "breditor/document"
        : index === 1
          ? "breditor/paragraph"
          : undefined,
    childCount: (index) => (index === 0 || index === 1 ? 1 : undefined),
    childAt: (index, ordinal) =>
      ordinal !== 0 ? undefined : index === 0 ? 1 : index === 1 ? 2 : undefined,
    text: (index) => (index === 2 ? text : undefined),
    formatCount: (index) => (index === 2 ? 0 : undefined),
    formatType: () => undefined,
    free: vi.fn(),
  };
}

function noneSelection(
  lineage: string,
  revision: number,
): SemanticSelectionView {
  return {
    snapshotLineage: lineage,
    snapshotRevision: String(revision),
    kind: "none",
    anchorPointKind: undefined,
    anchorNodeIndex: undefined,
    anchorOffset: undefined,
    anchorAffinity: undefined,
    focusPointKind: undefined,
    focusNodeIndex: undefined,
    focusOffset: undefined,
    focusAffinity: undefined,
    rangeOrder: undefined,
    free: vi.fn(),
  };
}

function selectionResult(
  selection: SemanticSelectionView,
): WasmSelectionResultView {
  let taken = false;
  return {
    status: "selection",
    error: undefined,
    takeSelection: () => {
      if (taken) return undefined;
      taken = true;
      return selection;
    },
    free: vi.fn(),
  };
}

function actionStatesResult(
  lineage: string,
  revision: number,
  enabled: boolean,
  active: boolean,
): WasmActionStatesResultView {
  let taken = false;
  const entryCount = enabled ? 1 : 0;
  const snapshot: WasmActionStateSnapshotView = {
    snapshotLineage: lineage,
    snapshotRevision: String(revision),
    entryCount,
    changedCount: entryCount,
    entryId: (index) => (index === 0 && enabled ? STATE_ID : undefined),
    entryStatus: (index) => (index === 0 && enabled ? "enabled" : undefined),
    entryActivation: (index) =>
      index === 0 && enabled ? (active ? "active" : "inactive") : undefined,
    entryReasonCode: () => undefined,
    entryValueStatus: (index) =>
      index === 0 && enabled ? "unsupported" : undefined,
    entryValueContractName: () => undefined,
    entryValueContractVersion: () => undefined,
    entryUniformValueJson: () => absentStringResult(),
    changedId: (index) => (index === 0 && enabled ? STATE_ID : undefined),
    free: vi.fn(),
  };
  return {
    status: "full",
    error: undefined,
    takeSnapshot: () => {
      if (taken) return undefined;
      taken = true;
      return snapshot;
    },
    free: vi.fn(),
  };
}

function absentStringResult(): WasmActionStateStringResultView {
  return {
    status: "absent",
    error: undefined,
    takeValue: () => undefined,
    free: vi.fn(),
  };
}

function commandResult(
  successor: WasmCommandObservationView,
  update: SemanticProjectionUpdateView,
): WasmCommandResultView {
  return {
    status: "committed",
    eventKind: "action",
    disabledActionId: undefined,
    disabledReasonCode: undefined,
    activation: undefined,
    error: undefined,
    observation: () => successor,
    projectionUpdate: () => update,
    free: vi.fn(),
  };
}

function projectionUpdate(
  lineage: string,
  baseRevision: number,
  baseText: string,
  resultRevision: number,
  resultText: string,
): SemanticProjectionUpdateView {
  let taken = false;
  return {
    baseLineage: lineage,
    baseRevision: String(baseRevision),
    resultLineage: lineage,
    resultRevision: String(resultRevision),
    impact: "textContainers",
    affectedParagraphCount: 1,
    oldChildStart: undefined,
    oldChildEnd: undefined,
    newChildStart: undefined,
    newChildEnd: undefined,
    affectedParagraphIndex: (index) => (index === 0 ? 0 : undefined),
    takeProjection: () => {
      if (taken) return undefined;
      taken = true;
      return projectionView(lineage, resultRevision, resultText);
    },
    free: vi.fn(),
  };
}

function checkpointResult(
  lineage: string,
  revision: number,
): WasmSessionCheckpointStringResultView {
  let taken = false;
  return {
    status: "value",
    error: undefined,
    takeValue: () => {
      if (taken) return undefined;
      taken = true;
      return checkpointJson(lineage, revision);
    },
    free: vi.fn(),
  };
}

function checkpointJson(lineage: string, revision: number): string {
  return JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 1,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 1,
      snapshot: { lineage, revision: "0" },
    },
    currentRevision: String(revision),
    historyCapacity: 100,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
}

function digestFixture(): Pick<SubtleCrypto, "digest"> {
  return {
    digest: async (_algorithm, data) => pseudoDigest(data),
  };
}

function deferredDigestFixture(): Readonly<{
  crypto: Pick<SubtleCrypto, "digest">;
  pending(): boolean;
  resolve(): void;
}> {
  let complete: (() => void) | undefined;
  const digest: SubtleCrypto["digest"] = (_algorithm, data) =>
    new Promise<ArrayBuffer>((resolve) => {
      const result = pseudoDigest(data);
      complete = () => resolve(result);
    });
  return {
    crypto: { digest },
    pending: () => complete !== undefined,
    resolve: () => {
      if (complete === undefined) throw new Error("digest is not pending");
      const settle = complete;
      complete = undefined;
      settle();
    },
  };
}

function pseudoDigest(data: BufferSource): ArrayBuffer {
  const source = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  const output = new Uint8Array(32);
  for (let index = 0; index < source.length; index += 1) {
    const slot = index % output.length;
    output[slot] = (output[slot] ?? 0) ^ (source[index] ?? 0) ^ (index & 0xff);
  }
  return output.buffer;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error("asynchronous test condition did not arrive");
}

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}
