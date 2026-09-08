import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BreditorBrowserEditor,
  MAX_BROWSER_EDITOR_SUBSCRIBERS,
  openBreditorBrowserEditor,
  type BreditorBrowserEditorOptions,
} from "./browser_editor.js";
import { BreditorActionStateStore } from "./action_state_store.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import {
  IndexedDbSessionCheckpointStore,
  SESSION_CHECKPOINT_DATABASE_NAME,
  SESSION_CHECKPOINT_DATABASE_VERSION,
  SESSION_CHECKPOINT_OBJECT_STORE_NAME,
  SESSION_CHECKPOINT_SLOT,
  type IndexedDbSessionCheckpointBinding,
} from "./indexeddb_session_checkpoint.js";
import { createInlineFormatRenderManifest } from "./inline_format_render_manifest.js";
import { nativeDocumentDefaultView } from "./html_host.js";
import { createToolbarManifest } from "./toolbar_manifest.js";
import type {
  WasmActionStateSnapshotView,
  WasmActionStateStringResultView,
  WasmActionStatesResultView,
} from "./wasm_action_state_adapter.js";
import {
  BreditorWasmCommandAdapter,
  type WasmCommandObservationView,
  type WasmCommandResultView,
  type WasmIntentResultView,
  type WasmSelectionResultView,
} from "./wasm_command_adapter.js";
import {
  BREDITOR_BROWSER_PACKAGE_VERSION,
  BREDITOR_WASM_ABI_VERSION,
  type WasmBootstrappedEngineView,
  type WasmCompiledProfileBootstrapResultView,
  type WasmCompiledProfileBootstrapView,
  type WasmEngineBootstrapFactoryView,
  type WasmEngineBootstrapModuleView,
  type WasmEngineBootstrapResultView,
  type WasmProjectionReadResultView,
} from "./wasm_engine_bootstrap.js";
import type {
  WasmCompiledProfileDescriptorView,
  WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";
import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
} from "./wasm_projection_adapter.js";
import type { SemanticSelectionView } from "./wasm_selection_adapter.js";
import type { WasmSessionCheckpointStringResultView } from "./wasm_session_checkpoint.js";

type VoidMock = ReturnType<typeof vi.fn<() => void>>;

const LINEAGE = "browser-editor-tests";
const STATE_ID = "breditor/control-bold";
const ACTION_ID = "breditor/toggle-strong";
const INTENT_ID = "breditor/format-strong";
const BINDING_ID = "breditor/format-strong-binding";
const BASE_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const PROFILE_SCHEMA = Object.freeze({
  name: "example/rich-document",
  version: 3,
  fingerprint: `sha256:${"6".repeat(64)}`,
});
const OTHER_PROFILE_SCHEMA = Object.freeze({
  name: "example/other-document",
  version: 4,
  fingerprint: `sha256:${"7".repeat(64)}`,
});
const PROFILE_FORMATS = Object.freeze([
  "breditor/strong",
  "example/highlight",
]);
const PROFILE_FORMAT_DESCRIPTORS = Object.freeze([
  Object.freeze({ kind: "breditor/strong", revision: 1 }),
  Object.freeze({ kind: "example/highlight", revision: 2 }),
]);
const PROFILE_BOOTSTRAP = Object.freeze({
  bootstrapJson:
    '{"format":"breditor/profile-bootstrap","formatVersion":1}',
});
const PROFILE_RENDERING = createInlineFormatRenderManifest({
  recipes: [
    {
      formatKind: "breditor/strong",
      element: "strong",
      before: ["example/highlight"],
    },
    {
      formatKind: "example/highlight",
      element: "mark",
      classes: ["breditor-highlight"],
    },
  ],
});
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
        kind: "intent",
        intentId: INTENT_ID,
      },
    },
  ],
});

interface EngineRecord {
  readonly rawFree: ReturnType<typeof vi.fn>;
  readonly observationFrees: ReturnType<typeof vi.fn>[];
  readonly executeNoInputAction: ReturnType<typeof vi.fn>;
  readonly executeNoInputIntent: ReturnType<typeof vi.fn>;
  readonly executeStringAction: ReturnType<typeof vi.fn>;
  readonly setRangeSelection: ReturnType<typeof vi.fn>;
  readonly closeHistoryGroup: ReturnType<typeof vi.fn>;
  readonly actionStates: ReturnType<typeof vi.fn>;
  readonly selection: ReturnType<typeof vi.fn>;
  readonly documentJson: ReturnType<typeof vi.fn>;
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
  readonly intentOutcome?: "committed" | "blocked" | "unhandled" | "malformed";
  readonly enableAction?: boolean;
  readonly enableStringAction?: boolean;
  readonly selectionOffset?: number;
  readonly onAction?: () => void;
  readonly onActionStateStatusRead?: () => void;
  readonly onDocumentJson?: () => void;
  readonly onEngineFree?: () => void;
  readonly onObservationFree?: () => void;
  readonly onProfileGenerationFree?: () => void;
  readonly documentJsonValue?: string;
  readonly documentJsonError?: Readonly<{ code: string; message: string }>;
}

interface ProfileSchemaFixture {
  readonly name: string;
  readonly version: number;
  readonly fingerprint: string;
}

interface ProfileFormatFixture {
  readonly kind: string;
  readonly revision: number;
}

interface ProfileModuleFixtureOptions {
  readonly text?: string;
  readonly schemasByCompilation?: readonly ProfileSchemaFixture[];
  readonly formatsByCompilation?: readonly (readonly ProfileFormatFixture[])[];
  readonly intentInputKind?: "none" | "typed";
  readonly onCreateEngine?: (compilationIndex: number) => void;
}

interface ProfileCompilationRecord {
  readonly schema: ProfileSchemaFixture;
  readonly formats: readonly ProfileFormatFixture[];
  readonly profileGeneration: ProfileGenerationFixture;
  readonly profileFree: VoidMock;
  readonly resultFree: VoidMock;
  readonly descriptorFrees: VoidMock[];
  readonly engineGenerations: ProfileGenerationFixture[];
  readonly createEngineFromDocumentJson: ReturnType<typeof vi.fn>;
  readonly createEngineFromSessionCheckpointJson: ReturnType<typeof vi.fn>;
}

interface ProfileModuleFixture {
  readonly module: WasmEngineBootstrapModuleView;
  readonly fromBootstrapJson: ReturnType<typeof vi.fn>;
  readonly legacyFromDocumentJson: ReturnType<typeof vi.fn>;
  readonly legacyFromSessionCheckpointJson: ReturnType<typeof vi.fn>;
  readonly compilations: ProfileCompilationRecord[];
  readonly engines: EngineRecord[];
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

  it.each([
    "article",
    "aside",
    "div",
    "footer",
    "header",
    "main",
    "nav",
    "section",
  ] as const)(
    "accepts a connected empty <%s> editing host",
    async (tagName) => {
      const host = document.createElement(tagName);
      document.body.append(host);
      const fixture = moduleFixture();

      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module),
      );

      expect(opened.ok).toBe(true);
      if (opened.ok) opened.editor.dispose();
    },
  );

  it("uses native host identity and topology despite own shadow properties", async () => {
    const fixture = moduleFixture();
    const disguisedInput = document.createElement("input");
    Object.defineProperty(disguisedInput, "tagName", {
      configurable: true,
      value: "DIV",
    });
    document.body.append(disguisedInput);

    const disconnected = document.createElement("div");
    Object.defineProperty(disconnected, "isConnected", {
      configurable: true,
      value: true,
    });

    const populated = mountHost();
    populated.append("application content");
    Object.defineProperty(populated, "childNodes", {
      configurable: true,
      value: Object.freeze({ length: 0 }),
    });

    const editorHost = mountHost();
    const disguisedToolbar = document.createElement("button");
    Object.defineProperty(disguisedToolbar, "tagName", {
      configurable: true,
      value: "DIV",
    });
    document.body.append(disguisedToolbar);

    for (const host of [disguisedInput, disconnected, populated]) {
      await expect(
        BreditorBrowserEditor.open(options(host, fixture.module)),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "browser_editor.invalid_options" },
      });
    }
    await expect(
      BreditorBrowserEditor.open(
        options(editorHost, fixture.module, {
          toolbar: { host: disguisedToolbar },
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
  });

  it("uses its private finalizer when startup aborts after full installation", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture();
    const controller = new AbortController();
    const abortedGetter = Object.getOwnPropertyDescriptor(
      AbortSignal.prototype,
      "aborted",
    )?.get;
    if (abortedGetter === undefined) throw new Error("AbortSignal getter missing");
    let reads = 0;
    vi.spyOn(AbortSignal.prototype, "aborted", "get").mockImplementation(
      function (this: AbortSignal): boolean {
        reads += 1;
        if (reads >= 4) controller.abort();
        return Reflect.apply(abortedGetter, this, []) as boolean;
      },
    );
    const patchedDispose = vi
      .spyOn(BreditorBrowserEditor.prototype, "dispose")
      .mockImplementation(() => {
        throw new Error("patched public dispose");
      });

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        signal: controller.signal,
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

  it("opens and renders one compiled V2 profile without an unnecessary persistence preflight", async () => {
    const host = mountHost();
    const fixture = profileModuleFixture({ text: "profile text" });
    const documentJson = profileDocumentJson("profile text", PROFILE_SCHEMA);

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson,
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
      }),
    );

    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error.code);
    expect(host.innerHTML).toBe(
      '<p><strong><mark class="breditor-highlight">profile text</mark></strong></p>',
    );
    expect(opened.editor.exportContent("documentJson")).toEqual({
      ok: true,
      format: "documentJson",
      value: documentJson,
      utf8Bytes: new TextEncoder().encode(documentJson).byteLength,
      snapshot: { lineage: LINEAGE, revision: "0" },
    });
    expect(opened.editor.exportContent("plainText")).toEqual({
      ok: true,
      format: "plainText",
      value: "profile text",
      utf8Bytes: 12,
      snapshot: { lineage: LINEAGE, revision: "0" },
    });
    expect(fixture.fromBootstrapJson).toHaveBeenCalledExactlyOnceWith(
      PROFILE_BOOTSTRAP.bootstrapJson,
    );
    expect(fixture.compilations).toHaveLength(1);
    expect(fixture.compilations[0]?.profileFree).toHaveBeenCalledOnce();
    expect(fixture.compilations[0]?.resultFree).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[0]?.engineGenerations[0]?.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[0]?.profileGeneration.freeSpy,
    ).not.toHaveBeenCalled();

    opened.editor.dispose();

    expect(
      fixture.compilations[0]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it("executes a declared no-input intent synchronously with provenance-redacted immutable output", async () => {
    const fixture = moduleFixture({ enableAction: true, text: "before" });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);

    const result = opened.editor.executeIntent(INTENT_ID);

    expect(result).toEqual({
      status: "committed",
      intentId: INTENT_ID,
      document: { lineage: LINEAGE, revision: "1" },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.document)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(BINDING_ID);
    expect(JSON.stringify(result)).not.toContain(ACTION_ID);
    expect(fixture.engines[0]?.closeHistoryGroup).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotRevision: "0" }),
      INTENT_ID,
    );
    expect(opened.editor.getSnapshot().document).toEqual(result.document);
    opened.editor.dispose();
  });

  it("preserves a committed intent result when disposal reenters its delivery", async () => {
    let editor: BreditorBrowserEditor | undefined;
    const fixture = moduleFixture({
      enableAction: true,
      text: "before",
      onAction: () => editor?.dispose(),
    });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    editor = opened.editor;

    const result = editor.executeIntent(INTENT_ID);

    expect(result).toEqual({
      status: "committed",
      intentId: INTENT_ID,
      document: { lineage: LINEAGE, revision: "1" },
    });
    expect(editor.getStatus()).toEqual({ phase: "disposed" });
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.rawFree).not.toHaveBeenCalled();
    await settleMicrotasks();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it("does not mask an uncertain intent submission when disposal reenters first", async () => {
    let editor: BreditorBrowserEditor | undefined;
    const fixture = moduleFixture({
      enableAction: true,
      onAction: () => {
        editor?.dispose();
        throw new Error("private uncertain delivery detail");
      },
    });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    editor = opened.editor;

    const result = editor.executeIntent(INTENT_ID);

    expect(result).toEqual({
      status: "failed",
      intentId: INTENT_ID,
      document: { lineage: LINEAGE, revision: "0" },
    });
    expect(JSON.stringify(result)).not.toContain("private uncertain");
    expect(editor.getStatus()).toEqual({ phase: "disposed" });
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.rawFree).not.toHaveBeenCalled();
    await settleMicrotasks();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it.each(["blocked", "unhandled"] as const)(
    "returns a redacted %s intent result without faulting or mutating",
    async (intentOutcome) => {
      const fixture = moduleFixture({ enableAction: true, intentOutcome });
      const opened = await BreditorBrowserEditor.open(
        options(mountHost(), fixture.module),
      );
      if (!opened.ok) throw new Error(opened.error.code);

      const result = opened.editor.executeIntent(INTENT_ID);

      expect(result).toEqual(
        intentOutcome === "blocked"
          ? {
              status: "blocked",
              intentId: INTENT_ID,
              reasonCode: "breditor/no-selection",
              activation: "inactive",
              document: { lineage: LINEAGE, revision: "0" },
            }
          : {
              status: "unhandled",
              intentId: INTENT_ID,
              document: { lineage: LINEAGE, revision: "0" },
            },
      );
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.document)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(BINDING_ID);
      expect(JSON.stringify(result)).not.toContain(ACTION_ID);
      expect(opened.editor.getStatus()).toEqual({ phase: "live" });
      expect(opened.editor.getSnapshot().document).toEqual({
        lineage: LINEAGE,
        revision: "0",
      });
      opened.editor.dispose();
    },
  );

  it("distinguishes invalid, unknown, typed-input, and unavailable intent rejection", async () => {
    const base = moduleFixture({ enableAction: true });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), base.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);

    expect(opened.editor.executeIntent("x" as never)).toMatchObject({
      status: "rejected",
      intentId: "",
      reason: "invalidIntent",
      document: { lineage: LINEAGE, revision: "0" },
    });
    expect(opened.editor.executeIntent(`x/${"a".repeat(256)}`)).toMatchObject({
      status: "rejected",
      intentId: "",
      reason: "invalidIntent",
    });
    expect(opened.editor.executeIntent("example/unknown")).toMatchObject({
      status: "rejected",
      intentId: "example/unknown",
      reason: "unknownIntent",
    });
    expect(base.engines[0]?.executeNoInputIntent).not.toHaveBeenCalled();
    opened.editor.dispose();
    expect(opened.editor.executeIntent(INTENT_ID)).toMatchObject({
      status: "rejected",
      intentId: INTENT_ID,
      reason: "unavailable",
      document: { lineage: LINEAGE, revision: "0" },
    });

    const profile = profileModuleFixture({ intentInputKind: "typed" });
    const typed = await BreditorBrowserEditor.open(
      options(mountHost(), profile.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson: profileDocumentJson("profile text", PROFILE_SCHEMA),
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
      }),
    );
    if (!typed.ok) throw new Error(`${typed.error.code}:${typed.error.causeCode}`);
    expect(typed.editor.executeIntent(INTENT_ID)).toMatchObject({
      status: "rejected",
      intentId: INTENT_ID,
      reason: "inputRequired",
      document: { lineage: LINEAGE, revision: "0" },
    });
    expect(profile.engines[0]?.executeNoInputIntent).not.toHaveBeenCalled();
    typed.editor.dispose();
  });

  it("rejects reentrant and authoritative-read intent admission as busy without queueing", async () => {
    let editor: BreditorBrowserEditor | undefined;
    let duringExecution: ReturnType<BreditorBrowserEditor["executeIntent"]> |
      undefined;
    let duringRead: ReturnType<BreditorBrowserEditor["executeIntent"]> |
      undefined;
    const fixture = moduleFixture({
      enableAction: true,
      onAction: () => {
        duringExecution = editor?.executeIntent(INTENT_ID);
      },
      onDocumentJson: () => {
        duringRead = editor?.executeIntent(INTENT_ID);
      },
    });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    editor = opened.editor;

    const committed = editor.executeIntent(INTENT_ID);
    expect(committed.status).toBe("committed");
    expect(duringExecution).toMatchObject({
      status: "rejected",
      reason: "busy",
    });
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();

    expect(editor.exportContent("documentJson")).toMatchObject({ ok: true });
    expect(duringRead).toMatchObject({
      status: "rejected",
      reason: "busy",
    });
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
    editor.dispose();
  });

  it("faults safely when an impossible intent result makes delivery uncertain", async () => {
    const fixture = moduleFixture({
      enableAction: true,
      intentOutcome: "malformed",
    });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);

    const result = opened.editor.executeIntent(INTENT_ID);

    expect(result).toEqual({
      status: "failed",
      intentId: INTENT_ID,
      document: { lineage: LINEAGE, revision: "0" },
    });
    expect(opened.editor.getStatus()).toEqual({
      phase: "faulted",
      reason: "queueUncertain",
    });
    opened.editor.dispose();
  });

  it("rejects a toolbar/profile contract mismatch before mutating either host", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture();
    const incompatible = createToolbarManifest({
      label: "Incompatible",
      controls: [
        {
          kind: "button",
          stateId: STATE_ID,
          label: "Concrete action",
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

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: incompatible },
      }),
    );

    expect(opened).toMatchObject({
      ok: false,
      error: { code: "browser_editor.toolbar_profile_invalid" },
    });
    expect(host.childNodes).toHaveLength(0);
    expect(host.attributes).toHaveLength(0);
    expect(toolbarHost.childNodes).toHaveLength(0);
    expect(toolbarHost.attributes).toHaveLength(0);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it("does not overwrite application content installed reentrantly during profile bootstrap", async () => {
    const host = mountHost();
    const fixture = profileModuleFixture({
      onCreateEngine: () => {
        host.append(document.createTextNode("application content"));
      },
    });

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson: profileDocumentJson("must not render", PROFILE_SCHEMA),
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
      }),
    );

    expect(opened).toEqual({
      ok: false,
      error: {
        code: "browser_editor.setup_failed",
        message: "The browser editor runtime could not be installed safely.",
      },
    });
    expect(host.textContent).toBe("application content");
    expect(host.attributes).toHaveLength(0);
    expect(fixture.engines).toHaveLength(1);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[0]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[0]?.engineGenerations[0]?.freeSpy,
    ).toHaveBeenCalledOnce();
  });

  it("rejects a render manifest when no compiled semantic profile is selected", async () => {
    const fixture = moduleFixture();

    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module, { rendering: PROFILE_RENDERING }),
    );

    expect(opened).toMatchObject({
      ok: false,
      error: { code: "browser_editor.invalid_options" },
    });
    expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
    expect(fixture.fromSessionCheckpointJson).not.toHaveBeenCalled();
  });

  it.each(["noOp", "throw"] as const)(
    "uses native focus proofs despite %s own focus and document shadows",
    async (mode) => {
      const host = mountHost();
      const opened = await BreditorBrowserEditor.open(
        options(host, moduleFixture().module),
      );
      if (!opened.ok) throw new Error(opened.error.code);
      const focusShadow = vi.fn(() => {
        if (mode === "throw") {
          throw new DOMException("own focus shadow ran", "InvalidStateError");
        }
      });
      Object.defineProperty(host, "focus", {
        configurable: true,
        value: focusShadow,
      });
      const ownerDocumentShadow = vi.fn(() => document);
      const activeElementDescriptor = Object.getOwnPropertyDescriptor(
        document,
        "activeElement",
      );

      try {
        expect(opened.editor.focus()).toBe(true);
        expect(document.activeElement).toBe(host);

        Object.defineProperty(host, "ownerDocument", {
          configurable: true,
          get: ownerDocumentShadow,
        });
        Object.defineProperty(document, "activeElement", {
          configurable: true,
          value: host,
        });
        expect(opened.editor.focus()).toBe(true);
        document.body.removeChild(host);

        // The own activeElement value still claims success, but the native
        // document getter proves that a detached host did not receive focus.
        expect(document.activeElement).toBe(host);
        expect(opened.editor.focus()).toBe(false);
        expect(focusShadow).not.toHaveBeenCalled();
        expect(ownerDocumentShadow).not.toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(host, "focus");
        Reflect.deleteProperty(host, "ownerDocument");
        if (activeElementDescriptor === undefined) {
          Reflect.deleteProperty(document, "activeElement");
        } else {
          Object.defineProperty(
            document,
            "activeElement",
            activeElementDescriptor,
          );
        }
        opened.editor.dispose();
      }
    },
  );

  it("exports exact Document V1 and semantic plain text without trusting hostile DOM", async () => {
    const host = mountHost();
    const fixture = moduleFixture({ text: "A💡" });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);

    const documentExport = opened.editor.exportContent("documentJson");
    const plainExport = opened.editor.exportContent("plainText");
    if (documentExport.ok) {
      const exactDocumentFormat: "documentJson" = documentExport.format;
      expect(exactDocumentFormat).toBe("documentJson");
    }
    if (plainExport.ok) {
      const exactPlainTextFormat: "plainText" = plainExport.format;
      expect(exactPlainTextFormat).toBe("plainText");
    }

    expect(documentExport).toMatchObject({
      ok: true,
      format: "documentJson",
      utf8Bytes: expect.any(Number),
      snapshot: { lineage: LINEAGE, revision: "0" },
    });
    expect(documentExport.ok && JSON.parse(documentExport.value)).toMatchObject(
      {
        format: "breditor/document",
        formatVersion: 1,
        root: { children: [{ children: [{ text: "A💡" }] }] },
      },
    );
    expect(plainExport).toEqual({
      ok: true,
      format: "plainText",
      value: "A💡",
      utf8Bytes: 5,
      snapshot: { lineage: LINEAGE, revision: "0" },
    });
    expect(Object.isFrozen(documentExport)).toBe(true);
    expect(documentExport.ok && Object.isFrozen(documentExport.snapshot)).toBe(
      true,
    );
    expect(Object.isFrozen(plainExport)).toBe(true);

    host.textContent = "forged private DOM";
    expect(opened.editor.exportContent("plainText")).toEqual(plainExport);
    expect(opened.editor.exportContent("documentJson")).toEqual(documentExport);
    expect(
      JSON.stringify(opened.editor.exportContent("plainText")),
    ).not.toContain("forged private DOM");
    opened.editor.dispose();
  });

  it("keeps legacy V1 HTML-only <b> paste admission when no profile is selected", async () => {
    const host = mountHost();
    const fixture = moduleFixture({
      text: "start",
      selectionOffset: 5,
      enableStringAction: true,
    });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const target = host.querySelector("p");
    if (!(target instanceof HTMLParagraphElement)) {
      throw new Error("rendered paragraph missing");
    }
    const clipboard = installNativeClipboardPaste("<p><b>bold</b></p>");
    try {
      target.dispatchEvent(clipboard.event);

      expect(clipboard.event.defaultPrevented).toBe(true);
      expect(clipboard.getData).toHaveBeenCalledExactlyOnceWith("text/html");
      expect(fixture.engines[0]?.setRangeSelection).toHaveBeenCalledOnce();
      expect(fixture.engines[0]?.closeHistoryGroup).toHaveBeenCalledOnce();
      expect(
        fixture.engines[0]?.executeStringAction,
      ).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ snapshotRevision: "0" }),
        "breditor/insert-plain-text",
        "bold",
      );
      expect(host.textContent).toBe("startbold");
      expect(opened.editor.getSnapshot().document).toEqual({
        lineage: LINEAGE,
        revision: "1",
      });
    } finally {
      clipboard.restore();
      opened.editor.dispose();
    }
  });

  it("keeps adapter accessors nonreplaceable and uses constructor-minted content ports", async () => {
    const prototype = BreditorWasmCommandAdapter.prototype;
    expect(Object.isFrozen(prototype)).toBe(true);
    expect(
      Reflect.defineProperty(prototype, "documentJsonReadPort", {
        configurable: true,
        get: () => {
          throw new Error("replacement must not install");
        },
      }),
    ).toBe(false);
    expect(
      Reflect.defineProperty(prototype, "plainTextReadPort", {
        configurable: true,
        get: () => {
          throw new Error("replacement must not install");
        },
      }),
    ).toBe(false);

    const fixture = moduleFixture({ text: "trusted" });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    expect(opened.editor.exportContent("plainText")).toMatchObject({
      ok: true,
      value: "trusted",
    });
    expect(opened.editor.exportContent("documentJson")).toMatchObject({
      ok: true,
      format: "documentJson",
    });
    opened.editor.dispose();
  });

  it("returns stable redacted failures for invalid formats, invalid Wasm, and disposal", async () => {
    const malformed = await BreditorBrowserEditor.open(
      options(
        mountHost(),
        moduleFixture({ documentJsonValue: "private malformed payload" })
          .module,
      ),
    );
    if (!malformed.ok) throw new Error(malformed.error.code);
    expect(malformed.editor.exportContent("documentJson")).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "content_export.invalid_wasm_view",
        message: "The Wasm document export was invalid.",
      },
    });
    expect(
      JSON.stringify(malformed.editor.exportContent("documentJson")),
    ).not.toContain("private malformed payload");
    expect(malformed.editor.exportContent("html" as never)).toEqual({
      ok: false,
      error: {
        kind: "request",
        code: "content_export.invalid_format",
        message: "The requested content export format is invalid.",
      },
    });
    malformed.editor.dispose();
    expect(malformed.editor.exportContent("plainText")).toEqual({
      ok: false,
      error: {
        kind: "lifecycle",
        code: "content_export.unavailable",
        message: "Authoritative editor content is unavailable.",
      },
    });

    const rejected = await BreditorBrowserEditor.open(
      options(
        mountHost(),
        moduleFixture({
          documentJsonError: {
            code: "codec.private_document_title",
            message: "private document contents must not escape",
          },
        }).module,
      ),
    );
    if (!rejected.ok) throw new Error(rejected.error.code);
    const coreFailure = rejected.editor.exportContent("documentJson");
    expect(coreFailure).toEqual({
      ok: false,
      error: {
        kind: "core",
        code: "content_export.core_rejected",
        message: "The Rust editor core could not export content.",
      },
    });
    expect(JSON.stringify(coreFailure)).not.toContain("private");
    rejected.editor.dispose();

    const substituted = await BreditorBrowserEditor.open(
      options(
        mountHost(),
        moduleFixture({
          text: "authoritative",
          documentJsonValue: documentJsonValue("different-valid-document"),
        }).module,
      ),
    );
    if (!substituted.ok) throw new Error(substituted.error.code);
    expect(substituted.editor.exportContent("documentJson")).toMatchObject({
      ok: false,
      error: { code: "content_export.invalid_wasm_view" },
    });
    substituted.editor.dispose();
  });

  it("discards a provisional export when generated code disposes reentrantly", async () => {
    const host = mountHost();
    let editor: BreditorBrowserEditor | undefined;
    const fixture = moduleFixture({
      text: "never escape",
      onDocumentJson: () => editor?.dispose(),
    });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    editor = opened.editor;

    const result = editor.exportContent("documentJson");

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "lifecycle",
        code: "content_export.unavailable",
        message: "Authoritative editor content is unavailable.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("never escape");
    expect(fixture.engines[0]?.rawFree).not.toHaveBeenCalled();
    await settleMicrotasks();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(host.childNodes).toHaveLength(0);
  });

  it("returns busy for a recursive content read without disturbing the outer export", async () => {
    const host = mountHost();
    let editor: BreditorBrowserEditor | undefined;
    let nested: unknown;
    const fixture = moduleFixture({
      text: "outer",
      onDocumentJson: () => {
        nested = editor?.exportContent("plainText");
      },
    });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    editor = opened.editor;

    const outer = editor.exportContent("documentJson");

    expect(nested).toMatchObject({
      ok: false,
      error: { code: "content_export.busy" },
    });
    expect(outer).toMatchObject({
      ok: true,
      format: "documentJson",
      snapshot: { lineage: LINEAGE, revision: "0" },
    });
    expect(editor.getStatus()).toEqual({ phase: "live" });
    editor.dispose();
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

  it("uses native host mutations and restores attributes despite own method shadows", async () => {
    const host = mountHost();
    const fixture = moduleFixture();
    const nativeGetAttribute = Element.prototype.getAttribute;
    const nativeHasAttribute = Element.prototype.hasAttribute;
    const nativeSetAttribute = Element.prototype.setAttribute;
    const readAttribute = (name: string): string | null =>
      Reflect.apply(nativeGetAttribute, host, [name]) as string | null;
    const hasAttribute = (name: string): boolean =>
      Reflect.apply(nativeHasAttribute, host, [name]) as boolean;
    Reflect.apply(nativeSetAttribute, host, ["contenteditable", "false"]);
    Reflect.apply(nativeSetAttribute, host, ["role", "group"]);
    Reflect.apply(nativeSetAttribute, host, ["aria-label", "Prior label"]);
    Reflect.apply(nativeSetAttribute, host, ["inert", ""]);

    const getAttributeShadow = vi.fn(() => {
      throw new DOMException("private host detail", "InvalidStateError");
    });
    const hasAttributeShadow = vi.fn(() => {
      throw new DOMException("private host detail", "InvalidStateError");
    });
    const setAttributeShadow = vi.fn(() => {
      throw new DOMException("private host detail", "InvalidStateError");
    });
    const removeAttributeShadow = vi.fn(() => {
      throw new DOMException("private host detail", "InvalidStateError");
    });
    Object.defineProperties(host, {
      getAttribute: { configurable: true, value: getAttributeShadow },
      hasAttribute: { configurable: true, value: hasAttributeShadow },
      setAttribute: { configurable: true, value: setAttributeShadow },
      removeAttribute: { configurable: true, value: removeAttributeShadow },
    });

    const result = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(readAttribute("contenteditable")).toBe("true");
    expect(readAttribute("role")).toBe("textbox");
    expect(readAttribute("aria-label")).toBe("Editor");
    expect(readAttribute("aria-multiline")).toBe("true");
    expect(readAttribute("aria-disabled")).toBe("false");
    expect(readAttribute("spellcheck")).toBe("true");
    expect(hasAttribute("inert")).toBe(false);
    expect(readAttribute("data-breditor-editor-root")).toBe("");
    expect(getAttributeShadow).not.toHaveBeenCalled();
    expect(hasAttributeShadow).not.toHaveBeenCalled();
    expect(setAttributeShadow).not.toHaveBeenCalled();
    expect(removeAttributeShadow).not.toHaveBeenCalled();

    const replaceChildrenShadow = vi.fn(() => {
      throw new DOMException("private host detail", "InvalidStateError");
    });
    Object.defineProperty(host, "replaceChildren", {
      configurable: true,
      value: replaceChildrenShadow,
    });
    result.editor.dispose();

    expect(readAttribute("contenteditable")).toBe("false");
    expect(readAttribute("role")).toBe("group");
    expect(readAttribute("aria-label")).toBe("Prior label");
    expect(hasAttribute("inert")).toBe(true);
    expect(readAttribute("aria-multiline")).toBeNull();
    expect(readAttribute("aria-disabled")).toBeNull();
    expect(readAttribute("spellcheck")).toBeNull();
    expect(readAttribute("data-breditor-editor-root")).toBeNull();
    expect(host.childNodes).toHaveLength(0);
    expect(getAttributeShadow).not.toHaveBeenCalled();
    expect(hasAttributeShadow).not.toHaveBeenCalled();
    expect(setAttributeShadow).not.toHaveBeenCalled();
    expect(removeAttributeShadow).not.toHaveBeenCalled();
    expect(replaceChildrenShadow).not.toHaveBeenCalled();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
  });

  it("rolls back render failure and ignores forged selection unavailability", async () => {
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
    const selectionResult = await BreditorBrowserEditor.open(
      options(selectionHost, selectionFixture.module),
    );

    expect(selectionResult.ok).toBe(true);
    expect(selectionApi).not.toHaveBeenCalled();
    expect(selectionHost.childNodes).toHaveLength(1);
    if (selectionResult.ok) selectionResult.editor.dispose();
    expect(selectionFixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    selectionApi.mockRestore();
    const selectionRetry = await BreditorBrowserEditor.open(
      options(selectionHost, moduleFixture().module),
    );
    expect(selectionRetry.ok).toBe(true);
    if (selectionRetry.ok) selectionRetry.editor.dispose();
  });

  it("preserves foreign DOM added after a failed initial render write", async () => {
    const host = mountHost();
    const hostWindow = nativeDocumentDefaultView(host.ownerDocument);
    if (hostWindow === null) throw new Error("test host has no window");
    const applicationNode = document.createElement("aside");
    applicationNode.textContent = "application content after render write";
    const fixture = moduleFixture({ text: "Breditor document text" });
    const original = Object.getOwnPropertyDescriptor(
      hostWindow,
      "MutationObserver",
    );
    try {
      Object.defineProperty(hostWindow, "MutationObserver", {
        configurable: true,
        value: class {
          observe(target: Node): void {
            (target as HTMLElement).append(applicationNode);
            throw new Error("observer failed after application reentry");
          }

          disconnect(): void {}

          takeRecords(): MutationRecord[] {
            return [];
          }
        },
      });
      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module),
      );

      expect(opened).toMatchObject({
        ok: false,
        error: {
          code: "browser_editor.initial_render_failed",
          causeCode: "renderer.dom_write_failed",
        },
      });
      expect(applicationNode.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(0);
      expect(host.textContent).toBe("application content after render write");
      expect(host.attributes).toHaveLength(0);
      expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
      expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(hostWindow, "MutationObserver");
      } else {
        Object.defineProperty(hostWindow, "MutationObserver", original);
      }
    }
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

  it("releases renderer ownership during failed startup without MutationObserver support", async () => {
    const host = mountHost();
    const hostWindow = nativeDocumentDefaultView(host.ownerDocument);
    if (hostWindow === null) throw new Error("test host has no window");
    const original = Object.getOwnPropertyDescriptor(
      hostWindow,
      "MutationObserver",
    );
    try {
      Object.defineProperty(hostWindow, "MutationObserver", {
        configurable: true,
        value: class {
          constructor() {
            throw new Error("observer unavailable");
          }
        },
      });
      const failed = await BreditorBrowserEditor.open(
        options(host, moduleFixture({ actionStateThrows: true }).module),
      );
      expect(failed).toMatchObject({
        ok: false,
        error: { code: "browser_editor.action_state_failed" },
      });
      expect(host.childNodes).toHaveLength(0);

      const retry = await BreditorBrowserEditor.open(
        options(host, moduleFixture().module),
      );
      expect(retry.ok).toBe(true);
      if (retry.ok) retry.editor.dispose();
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(hostWindow, "MutationObserver");
      } else {
        Object.defineProperty(hostWindow, "MutationObserver", original);
      }
    }
  });

  it.each(["engine", "profileGeneration", "observation"] as const)(
    "does not erase DOM injected by a hostile %s cleanup during failed startup",
    async (owner) => {
      const host = mountHost();
      const inject = vi.fn(() => {
        host.append(
          document.createTextNode(`application content from ${owner} cleanup`),
        );
      });
      const callbacks: Partial<ModuleFixtureOptions> =
        owner === "engine"
          ? { onEngineFree: inject }
          : owner === "profileGeneration"
            ? { onProfileGenerationFree: inject }
            : { onObservationFree: inject };
      const fixture = moduleFixture({
        actionStateThrows: true,
        ...callbacks,
      });

      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module),
      );

      expect(opened).toMatchObject({
        ok: false,
        error: { code: "browser_editor.action_state_failed" },
      });
      expect(inject).toHaveBeenCalledOnce();
      expect(host.textContent).toBe(
        `application content from ${owner} cleanup`,
      );
      expect(host.attributes).toHaveLength(0);
      expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
      expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();

      host.replaceChildren();
      const retry = await BreditorBrowserEditor.open(
        options(host, moduleFixture().module),
      );
      expect(retry.ok).toBe(true);
      if (retry.ok) retry.editor.dispose();
    },
  );

  it.each(["editor", "toolbar"] as const)(
    "re-proves the %s mount after a hostile initial action-state getter reenters",
    async (target) => {
      const host = mountHost();
      const toolbarHost = mountHost();
      const applicationEditorNode = document.createElement("aside");
      applicationEditorNode.textContent = "application editor content";
      let injected = false;
      const onActionStateStatusRead = vi.fn(() => {
        if (injected) return;
        injected = true;
        if (target === "editor") {
          host.append(applicationEditorNode);
        } else {
          toolbarHost.append(document.createTextNode("application toolbar content"));
        }
      });
      const fixture = moduleFixture({ onActionStateStatusRead });

      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module, {
          toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        }),
      );

      expect(opened).toEqual({
        ok: false,
        error: {
          code: "browser_editor.setup_failed",
          message: "The browser editor runtime could not be installed safely.",
        },
      });
      expect(onActionStateStatusRead).toHaveBeenCalled();
      expect(host.querySelectorAll("p")).toHaveLength(0);
      expect(applicationEditorNode.parentElement).toBe(
        target === "editor" ? host : null,
      );
      expect(host.textContent).toBe(
        target === "editor" ? "application editor content" : "",
      );
      expect(toolbarHost.textContent).toBe(
        target === "toolbar" ? "application toolbar content" : "",
      );
      expect(host.attributes).toHaveLength(0);
      expect(toolbarHost.attributes).toHaveLength(0);
      expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
      expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
    },
  );

  it("removes only the owned toolbar root when toolbar construction adds a foreign sibling", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const foreignSibling = document.createElement("aside");
    foreignSibling.textContent = "application toolbar sibling";
    const fixture = moduleFixture();
    const originalGetSnapshot =
      BreditorActionStateStore.prototype.getSnapshot;
    const injectDuringToolbarRefresh = vi
      .spyOn(BreditorActionStateStore.prototype, "getSnapshot")
      .mockImplementation(function (this: BreditorActionStateStore) {
        const snapshot = Reflect.apply(originalGetSnapshot, this, []);
        if (
          foreignSibling.parentElement === null &&
          toolbarHost.querySelector("[data-breditor-toolbar-root]") !== null
        ) {
          toolbarHost.append(foreignSibling);
        }
        return snapshot;
      });

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );

    expect(opened).toMatchObject({
      ok: false,
      error: { code: "browser_editor.setup_failed" },
    });
    expect(injectDuringToolbarRefresh).toHaveBeenCalled();
    expect(foreignSibling.parentElement).toBe(toolbarHost);
    expect([...toolbarHost.childNodes]).toEqual(
      expect.arrayContaining([foreignSibling]),
    );
    expect(
      toolbarHost.querySelector("[data-breditor-toolbar-root]"),
    ).toBeNull();
    expect(host.childNodes).toHaveLength(0);
    expect(host.attributes).toHaveLength(0);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
  });

  it("preserves an installed host attribute changed by a hostile initial action-state getter", async () => {
    const host = mountHost();
    host.setAttribute("contenteditable", "false");
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "prior label");
    let injected = false;
    const fixture = moduleFixture({
      onActionStateStatusRead: () => {
        if (injected) return;
        injected = true;
        host.setAttribute("aria-label", "application replacement");
      },
    });

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );

    expect(opened).toMatchObject({
      ok: false,
      error: { code: "browser_editor.setup_failed" },
    });
    expect(host.childNodes).toHaveLength(0);
    expect(host.getAttribute("contenteditable")).toBe("false");
    expect(host.getAttribute("role")).toBe("group");
    expect(host.getAttribute("aria-label")).toBe("application replacement");
    expect(host.hasAttribute("aria-multiline")).toBe(false);
    expect(host.hasAttribute("aria-disabled")).toBe(false);
    expect(host.hasAttribute("spellcheck")).toBe(false);
    expect(host.hasAttribute("data-breditor-editor-root")).toBe(false);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();

    const retry = await BreditorBrowserEditor.open(
      options(host, moduleFixture().module),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) retry.editor.dispose();
    expect(host.getAttribute("aria-label")).toBe("application replacement");
  });

  it("does not overwrite DOM added by a customized built-in host during attribute installation", async () => {
    const elementName = "breditor-alpha6-dom-host";
    const applicationNode = document.createElement("aside");
    applicationNode.textContent = "application content from attribute callback";
    class ReentrantEditorHost extends HTMLDivElement {
      static readonly observedAttributes = ["contenteditable"];

      attributeChangedCallback(
        _name: string,
        _prior: string | null,
        value: string | null,
      ): void {
        if (value === "true" && applicationNode.parentElement === null) {
          this.append(applicationNode);
        }
      }
    }
    window.customElements.define(elementName, ReentrantEditorHost, {
      extends: "div",
    });
    const host = document.createElement("div", {
      is: elementName,
    }) as HTMLDivElement;
    document.body.append(host);
    const fixture = moduleFixture();

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );
    const applicationNodeParentAfterOpen = applicationNode.parentElement;
    if (opened.ok) opened.editor.dispose();

    expect(opened).toMatchObject({
      ok: false,
      error: { code: "browser_editor.setup_failed" },
    });
    expect(applicationNodeParentAfterOpen).toBe(host);
    expect(host.querySelectorAll("p")).toHaveLength(0);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
  });

  it("preserves an attribute replaced during partial customized-host installation", async () => {
    const elementName = "breditor-alpha6-attribute-host";
    class ReentrantEditorHost extends HTMLDivElement {
      static readonly observedAttributes = ["role"];

      attributeChangedCallback(
        _name: string,
        _prior: string | null,
        value: string | null,
      ): void {
        if (value === "textbox") this.setAttribute("role", "application");
      }
    }
    window.customElements.define(elementName, ReentrantEditorHost, {
      extends: "div",
    });
    const host = document.createElement("div", {
      is: elementName,
    }) as HTMLDivElement;
    document.body.append(host);
    const fixture = moduleFixture();

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module),
    );

    expect(opened).toMatchObject({
      ok: false,
      error: { code: "browser_editor.setup_failed" },
    });
    expect(host.getAttribute("role")).toBe("application");
    expect(host.hasAttribute("contenteditable")).toBe(false);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
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
    expect(fixture.engines[0]?.executeNoInputIntent).not.toHaveBeenCalled();
    result.editor.dispose();
  });

  it("dispatches an expandable toolbar intent through the queue, updates projection/state, and flushes it", async () => {
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
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotRevision: "0" }),
      INTENT_ID,
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
          {
            id: "breditor/control-redo",
            availability: "disabled",
            activation: "stateless",
          },
          {
            id: "breditor/control-undo",
            availability: "disabled",
            activation: "stateless",
          },
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
    const legacyRecord = await rawCheckpointRecord(
      indexedDB,
      SESSION_CHECKPOINT_SLOT,
    );
    expect(legacyRecord).toMatchObject({
      format: "breditor/indexeddb-session-checkpoint",
      formatVersion: 1,
      slot: SESSION_CHECKPOINT_SLOT,
      checkpointJson: checkpointJson(LINEAGE, 1),
    });
    expect(Object.keys(legacyRecord as object).sort()).toEqual([
      "checkpointJson",
      "checkpointSha256",
      "checkpointUtf8Bytes",
      "format",
      "formatVersion",
      "generation",
      "slot",
    ]);
    verifier.close();

    editor.dispose();
    expect(toolbarHost.childNodes).toHaveLength(0);
    expect(host.childNodes).toHaveLength(0);
    expect(editor.getSnapshot().actionState.status).toBe("disposed");
    expect(editor.getSnapshot().persistence).toMatchObject({
      phase: "disposed",
    });
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.observationFrees).toHaveLength(3);
    expect(
      fixture.engines[0]?.observationFrees.every(
        (free) => free.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it.each(["blocked", "unhandled"] as const)(
    "treats a successfully delivered %s toolbar intent route as completed",
    async (intentOutcome) => {
      const host = mountHost();
      const toolbarHost = mountHost();
      const fixture = moduleFixture({ enableAction: true, intentOutcome });
      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module, {
          toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        }),
      );
      if (!opened.ok) throw new Error(opened.error.code);
      const button = toolbarHost.querySelector("button");
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("toolbar missing");
      }

      button.click();

      expect(opened.editor.getStatus()).toEqual({ phase: "live" });
      expect(opened.editor.getSnapshot().document).toEqual({
        lineage: LINEAGE,
        revision: "0",
      });
      expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
      expect(toolbarHost.querySelector("button")).toBe(button);
      opened.editor.dispose();
    },
  );

  it("uses the V2 schema fingerprint slot without reading or replacing legacy current", async () => {
    const indexedDB = new IDBFactory();
    const crypto = digestFixture();
    const legacyStore = new IndexedDbSessionCheckpointStore({ indexedDB, crypto });
    const legacyEmpty = await legacyStore.load();
    if (!legacyEmpty.ok) throw new Error(legacyEmpty.error.code);
    expect(
      (await legacyStore.save(legacyEmpty.token, checkpointJson("legacy", 0))).ok,
    ).toBe(true);
    legacyStore.close();
    const legacyBefore = await rawCheckpointRecord(
      indexedDB,
      SESSION_CHECKPOINT_SLOT,
    );

    const profileBinding = profileCheckpointBinding(
      PROFILE_SCHEMA.fingerprint,
      PROFILE_SCHEMA.fingerprint,
    );
    await seedCheckpoint(
      indexedDB,
      crypto,
      profileBinding,
      profileCheckpointJson(LINEAGE, 0, "restored profile", PROFILE_SCHEMA),
    );
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = profileModuleFixture();

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson: profileDocumentJson("fresh fallback", PROFILE_SCHEMA),
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        persistence: {
          indexedDB,
          crypto,
          autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
        },
      }),
    );
    if (!opened.ok) throw new Error(`${opened.error.code}:${opened.error.causeCode}`);
    expect(host.textContent).toBe("restored profile");
    expect(fixture.fromBootstrapJson).toHaveBeenCalledTimes(2);
    expect(
      fixture.compilations[0]?.createEngineFromDocumentJson,
    ).not.toHaveBeenCalled();
    expect(
      fixture.compilations[0]?.createEngineFromSessionCheckpointJson,
    ).not.toHaveBeenCalled();
    expect(
      fixture.compilations[1]?.createEngineFromDocumentJson,
    ).not.toHaveBeenCalled();
    expect(
      fixture.compilations[1]?.createEngineFromSessionCheckpointJson,
    ).toHaveBeenCalledOnce();

    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("toolbar missing");
    button.click();
    await expect(opened.editor.flushPersistence()).resolves.toEqual({
      status: "committed",
    });

    const stored = await rawCheckpointRecord(
      indexedDB,
      PROFILE_SCHEMA.fingerprint,
    );
    expect(stored).toMatchObject({
      format: "breditor/indexeddb-session-checkpoint",
      formatVersion: 2,
      slot: PROFILE_SCHEMA.fingerprint,
      schemaFingerprint: PROFILE_SCHEMA.fingerprint,
      checkpointFormatVersion: 2,
      checkpointJson: profileCheckpointJson(
        LINEAGE,
        1,
        "after",
        PROFILE_SCHEMA,
      ),
    });
    expect(await rawCheckpointRecord(indexedDB, SESSION_CHECKPOINT_SLOT)).toEqual(
      legacyBefore,
    );

    opened.editor.dispose();
  });

  it("restores two caller-named V2 slots independently in one database", async () => {
    const indexedDB = new IDBFactory();
    const crypto = digestFixture();
    const firstBinding = profileCheckpointBinding(
      "profile.first",
      PROFILE_SCHEMA.fingerprint,
    );
    const secondBinding = profileCheckpointBinding(
      "profile.second",
      PROFILE_SCHEMA.fingerprint,
    );
    await seedCheckpoint(
      indexedDB,
      crypto,
      firstBinding,
      profileCheckpointJson("first", 0, "first slot", PROFILE_SCHEMA),
    );
    await seedCheckpoint(
      indexedDB,
      crypto,
      secondBinding,
      profileCheckpointJson("second", 0, "second slot", PROFILE_SCHEMA),
    );
    const firstBefore = await rawCheckpointRecord(indexedDB, firstBinding.slot);
    const secondBefore = await rawCheckpointRecord(indexedDB, secondBinding.slot);

    for (const [slot, lineage, expectedText] of [
      [firstBinding.slot, "first", "first slot"],
      [secondBinding.slot, "second", "second slot"],
    ] as const) {
      const host = mountHost();
      const fixture = profileModuleFixture();
      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module, {
          initialDocument: {
            lineageId: "fallback",
            documentJson: profileDocumentJson("fallback", PROFILE_SCHEMA),
            historyCapacity: 100,
          },
          semanticProfile: PROFILE_BOOTSTRAP,
          rendering: PROFILE_RENDERING,
          persistence: {
            indexedDB,
            crypto,
            scope: { kind: "slot", name: slot },
          },
        }),
      );
      if (!opened.ok) throw new Error(`${opened.error.code}:${opened.error.causeCode}`);
      expect(host.textContent).toBe(expectedText);
      expect(opened.editor.getSnapshot().document).toEqual({
        lineage,
        revision: "0",
      });
      expect(
        fixture.compilations[1]?.createEngineFromSessionCheckpointJson,
      ).toHaveBeenCalledOnce();
      opened.editor.dispose();
    }

    expect(await rawCheckpointRecord(indexedDB, firstBinding.slot)).toEqual(
      firstBefore,
    );
    expect(await rawCheckpointRecord(indexedDB, secondBinding.slot)).toEqual(
      secondBefore,
    );
  });

  it("preserves a caller slot on profile-binding mismatch without engine bootstrap or digest", async () => {
    const indexedDB = new IDBFactory();
    const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, data: BufferSource) =>
      pseudoDigest(data));
    const crypto: Pick<SubtleCrypto, "digest"> = { digest };
    const slot = "profile.shared";
    await seedCheckpoint(
      indexedDB,
      crypto,
      profileCheckpointBinding(slot, OTHER_PROFILE_SCHEMA.fingerprint),
      profileCheckpointJson(
        "preserved",
        0,
        "retained evidence",
        OTHER_PROFILE_SCHEMA,
      ),
    );
    const before = await rawCheckpointRecord(indexedDB, slot);
    digest.mockClear();
    const host = mountHost();
    const fixture = profileModuleFixture();

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson: profileDocumentJson("must not open", PROFILE_SCHEMA),
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
        persistence: {
          indexedDB,
          crypto,
          scope: { kind: "slot", name: slot },
        },
      }),
    );

    expect(opened).toEqual({
      ok: false,
      error: {
        code: "browser_editor.persistence_load_failed",
        message: "The persisted session checkpoint could not be loaded safely.",
        causeCode: "session_checkpoint.binding_mismatch",
      },
    });
    expect(fixture.fromBootstrapJson).toHaveBeenCalledOnce();
    expect(fixture.compilations).toHaveLength(1);
    expect(
      fixture.compilations[0]?.createEngineFromDocumentJson,
    ).not.toHaveBeenCalled();
    expect(
      fixture.compilations[0]?.createEngineFromSessionCheckpointJson,
    ).not.toHaveBeenCalled();
    expect(fixture.engines).toHaveLength(0);
    expect(
      fixture.compilations[0]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(fixture.compilations[0]?.profileFree).toHaveBeenCalledOnce();
    expect(fixture.compilations[0]?.resultFree).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[0]?.descriptorFrees.every(
        (free) => free.mock.calls.length === 1,
      ),
    ).toBe(true);
    expect(digest).not.toHaveBeenCalled();
    expect(await rawCheckpointRecord(indexedDB, slot)).toEqual(before);
    expect(host.childNodes).toHaveLength(0);
    expect(host.attributes).toHaveLength(0);
  });

  it("rejects post-preflight schema drift, frees final owners, and leaves both slots empty", async () => {
    const indexedDB = new IDBFactory();
    const crypto = digestFixture();
    const host = mountHost();
    const fixture = profileModuleFixture({
      schemasByCompilation: [PROFILE_SCHEMA, OTHER_PROFILE_SCHEMA],
    });

    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson: profileDocumentJson("drifted", OTHER_PROFILE_SCHEMA),
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
        persistence: { indexedDB, crypto },
      }),
    );

    expect(opened).toEqual({
      ok: false,
      error: {
        code: "browser_editor.engine_bootstrap_failed",
        message: "The Rust editor engine could not be initialized safely.",
        causeCode: "engine_bootstrap.profile_changed_after_preflight",
      },
    });
    expect(fixture.fromBootstrapJson).toHaveBeenCalledTimes(2);
    expect(fixture.engines).toHaveLength(1);
    expect(
      fixture.compilations[0]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[1]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[1]?.engineGenerations[0]?.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.compilations.every(
        (compilation) =>
          compilation.profileFree.mock.calls.length === 1 &&
          compilation.resultFree.mock.calls.length === 1 &&
          compilation.descriptorFrees.every(
            (free) => free.mock.calls.length === 1,
          ),
      ),
    ).toBe(true);
    expect(fixture.engines[0]?.observationFrees[0]).toHaveBeenCalledOnce();
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(
      await rawCheckpointRecord(indexedDB, PROFILE_SCHEMA.fingerprint),
    ).toBeUndefined();
    expect(
      await rawCheckpointRecord(indexedDB, OTHER_PROFILE_SCHEMA.fingerprint),
    ).toBeUndefined();
    expect(host.childNodes).toHaveLength(0);
    expect(host.attributes).toHaveLength(0);
  });

  it("rejects post-preflight format revision drift under the same schema fingerprint", async () => {
    const indexedDB = new IDBFactory();
    const crypto = digestFixture();
    const fixture = profileModuleFixture({
      formatsByCompilation: [
        PROFILE_FORMAT_DESCRIPTORS,
        [
          PROFILE_FORMAT_DESCRIPTORS[0]!,
          { kind: "example/highlight", revision: 3 },
        ],
      ],
    });

    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module, {
        initialDocument: {
          lineageId: LINEAGE,
          documentJson: profileDocumentJson("drifted", PROFILE_SCHEMA),
          historyCapacity: 100,
        },
        semanticProfile: PROFILE_BOOTSTRAP,
        rendering: PROFILE_RENDERING,
        persistence: { indexedDB, crypto },
      }),
    );

    expect(opened).toMatchObject({
      ok: false,
      error: {
        code: "browser_editor.engine_bootstrap_failed",
        causeCode: "engine_bootstrap.profile_changed_after_preflight",
      },
    });
    expect(fixture.fromBootstrapJson).toHaveBeenCalledTimes(2);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[0]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      fixture.compilations[1]?.profileGeneration.freeSpy,
    ).toHaveBeenCalledOnce();
    expect(
      await rawCheckpointRecord(indexedDB, PROFILE_SCHEMA.fingerprint),
    ).toBeUndefined();
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
    expect(opened.editor.exportContent("plainText")).toEqual({
      ok: true,
      format: "plainText",
      value: "after",
      utf8Bytes: 5,
      snapshot: { lineage: LINEAGE, revision: "1" },
    });
    expect(opened.editor.exportContent("documentJson")).toMatchObject({
      ok: true,
      format: "documentJson",
      snapshot: { lineage: LINEAGE, revision: "1" },
    });

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

    expect(opened.editor.exportContent("documentJson")).toMatchObject({
      ok: false,
      error: { code: "content_export.busy" },
    });
    expect(opened.editor.exportContent("plainText")).toMatchObject({
      ok: false,
      error: { code: "content_export.busy" },
    });

    button.click();

    expect(opened.editor.getStatus()).toEqual({ phase: "live" });
    expect(opened.editor.getSnapshot()).toMatchObject({
      document: { lineage: LINEAGE, revision: "0" },
      actionState: { status: "fresh" },
      actions: { snapshot: { lineage: LINEAGE, revision: "0" } },
    });
    expect(fixture.engines[0]?.executeNoInputIntent).not.toHaveBeenCalled();
    opened.editor.dispose();
  });

  it("rejects public intent delivery during composition and admits it after settlement", async () => {
    const host = mountHost();
    const scheduled: Array<() => void> = [];
    const fixture = moduleFixture({
      enableAction: true,
      enableStringAction: true,
      text: "before",
    });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        scheduleTask: (callback) => scheduled.push(callback),
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const paragraph = host.firstElementChild;
    const text = paragraph?.firstChild;
    if (!(paragraph instanceof HTMLParagraphElement) || !(text instanceof Text)) {
      throw new Error("composition fixture is unavailable");
    }
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 1);
    const selection = window.getSelection();
    if (selection === null) throw new Error("DOM selection is unavailable");
    selection.removeAllRanges();
    selection.addRange(range);
    paragraph.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );

    expect(opened.editor.executeIntent(INTENT_ID)).toMatchObject({
      status: "rejected",
      reason: "busy",
      document: { lineage: LINEAGE, revision: "0" },
    });
    expect(fixture.engines[0]?.executeNoInputIntent).not.toHaveBeenCalled();

    paragraph.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    expect(scheduled).toHaveLength(1);
    scheduled.shift()?.();

    const afterSettlement = opened.editor.executeIntent(INTENT_ID);
    expect(afterSettlement).toEqual({
      status: "committed",
      intentId: INTENT_ID,
      document: { lineage: LINEAGE, revision: "1" },
    });
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
    opened.editor.dispose();
  });

  it("reports intent admission as unavailable after reconciliation becomes required", async () => {
    const fixture = moduleFixture({ enableAction: true });
    const opened = await BreditorBrowserEditor.open(
      options(mountHost(), fixture.module),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    vi.spyOn(BreditorDomRenderer.prototype, "update").mockImplementationOnce(
      () => {
        throw new DOMException("private render failure", "InvalidStateError");
      },
    );

    expect(opened.editor.executeIntent(INTENT_ID)).toMatchObject({
      status: "failed",
      document: { lineage: LINEAGE, revision: "1" },
    });

    expect(opened.editor.executeIntent(INTENT_ID)).toMatchObject({
      status: "rejected",
      reason: "unavailable",
      document: { lineage: LINEAGE, revision: "1" },
    });
    expect(fixture.engines[0]?.executeNoInputIntent).toHaveBeenCalledOnce();
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
    expect(opened.editor.exportContent("documentJson")).toMatchObject({
      ok: false,
      error: { code: "content_export.unavailable" },
    });
    opened.editor.dispose();
    opened.editor.dispose();
    expect(host.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(host.getAttribute("aria-disabled")).toBe("false");
    expect(host.hasAttribute("inert")).toBe(false);
    expect(fixture.engines[0]?.rawFree).toHaveBeenCalledOnce();
  });

  it.each(["noOp", "throw"] as const)(
    "uses native blur to quiesce a faulted host despite %s own focus shadows",
    async (mode) => {
      const host = mountHost();
      const toolbarHost = mountHost();
      const fixture = moduleFixture({ enableAction: true, actionThrows: true });
      const opened = await BreditorBrowserEditor.open(
        options(host, fixture.module, {
          toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        }),
      );
      if (!opened.ok) throw new Error(opened.error.code);
      const button = toolbarHost.querySelector("button");
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("toolbar missing");
      }
      expect(opened.editor.focus()).toBe(true);
      expect(document.activeElement).toBe(host);

      const blurShadow = vi.fn(() => {
        if (mode === "throw") {
          throw new DOMException("own blur shadow ran", "InvalidStateError");
        }
      });
      const ownerDocumentShadow = vi.fn(() => document);
      const activeElementDescriptor = Object.getOwnPropertyDescriptor(
        document,
        "activeElement",
      );
      Object.defineProperties(host, {
        blur: { configurable: true, value: blurShadow },
        ownerDocument: {
          configurable: true,
          get: ownerDocumentShadow,
        },
      });
      Object.defineProperty(document, "activeElement", {
        configurable: true,
        value: host,
      });

      try {
        button.click();
      } finally {
        Reflect.deleteProperty(host, "blur");
        Reflect.deleteProperty(host, "ownerDocument");
        if (activeElementDescriptor === undefined) {
          Reflect.deleteProperty(document, "activeElement");
        } else {
          Object.defineProperty(
            document,
            "activeElement",
            activeElementDescriptor,
          );
        }
      }

      expect(opened.editor.getStatus()).toEqual({
        phase: "faulted",
        reason: "toolbarDispatchFailed",
      });
      expect(document.activeElement).not.toBe(host);
      expect(blurShadow).not.toHaveBeenCalled();
      expect(ownerDocumentShadow).not.toHaveBeenCalled();
      expect(host.getAttribute("contenteditable")).toBe("false");
      expect(host.getAttribute("aria-disabled")).toBe("true");
      expect(host.hasAttribute("inert")).toBe(true);
      opened.editor.dispose();
    },
  );

  it("faults on toolbar presentation loss and refreshes a committed diagnostic snapshot", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    let button: HTMLButtonElement | undefined;
    const fixture = moduleFixture({
      enableAction: true,
      text: "before",
      onAction: () => button?.remove(),
    });
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const installedButton = toolbarHost.querySelector("button");
    if (!(installedButton instanceof HTMLButtonElement))
      throw new Error("toolbar missing");
    button = installedButton;
    button.focus();

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

  it.each(["noOp", "throw"] as const)(
    "uses native AbortSignal state/listeners despite %s own shadows",
    async (mode) => {
      const host = mountHost();
      const fixture = moduleFixture();
      const request = {} as IDBOpenDBRequest;
      const open = vi.fn(() => request);
      const hangingFactory = { open } as unknown as IDBFactory;
      const controller = new AbortController();
      const abortedShadow = vi.fn(() => {
        if (mode === "throw") {
          throw new DOMException("own aborted shadow ran", "InvalidStateError");
        }
        return false;
      });
      const addShadow = vi.fn(() => {
        if (mode === "throw") {
          throw new DOMException("own add shadow ran", "InvalidStateError");
        }
      });
      const removeShadow = vi.fn(() => {
        if (mode === "throw") {
          throw new DOMException("own remove shadow ran", "InvalidStateError");
        }
      });
      Object.defineProperties(controller.signal, {
        aborted: { configurable: true, get: abortedShadow },
        addEventListener: { configurable: true, value: addShadow },
        removeEventListener: { configurable: true, value: removeShadow },
      });
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
      expect(abortedShadow).not.toHaveBeenCalled();
      expect(addShadow).not.toHaveBeenCalled();
      expect(removeShadow).not.toHaveBeenCalled();
      expect(fixture.fromDocumentJson).not.toHaveBeenCalled();
      expect(host.attributes).toHaveLength(0);
      expect(host.childNodes).toHaveLength(0);

      const retry = await BreditorBrowserEditor.open(
        options(host, moduleFixture().module),
      );
      expect(retry.ok).toBe(true);
      if (retry.ok) retry.editor.dispose();
    },
  );

  it("makes a retained startup abort callback inert after storage transfers", async () => {
    const host = mountHost();
    const toolbarHost = mountHost();
    const fixture = moduleFixture({ enableAction: true });
    const controller = new AbortController();
    const signalEventTargetPrototype = Object.getPrototypeOf(
      AbortSignal.prototype,
    ) as EventTarget;
    const originalRemove = signalEventTargetPrototype.removeEventListener;
    vi.spyOn(signalEventTargetPrototype, "removeEventListener")
      .mockImplementation(
        function (
          this: EventTarget,
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | EventListenerOptions,
        ): void {
          if (this === controller.signal && type === "abort") return;
          Reflect.apply(originalRemove, this, [type, listener, options]);
        },
      );
    const opened = await BreditorBrowserEditor.open(
      options(host, fixture.module, {
        signal: controller.signal,
        toolbar: { host: toolbarHost, manifest: TOOLBAR_MANIFEST },
        persistence: {
          indexedDB: new IDBFactory(),
          crypto: digestFixture(),
          autosave: { delayMs: 60_000, maxLatencyMs: 60_000 },
        },
      }),
    );
    if (!opened.ok) throw new Error(opened.error.code);
    const button = toolbarHost.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("toolbar missing");
    }

    controller.abort();
    button.click();

    expect(opened.editor.getStatus()).toEqual({ phase: "live" });
    await expect(opened.editor.flushPersistence()).resolves.toEqual({
      status: "committed",
    });
    opened.editor.dispose();
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
    const unsupportedHosts = ["button", "input", "p", "span", "textarea"].map(
      (tagName) => {
        const host = document.createElement(tagName);
        document.body.append(host);
        return host;
      },
    );

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
    for (const unsupportedHost of unsupportedHosts) {
      await expect(
        BreditorBrowserEditor.open(options(unsupportedHost, fixture.module)),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "browser_editor.invalid_options" },
      });
    }
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
      breditorVersion: () => BREDITOR_BROWSER_PACKAGE_VERSION,
    },
    fromDocumentJson,
    fromSessionCheckpointJson,
    engines,
  };
}

class ProfileGenerationFixture implements WasmProfileGenerationView {
  readonly freeSpy = vi.fn<() => void>();

  constructor(readonly token: object) {}

  matches(other: WasmProfileGenerationView): boolean {
    return (
      other instanceof ProfileGenerationFixture && other.token === this.token
    );
  }

  free(): void {
    this.freeSpy();
  }
}

function profileModuleFixture(
  config: ProfileModuleFixtureOptions = {},
): ProfileModuleFixture {
  const compilations: ProfileCompilationRecord[] = [];
  const engines: EngineRecord[] = [];
  const legacyFromDocumentJson = vi.fn((): WasmEngineBootstrapResultView => {
    throw new Error("legacy document bootstrap must not run");
  });
  const legacyFromSessionCheckpointJson = vi.fn(
    (): WasmEngineBootstrapResultView => {
      throw new Error("legacy checkpoint bootstrap must not run");
    },
  );
  const fromBootstrapJson = vi.fn(
    (_bootstrapJson: string): WasmCompiledProfileBootstrapResultView => {
      const compilationIndex = compilations.length;
      const schema =
        config.schemasByCompilation?.[compilationIndex] ?? PROFILE_SCHEMA;
      const formats = Object.freeze(
        (config.formatsByCompilation?.[compilationIndex] ??
          PROFILE_FORMAT_DESCRIPTORS).map((format) =>
          Object.freeze({ kind: format.kind, revision: format.revision }),
        ),
      );
      const token = Object.freeze({});
      const profileGeneration = new ProfileGenerationFixture(token);
      const profileFree = vi.fn<() => void>();
      const resultFree = vi.fn<() => void>();
      const descriptorFrees: VoidMock[] = [];
      const engineGenerations: ProfileGenerationFixture[] = [];
      const profileDescriptor = profileDescriptorFixture(
        profileGeneration,
        schema,
        formats,
        config.intentInputKind,
      );
      descriptorFrees.push(profileDescriptor.free);
      let record: ProfileCompilationRecord;

      const createEngine = (
        lineage: string,
        revision: number,
        text: string,
      ): WasmEngineBootstrapResultView => {
        config.onCreateEngine?.(compilationIndex);
        const built = profileEngineFixture(
          lineage,
          revision,
          text,
          schema,
          formats,
          token,
          config.intentInputKind,
        );
        engines.push(built.record);
        engineGenerations.push(built.engineGeneration);
        descriptorFrees.push(built.descriptorFree);
        return constructionResult(built.engine);
      };
      const createEngineFromDocumentJson = vi.fn(
        (lineage: string, documentJson: string) =>
          createEngine(
            lineage,
            0,
            profileDocumentText(documentJson) ?? config.text ?? "profile text",
          ),
      );
      const createEngineFromSessionCheckpointJson = vi.fn(
        (checkpointJsonValue: string) => {
          const restored = profileCheckpointState(checkpointJsonValue);
          return createEngine(
            restored?.lineage ?? LINEAGE,
            restored?.revision ?? 0,
            restored?.text ?? config.text ?? "profile text",
          );
        },
      );
      const profile: WasmCompiledProfileBootstrapView = {
        createEngineFromDocumentJson,
        createEngineFromSessionCheckpointJson,
        generation: () => profileGeneration,
        descriptor: () => profileDescriptor,
        matchesProfileGeneration: (candidate) =>
          profileGeneration.matches(candidate),
        free: profileFree,
      };
      record = {
        schema,
        formats,
        profileGeneration,
        profileFree,
        resultFree,
        descriptorFrees,
        engineGenerations,
        createEngineFromDocumentJson,
        createEngineFromSessionCheckpointJson,
      };
      compilations.push(record);
      return compiledProfileResult(profile, resultFree);
    },
  );
  const factory: WasmEngineBootstrapFactoryView = {
    fromDocumentJson: legacyFromDocumentJson,
    fromSessionCheckpointJson: legacyFromSessionCheckpointJson,
  };
  return {
    module: {
      BreditorEngine: factory,
      BreditorCompiledProfile: { fromBootstrapJson },
      breditorWasmAbiVersion: () => BREDITOR_WASM_ABI_VERSION,
      breditorVersion: () => BREDITOR_BROWSER_PACKAGE_VERSION,
    },
    fromBootstrapJson,
    legacyFromDocumentJson,
    legacyFromSessionCheckpointJson,
    compilations,
    engines,
  };
}

function compiledProfileResult(
  profile: WasmCompiledProfileBootstrapView,
  free: VoidMock,
): WasmCompiledProfileBootstrapResultView {
  let taken = false;
  return {
    status: "profile",
    error: undefined,
    takeProfile: () => {
      if (taken) return undefined;
      taken = true;
      return profile;
    },
    free,
  };
}

function profileDescriptorFixture(
  generation: WasmProfileGenerationView,
  schema: ProfileSchemaFixture,
  formats: readonly ProfileFormatFixture[],
  intentInputKind: "none" | "typed" = "none",
): WasmCompiledProfileDescriptorView & {
  readonly free: VoidMock;
} {
  return {
    schemaName: schema.name,
    schemaVersion: schema.version,
    schemaFingerprint: schema.fingerprint,
    formatCount: formats.length,
    intentCount: 1,
    actionStateCount: 1,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    formatKind: (index) => formats[index]?.kind,
    formatRevision: (index) => formats[index]?.revision,
    intentId: (index) => index === 0 ? INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? intentInputKind : undefined,
    intentInputContractName: (index) =>
      index === 0 && intentInputKind === "typed"
        ? "example/intent-input"
        : undefined,
    intentInputContractVersion: (index) =>
      index === 0 && intentInputKind === "typed" ? 1 : undefined,
    intentActivationContract: (index) =>
      index === 0 ? "tracked" : undefined,
    intentValueContractName: () => undefined,
    intentValueContractVersion: () => undefined,
    actionStateId: (index) => (index === 0 ? STATE_ID : undefined),
    actionStateSourceKind: (index) =>
      index === 0 ? "routed" : undefined,
    actionStateSourceActionId: () => undefined,
    actionStateSourceIntentId: (index) =>
      index === 0 ? INTENT_ID : undefined,
    actionStateHistoryDirection: () => undefined,
    actionStateActivationContract: (index) =>
      index === 0 ? "tracked" : undefined,
    actionStateValueContractName: () => undefined,
    actionStateValueContractVersion: () => undefined,
    free: vi.fn<() => void>(),
  };
}

function profileEngineFixture(
  lineage: string,
  initialRevision: number,
  initialText: string,
  schema: ProfileSchemaFixture,
  formats: readonly ProfileFormatFixture[],
  token: object,
  intentInputKind: "none" | "typed" = "none",
): Readonly<{
  engine: WasmBootstrappedEngineView;
  record: EngineRecord;
  engineGeneration: ProfileGenerationFixture;
  descriptorFree: VoidMock;
}> {
  const engineGeneration = new ProfileGenerationFixture(token);
  const descriptor = profileDescriptorFixture(
    engineGeneration,
    schema,
    formats,
    intentInputKind,
  );
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
      matchesProfileGeneration: (candidate) =>
        engineGeneration.matches(candidate),
      free,
    };
  };
  const initialObservation = makeObservation(revision);
  const actionStates = vi.fn((expected: WasmCommandObservationView) =>
    actionStatesResult(
      lineage,
      Number(expected.snapshotRevision),
      true,
      active,
      engineGeneration,
    ),
  );
  const selection = vi.fn((expected: WasmCommandObservationView) =>
    selectionResult(
      noneSelection(
        lineage,
        Number(expected.snapshotRevision),
        engineGeneration,
      ),
      engineGeneration,
    ),
  );
  const executeNoInputAction = vi.fn(
    (expected: WasmCommandObservationView, actionId: string) => {
      if (actionId !== ACTION_ID) throw new Error("unexpected profile action");
      const baseRevision = Number(expected.snapshotRevision);
      const successorRevision = baseRevision + 1;
      const successor = makeObservation(successorRevision);
      const baseText = text;
      revision = successorRevision;
      text = "after";
      active = true;
      return commandResult(
        successor,
        profileProjectionUpdate(
          lineage,
          baseRevision,
          baseText,
          successorRevision,
          text,
          schema,
          formats,
          engineGeneration,
        ),
        engineGeneration,
      );
    },
  );
  const executeNoInputIntent = vi.fn(
    (expected: WasmCommandObservationView, intentId: string) => {
      if (intentId !== INTENT_ID) throw new Error("unexpected profile intent");
      const baseRevision = Number(expected.snapshotRevision);
      const successorRevision = baseRevision + 1;
      const successor = makeObservation(successorRevision);
      const baseText = text;
      revision = successorRevision;
      text = "after";
      active = true;
      return committedIntentResult(
        successor,
        profileProjectionUpdate(
          lineage,
          baseRevision,
          baseText,
          successorRevision,
          text,
          schema,
          formats,
          engineGeneration,
        ),
        engineGeneration,
      );
    },
  );
  const executeStringAction = vi.fn(() => unexpected("executeStringAction"));
  const setRangeSelection = vi.fn(() => unexpected("setRangeSelection"));
  const closeHistoryGroup = vi.fn(() =>
    unchangedCommandResult(makeObservation(revision), engineGeneration)
  );
  const documentJson = vi.fn((_expected: WasmCommandObservationView) =>
    stringResult(profileDocumentJson(text, schema)),
  );
  const unexpected = (name: string): never => {
    throw new Error(`unexpected ${name}`);
  };
  const engine: WasmBootstrappedEngineView = {
    actionStates,
    sessionCheckpointJson: vi.fn(() =>
      stringResult(profileCheckpointJson(lineage, revision, text, schema)),
    ),
    documentJson,
    clearSelection: vi.fn(() => unexpected("clearSelection")),
    setRangeSelection,
    selection,
    executeNoInputAction,
    executeNoInputIntent,
    executeStringAction,
    undo: vi.fn(() => unexpected("undo")),
    redo: vi.fn(() => unexpected("redo")),
    closeHistoryGroup,
    matchesProfileGeneration: (candidate) =>
      engineGeneration.matches(candidate),
    profileGeneration: vi.fn(() => engineGeneration),
    profileDescriptor: vi.fn(() => descriptor),
    observation: vi.fn(() => initialObservation),
    projection: vi.fn(() =>
      projectionReadResult(
        profileProjectionView(
          lineage,
          revision,
          text,
          schema,
          formats,
          engineGeneration,
        ),
        engineGeneration,
      ),
    ),
    free: rawFree,
  };
  return {
    engine,
    record: {
      rawFree,
      observationFrees,
      executeNoInputAction,
      executeNoInputIntent,
      executeStringAction,
      setRangeSelection,
      closeHistoryGroup,
      actionStates,
      selection,
      documentJson,
    },
    engineGeneration,
    descriptorFree: descriptor.free,
  };
}

function engineFixture(
  lineage: string,
  initialRevision: number,
  initialText: string,
  config: ModuleFixtureOptions,
): Readonly<{ engine: WasmBootstrappedEngineView; record: EngineRecord }> {
  const generation: WasmProfileGenerationView = {
    matches(other): boolean {
      return other === generation;
    },
    free: vi.fn(() => config.onProfileGenerationFree?.()),
  };
  let revision = initialRevision;
  let text = initialText;
  let active = false;
  const rawFree = vi.fn(() => config.onEngineFree?.());
  const observationFrees: ReturnType<typeof vi.fn>[] = [];
  const makeObservation = (
    snapshotRevision: number,
  ): WasmCommandObservationView => {
    const free = vi.fn(() => config.onObservationFree?.());
    observationFrees.push(free);
    return {
      snapshotLineage: lineage,
      snapshotRevision: String(snapshotRevision),
      matchesProfileGeneration: (candidate) => candidate === generation,
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
      generation,
      config.onActionStateStatusRead,
      true,
    );
  });
  const selection = vi.fn((expected: WasmCommandObservationView) => {
    const snapshotRevision = Number(expected.snapshotRevision);
    return selectionResult(
      config.selectionOffset === undefined
        ? noneSelection(lineage, snapshotRevision, generation)
        : rangeSelection(
            lineage,
            snapshotRevision,
            config.selectionOffset,
            generation,
          ),
      generation,
    );
  });
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
          generation,
        ),
        generation,
      );
    },
  );
  const executeNoInputIntent = vi.fn(
    (expected: WasmCommandObservationView, intentId: string) => {
      if (config.actionThrows === true)
        throw new Error("uncertain Wasm delivery");
      if (config.enableAction !== true || intentId !== INTENT_ID) {
        throw new Error("unexpected no-input intent");
      }
      config.onAction?.();
      const baseRevision = Number(expected.snapshotRevision);
      if (config.intentOutcome === "blocked") {
        return blockedIntentResult(
          makeObservation(baseRevision),
          generation,
        );
      }
      if (config.intentOutcome === "unhandled") {
        return unhandledIntentResult(
          makeObservation(baseRevision),
          generation,
        );
      }
      if (config.intentOutcome === "malformed") {
        return {
          ...unhandledIntentResult(makeObservation(baseRevision), generation),
          intentId: "breditor/wrong-intent",
        };
      }
      const successorRevision = baseRevision + 1;
      const successor = makeObservation(successorRevision);
      const baseText = text;
      const nextText = "after";
      revision = successorRevision;
      text = nextText;
      active = true;
      return committedIntentResult(
        successor,
        projectionUpdate(
          lineage,
          baseRevision,
          baseText,
          successorRevision,
          nextText,
          generation,
        ),
        generation,
      );
    },
  );
  const documentJson = vi.fn((_expected: WasmCommandObservationView) => {
    config.onDocumentJson?.();
    return config.documentJsonError === undefined
      ? documentResult(text, config.documentJsonValue)
      : documentErrorResult(config.documentJsonError);
  });
  const unexpected = (name: string): never => {
    throw new Error(`unexpected ${name}`);
  };
  const setRangeSelection = vi.fn(() => {
    if (config.enableStringAction !== true) {
      return unexpected("setRangeSelection");
    }
    return unchangedCommandResult(makeObservation(revision), generation);
  });
  const closeHistoryGroup = vi.fn(() =>
    unchangedCommandResult(makeObservation(revision), generation)
  );
  const executeStringAction = vi.fn(
    (
      expected: WasmCommandObservationView,
      actionId: string,
      value: string,
    ) => {
      if (
        config.enableStringAction !== true ||
        actionId !== "breditor/insert-plain-text"
      ) {
        return unexpected("executeStringAction");
      }
      const baseRevision = Number(expected.snapshotRevision);
      const successorRevision = baseRevision + 1;
      const successor = makeObservation(successorRevision);
      const baseText = text;
      const offset = Math.min(config.selectionOffset ?? text.length, text.length);
      text = `${text.slice(0, offset)}${value}${text.slice(offset)}`;
      revision = successorRevision;
      return commandResult(
        successor,
        projectionUpdate(
          lineage,
          baseRevision,
          baseText,
          successorRevision,
          text,
          generation,
        ),
        generation,
      );
    },
  );
  const engine: WasmBootstrappedEngineView = {
    actionStates,
    sessionCheckpointJson: vi.fn(() => checkpointResult(lineage, revision)),
    documentJson,
    clearSelection: vi.fn(() => unexpected("clearSelection")),
    setRangeSelection,
    selection,
    executeNoInputAction,
    executeNoInputIntent,
    executeStringAction,
    undo: vi.fn(() => unexpected("undo")),
    redo: vi.fn(() => unexpected("redo")),
    closeHistoryGroup,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    profileGeneration: vi.fn(() => generation),
    profileDescriptor: vi.fn(() => baseDescriptor(generation)),
    observation: vi.fn(() => initialObservation),
    projection: vi.fn(() =>
      projectionReadResult(
        projectionView(lineage, revision, text, generation),
        generation,
      ),
    ),
    free: rawFree,
  };
  return {
    engine,
    record: {
      rawFree,
      observationFrees,
      executeNoInputAction,
      executeNoInputIntent,
      executeStringAction,
      setRangeSelection,
      closeHistoryGroup,
      actionStates,
      selection,
      documentJson,
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
  generation: WasmProfileGenerationView,
): WasmProjectionReadResultView {
  let taken = false;
  return {
    status: "projection",
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
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
  generation: WasmProfileGenerationView,
): SemanticProjectionView {
  return {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: BASE_SCHEMA_FINGERPRINT,
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
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    free: vi.fn(),
  };
}

function profileProjectionView(
  lineage: string,
  revision: number,
  text: string,
  schema: ProfileSchemaFixture,
  formats: readonly ProfileFormatFixture[],
  generation: WasmProfileGenerationView,
): SemanticProjectionView {
  return {
    schemaName: schema.name,
    schemaVersion: schema.version,
    schemaFingerprint: schema.fingerprint,
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
    formatCount: (index) => (index === 2 ? formats.length : undefined),
    formatType: (index, ordinal) =>
      index === 2 ? formats[ordinal]?.kind : undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    free: vi.fn(),
  };
}

function noneSelection(
  lineage: string,
  revision: number,
  generation: WasmProfileGenerationView,
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
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    free: vi.fn(),
  };
}

function rangeSelection(
  lineage: string,
  revision: number,
  offset: number,
  generation: WasmProfileGenerationView,
): SemanticSelectionView {
  return {
    snapshotLineage: lineage,
    snapshotRevision: String(revision),
    kind: "range",
    anchorPointKind: "text",
    anchorNodeIndex: 2,
    anchorOffset: offset,
    anchorAffinity: "before",
    focusPointKind: "text",
    focusNodeIndex: 2,
    focusOffset: offset,
    focusAffinity: "before",
    rangeOrder: "collapsed",
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    free: vi.fn(),
  };
}

function selectionResult(
  selection: SemanticSelectionView,
  generation: WasmProfileGenerationView,
): WasmSelectionResultView {
  let taken = false;
  return {
    status: "selection",
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
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
  generation: WasmProfileGenerationView,
  onStatusRead?: () => void,
  includeHistory = false,
): WasmActionStatesResultView {
  let taken = false;
  const entryCount = includeHistory ? 3 : 1;
  const ids = includeHistory
    ? [STATE_ID, "breditor/control-redo", "breditor/control-undo"] as const
    : [STATE_ID] as const;
  const snapshot: WasmActionStateSnapshotView = {
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    snapshotLineage: lineage,
    snapshotRevision: String(revision),
    entryCount,
    changedCount: entryCount,
    entryId: (index) => ids[index],
    entryStatus: (index) =>
      index === 0
        ? (enabled ? "enabled" : "disabled")
        : index < entryCount
          ? "disabled"
          : undefined,
    entryActivation: (index) =>
      index === 0
        ? (active ? "active" : "inactive")
        : index < entryCount
          ? "stateless"
          : undefined,
    entryReasonCode: (index) =>
      index >= entryCount
        ? undefined
        : index === 0
        ? (enabled ? undefined : "breditor/not-enabled")
        : index === 1
          ? "breditor/nothing-to-redo"
          : index === 2
            ? "breditor/nothing-to-undo"
            : undefined,
    entryValueStatus: (index) =>
      index < entryCount ? "unsupported" : undefined,
    entryValueContractName: () => undefined,
    entryValueContractVersion: () => undefined,
    entryUniformValueJson: () => absentStringResult(),
    changedId: (index) => ids[index],
    free: vi.fn(),
  };
  const result: WasmActionStatesResultView = {
    status: "full",
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    takeSnapshot: () => {
      if (taken) return undefined;
      taken = true;
      return snapshot;
    },
    free: vi.fn(),
  };
  if (onStatusRead !== undefined) {
    Object.defineProperty(result, "status", {
      configurable: true,
      enumerable: true,
      get: () => {
        onStatusRead();
        return "full" as const;
      },
    });
  }
  return result;
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
  generation: WasmProfileGenerationView,
): WasmCommandResultView {
  return {
    status: "committed",
    eventKind: "action",
    disabledActionId: undefined,
    disabledReasonCode: undefined,
    activation: undefined,
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    observation: () => successor,
    projectionUpdate: () => update,
    free: vi.fn(),
  };
}

function committedIntentResult(
  successor: WasmCommandObservationView,
  update: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
): WasmIntentResultView {
  return {
    status: "committed",
    intentId: INTENT_ID,
    bindingId: BINDING_ID,
    actionId: ACTION_ID,
    bindingPriority: 0,
    blockedReasonCode: undefined,
    blockedActivation: undefined,
    blockedValueStatus: undefined,
    blockedValueContractName: undefined,
    blockedValueContractVersion: undefined,
    fallthroughCount: 0,
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    observation: () => successor,
    projectionUpdate: () => update,
    blockedReasonDetailJson: () => undefined,
    blockedValueJson: () => undefined,
    commitJson: () => undefined,
    fallthroughBindingId: () => undefined,
    fallthroughActionId: () => undefined,
    fallthroughPriority: () => undefined,
    fallthroughReasonCode: () => undefined,
    fallthroughReasonDetailJson: () => undefined,
    free: vi.fn(),
  };
}

function blockedIntentResult(
  successor: WasmCommandObservationView,
  generation: WasmProfileGenerationView,
): WasmIntentResultView {
  return {
    status: "blocked",
    intentId: INTENT_ID,
    bindingId: BINDING_ID,
    actionId: ACTION_ID,
    bindingPriority: 0,
    blockedReasonCode: "breditor/no-selection",
    blockedActivation: "inactive",
    blockedValueStatus: "unsupported",
    blockedValueContractName: undefined,
    blockedValueContractVersion: undefined,
    fallthroughCount: 0,
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    observation: () => successor,
    projectionUpdate: () => undefined,
    blockedReasonDetailJson: () => undefined,
    blockedValueJson: () => undefined,
    commitJson: () => undefined,
    fallthroughBindingId: () => undefined,
    fallthroughActionId: () => undefined,
    fallthroughPriority: () => undefined,
    fallthroughReasonCode: () => undefined,
    fallthroughReasonDetailJson: () => undefined,
    free: vi.fn(),
  };
}

function unhandledIntentResult(
  successor: WasmCommandObservationView,
  generation: WasmProfileGenerationView,
): WasmIntentResultView {
  return {
    status: "unhandled",
    intentId: INTENT_ID,
    bindingId: undefined,
    actionId: undefined,
    bindingPriority: undefined,
    blockedReasonCode: undefined,
    blockedActivation: undefined,
    blockedValueStatus: undefined,
    blockedValueContractName: undefined,
    blockedValueContractVersion: undefined,
    fallthroughCount: 0,
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    observation: () => successor,
    projectionUpdate: () => undefined,
    blockedReasonDetailJson: () => undefined,
    blockedValueJson: () => undefined,
    commitJson: () => undefined,
    fallthroughBindingId: () => undefined,
    fallthroughActionId: () => undefined,
    fallthroughPriority: () => undefined,
    fallthroughReasonCode: () => undefined,
    fallthroughReasonDetailJson: () => undefined,
    free: vi.fn(),
  };
}

function unchangedCommandResult(
  successor: WasmCommandObservationView,
  generation: WasmProfileGenerationView,
): WasmCommandResultView {
  return {
    status: "unchanged",
    eventKind: undefined,
    disabledActionId: undefined,
    disabledReasonCode: undefined,
    activation: undefined,
    error: undefined,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    observation: () => successor,
    projectionUpdate: () => undefined,
    free: vi.fn(),
  };
}

function projectionUpdate(
  lineage: string,
  baseRevision: number,
  baseText: string,
  resultRevision: number,
  resultText: string,
  generation: WasmProfileGenerationView,
): SemanticProjectionUpdateView {
  let taken = false;
  return {
    baseLineage: lineage,
    baseRevision: String(baseRevision),
    resultLineage: lineage,
    resultRevision: String(resultRevision),
    matchesProfileGeneration: (candidate) => candidate === generation,
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
      return projectionView(lineage, resultRevision, resultText, generation);
    },
    free: vi.fn(),
  };
}

function profileProjectionUpdate(
  lineage: string,
  baseRevision: number,
  _baseText: string,
  resultRevision: number,
  resultText: string,
  schema: ProfileSchemaFixture,
  formats: readonly ProfileFormatFixture[],
  generation: WasmProfileGenerationView,
): SemanticProjectionUpdateView {
  let taken = false;
  return {
    baseLineage: lineage,
    baseRevision: String(baseRevision),
    resultLineage: lineage,
    resultRevision: String(resultRevision),
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
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
      return profileProjectionView(
        lineage,
        resultRevision,
        resultText,
        schema,
        formats,
        generation,
      );
    },
    free: vi.fn(),
  };
}

function baseDescriptor(
  generation: WasmProfileGenerationView,
): WasmCompiledProfileDescriptorView {
  return {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: BASE_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 3,
    matchesProfileGeneration: (candidate) => candidate === generation,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    intentId: (index) => index === 0 ? INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? "none" : undefined,
    intentInputContractName: () => undefined,
    intentInputContractVersion: () => undefined,
    intentActivationContract: (index) =>
      index === 0 ? "tracked" : undefined,
    intentValueContractName: () => undefined,
    intentValueContractVersion: () => undefined,
    actionStateId: (index) => [
      "breditor/control-bold",
      "breditor/control-redo",
      "breditor/control-undo",
    ][index],
    actionStateSourceKind: (index) =>
      index === 0 ? "routed" : index === 1 || index === 2 ? "history" : undefined,
    actionStateSourceActionId: () => undefined,
    actionStateSourceIntentId: (index) =>
      index === 0 ? INTENT_ID : undefined,
    actionStateHistoryDirection: (index) =>
      index === 1 ? "redo" : index === 2 ? "undo" : undefined,
    actionStateActivationContract: (index) =>
      index === 0 ? "tracked" : index === 1 || index === 2 ? "stateless" : undefined,
    actionStateValueContractName: () => undefined,
    actionStateValueContractVersion: () => undefined,
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

function stringResult(value: string): WasmSessionCheckpointStringResultView {
  let taken = false;
  return {
    status: "value",
    error: undefined,
    takeValue: () => {
      if (taken) return undefined;
      taken = true;
      return value;
    },
    free: vi.fn(),
  };
}

function documentResult(
  text: string,
  override?: string,
): WasmSessionCheckpointStringResultView {
  let taken = false;
  return {
    status: "value",
    error: undefined,
    takeValue: () => {
      if (taken) return undefined;
      taken = true;
      return override ?? documentJsonValue(text);
    },
    free: vi.fn(),
  };
}

function documentErrorResult(
  error: Readonly<{ code: string; message: string }>,
): WasmSessionCheckpointStringResultView {
  return {
    status: "error",
    error: {
      code: error.code,
      message: error.message,
      free: vi.fn(),
    },
    takeValue: () => undefined,
    free: vi.fn(),
  };
}

function documentJsonValue(text: string): string {
  return JSON.stringify({
    format: "breditor/document",
    formatVersion: 1,
    schema: { name: "breditor/base", version: 1 },
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [
        {
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children:
            text.length === 0 ? [] : [{ kind: "text", text, formats: [] }],
        },
      ],
    },
  });
}

function profileDocumentJson(
  text: string,
  schema: ProfileSchemaFixture,
): string {
  return JSON.stringify({
    format: "breditor/document",
    formatVersion: 2,
    schema: { name: schema.name, version: schema.version },
    schemaFingerprint: schema.fingerprint,
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [
        {
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children:
            text.length === 0
              ? []
              : [
                  {
                    kind: "text",
                    text,
                    formats: PROFILE_FORMATS.map((type) => ({
                      type,
                      properties: {},
                    })),
                  },
                ],
        },
      ],
    },
  });
}

function profileCheckpointJson(
  lineage: string,
  revision: number,
  text: string,
  schema: ProfileSchemaFixture,
): string {
  return JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 2,
    schema: { name: schema.name, version: schema.version },
    schemaFingerprint: schema.fingerprint,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 2,
      schema: { name: schema.name, version: schema.version },
      schemaFingerprint: schema.fingerprint,
      snapshot: { lineage, revision: "0" },
      document: JSON.parse(profileDocumentJson(text, schema)) as unknown,
      selection: null,
      pendingFormats: null,
    },
    currentRevision: String(revision),
    historyCapacity: 100,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
}

function profileDocumentText(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value) as {
      root?: { children?: { children?: { text?: unknown }[] }[] };
    };
    const paragraphs = parsed.root?.children;
    if (!Array.isArray(paragraphs)) return undefined;
    const runs = paragraphs[0]?.children;
    if (!Array.isArray(runs)) return undefined;
    const text = runs.map((run) => run.text).join("");
    return typeof text === "string" ? text : undefined;
  } catch {
    return undefined;
  }
}

function profileCheckpointState(value: string):
  | Readonly<{ lineage: string; revision: number; text: string }>
  | undefined {
  try {
    const parsed = JSON.parse(value) as {
      currentRevision?: unknown;
      historyBase?: {
        snapshot?: { lineage?: unknown };
        document?: unknown;
      };
    };
    const lineage = parsed.historyBase?.snapshot?.lineage;
    const revision = Number(parsed.currentRevision);
    const documentJson = JSON.stringify(parsed.historyBase?.document);
    const text = profileDocumentText(documentJson);
    return typeof lineage === "string" && Number.isSafeInteger(revision) &&
        revision >= 0 && text !== undefined
      ? { lineage, revision, text }
      : undefined;
  } catch {
    return undefined;
  }
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

function profileCheckpointBinding(
  slot: string,
  schemaFingerprint: string,
): IndexedDbSessionCheckpointBinding {
  return Object.freeze({
    slot,
    schemaFingerprint,
    checkpointFormatVersion: 2,
  });
}

async function seedCheckpoint(
  indexedDB: IDBFactory,
  crypto: Pick<SubtleCrypto, "digest">,
  binding: IndexedDbSessionCheckpointBinding,
  checkpointJsonValue: string,
): Promise<void> {
  const store = new IndexedDbSessionCheckpointStore({
    indexedDB,
    crypto,
    binding,
  });
  try {
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);
    const saved = await store.save(loaded.token, checkpointJsonValue);
    if (!saved.ok) throw new Error(saved.error.code);
  } finally {
    store.close();
  }
}

async function rawCheckpointRecord(
  indexedDB: IDBFactory,
  slot: string,
): Promise<unknown> {
  const openRequest = indexedDB.open(
    SESSION_CHECKPOINT_DATABASE_NAME,
    SESSION_CHECKPOINT_DATABASE_VERSION,
  );
  const database = await indexedDbRequest(openRequest);
  try {
    const transaction = database.transaction(
      SESSION_CHECKPOINT_OBJECT_STORE_NAME,
      "readonly",
    );
    const completed = indexedDbTransaction(transaction);
    const value = await indexedDbRequest(
      transaction.objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME).get(slot),
    );
    await completed;
    return value;
  } finally {
    database.close();
  }
}

function indexedDbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function indexedDbTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function installNativeClipboardPaste(html: string) {
  const priorClipboardEvent = Object.getOwnPropertyDescriptor(
    globalThis,
    "ClipboardEvent",
  );
  const priorDataTransfer = Object.getOwnPropertyDescriptor(
    globalThis,
    "DataTransfer",
  );
  const transfers = new WeakSet<object>();
  const eventTransfers = new WeakMap<object, object>();
  const getData = vi.fn((type: string) => type === "text/html" ? html : "");

  class PlatformDataTransfer {
    constructor() {
      transfers.add(this);
    }

    get types(): readonly string[] {
      if (!transfers.has(this)) throw new TypeError("illegal invocation");
      return Object.freeze(["text/html"]);
    }

    getData(type: string): string {
      if (!transfers.has(this)) throw new TypeError("illegal invocation");
      return getData(type);
    }
  }

  class PlatformClipboardEvent extends Event {
    constructor(type: string, transfer: object) {
      super(type, { bubbles: true, cancelable: true });
      eventTransfers.set(this, transfer);
    }

    get clipboardData(): object {
      const transfer = eventTransfers.get(this);
      if (transfer === undefined) throw new TypeError("illegal invocation");
      return transfer;
    }
  }

  Object.defineProperties(globalThis, {
    DataTransfer: { configurable: true, value: PlatformDataTransfer },
    ClipboardEvent: { configurable: true, value: PlatformClipboardEvent },
  });
  const event = new PlatformClipboardEvent("paste", new PlatformDataTransfer());
  return Object.freeze({
    event,
    getData,
    restore: () => {
      restoreGlobalConstructor("ClipboardEvent", priorClipboardEvent);
      restoreGlobalConstructor("DataTransfer", priorDataTransfer);
    },
  });
}

function restoreGlobalConstructor(
  name: "ClipboardEvent" | "DataTransfer",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);
  } else {
    Object.defineProperty(globalThis, name, descriptor);
  }
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
