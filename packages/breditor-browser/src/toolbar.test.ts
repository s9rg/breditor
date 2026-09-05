import { beforeEach, describe, expect, it } from "vitest";

import {
  BreditorToolbar,
  MAX_TOOLBAR_STATE_ENTRIES,
  toolbarCommandDispatchResult,
  toolbarCommandRequest,
  type ToolbarActionStateEntry,
  type ToolbarActionStateSnapshot,
  type ToolbarCommandInvocation,
} from "./toolbar.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import {
  issueEditorDeliveryToken,
  type EditorDeliveryToken,
} from "./editor_command.js";
import { BaseDocumentProjection } from "./projection.js";
import {
  BASE_TOOLBAR_STATE_IDS,
  DEFAULT_TOOLBAR_MANIFEST,
  createToolbarManifest,
} from "./toolbar_manifest.js";

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("BreditorToolbar", () => {
  it("renders an accessible native-button toolbar from the default manifest", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const store = new TestStateStore(baseEntries());
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: completedDispatch,
    });

    const buttons = toolbarButtons(host);
    expect(toolbar.element.parentNode).toBe(host);
    expect(toolbar.element.getAttribute("data-breditor-toolbar-root")).toBe("");
    expect(toolbar.manifest).toBe(DEFAULT_TOOLBAR_MANIFEST);
    expect(toolbar.element.getAttribute("role")).toBe("toolbar");
    expect(toolbar.element.getAttribute("aria-label")).toBe("Editor controls");
    expect(toolbar.element.getAttribute("aria-orientation")).toBe("horizontal");
    expect(host.hasAttribute("role")).toBe(false);
    expect(buttons.map((button) => button.textContent)).toEqual(["Bold", "Undo", "Redo"]);
    expect(buttons.every((button) => button.type === "button")).toBe(true);
    expect(buttons.map((button) => button.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-disabled"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(buttons.map((button) => button.hasAttribute("disabled"))).toEqual([
      false,
      false,
      false,
    ]);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.hasAttribute("aria-pressed")).toBe(false);
    expect(buttons[2]?.hasAttribute("aria-pressed")).toBe(false);

    toolbar.dispose();
  });

  it("publishes true, false, and mixed only for activation-tracked controls", () => {
    const host = mountHost();
    const store = new TestStateStore(baseEntries());
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: completedDispatch,
    });
    const [bold, undo, redo] = toolbarButtons(host);

    store.publish([
      state(BASE_TOOLBAR_STATE_IDS.bold, "enabled", "active"),
      state(BASE_TOOLBAR_STATE_IDS.undo, "disabled", "stateless"),
      state(BASE_TOOLBAR_STATE_IDS.redo, "enabled", "stateless"),
    ]);
    expect(bold?.getAttribute("aria-pressed")).toBe("true");
    expect(bold?.getAttribute("aria-disabled")).toBe("false");
    expect(undo?.getAttribute("aria-disabled")).toBe("true");
    expect(redo?.getAttribute("aria-disabled")).toBe("false");

    store.publish([
      state(BASE_TOOLBAR_STATE_IDS.bold, "blocked", "mixed"),
      state(BASE_TOOLBAR_STATE_IDS.undo, "enabled", "stateless"),
      state(BASE_TOOLBAR_STATE_IDS.redo, "faulted", undefined),
    ]);
    expect(bold?.getAttribute("aria-pressed")).toBe("mixed");
    expect(bold?.getAttribute("aria-disabled")).toBe("true");
    expect(undo?.hasAttribute("aria-pressed")).toBe(false);
    expect(redo?.hasAttribute("aria-pressed")).toBe(false);

    store.publish([
      state(BASE_TOOLBAR_STATE_IDS.bold, "disabled", "inactive"),
      state(BASE_TOOLBAR_STATE_IDS.undo, "enabled", "stateless"),
      state(BASE_TOOLBAR_STATE_IDS.redo, "enabled", "stateless"),
    ]);
    expect(bold?.getAttribute("aria-pressed")).toBe("false");

    toolbar.dispose();
  });

  it("projects optional grouping and drops unimplemented shortcut metadata", () => {
    const host = mountHost();
    const manifest = createToolbarManifest({
      label: "Inline tools",
      controls: [
        {
          kind: "button",
          stateId: "example/control-emphasis",
          label: "Emphasis",
          activation: "tracked",
          group: "inline",
          ariaKeyShortcuts: "Control+E Meta+E",
          command: {
            kind: "action",
            actionId: "example/toggle-emphasis",
            input: { kind: "none" },
            history: "closeBefore",
          },
        },
      ],
    });
    const toolbar = new BreditorToolbar(
      host,
      manifest,
      new TestStateStore([
        state("example/control-emphasis", "enabled", "inactive"),
      ]),
      { dispatch: completedDispatch },
    );
    const button = toolbarButtons(host)[0];
    expect(button?.getAttribute("data-breditor-group")).toBe("inline");
    expect(button?.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect("ariaKeyShortcuts" in manifest.controls[0]!).toBe(false);
    toolbar.dispose();
  });

  it("fails closed for missing, malformed, duplicate, oversized, or contract-mismatched state", () => {
    const host = mountHost();
    const store = new TestStateStore([
      state(BASE_TOOLBAR_STATE_IDS.bold, "enabled", "stateless"),
      state(BASE_TOOLBAR_STATE_IDS.undo, "enabled", "active"),
    ]);
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: completedDispatch,
    });
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    const duplicate = state(BASE_TOOLBAR_STATE_IDS.bold, "enabled", "active");
    store.publishRaw({ entries: [duplicate, duplicate] });
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    store.publishRaw({
      entries: Array.from({ length: MAX_TOOLBAR_STATE_ENTRIES + 1 }, (_, index) =>
        state(`example/control-${index}`, "enabled", "stateless"),
      ),
    });
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    store.publishRaw({ entries: [{ id: BASE_TOOLBAR_STATE_IDS.bold, availability: "maybe" }] });
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    store.publish(baseEntries());
    expect(disabledValues(host)).toEqual(["false", "false", "true"]);
    toolbar.dispose();
  });

  it("disables stale last-good state and re-enables only after freshness returns", () => {
    const host = mountHost();
    const store = new TestStateStore(baseEntries());
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: completedDispatch,
    });
    expect(disabledValues(host)).toEqual(["false", "false", "true"]);

    store.publishStatus("stale");
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    store.publishStatus("fresh");
    expect(disabledValues(host)).toEqual(["false", "false", "true"]);
    toolbar.dispose();
  });

  it("uses cyclic roving focus for arrows and absolute Home/End navigation", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );
    const buttons = toolbarButtons(host);
    buttons[0]?.focus();

    expect(key(buttons[0]!, "ArrowLeft").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[2]);
    expect(tabIndexes(buttons)).toEqual(["-1", "-1", "0"]);

    expect(key(buttons[2]!, "ArrowRight").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(key(buttons[0]!, "End").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[2]);
    expect(key(buttons[2]!, "Home").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(key(buttons[0]!, "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    expect(key(buttons[1]!, "ArrowUp").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);

    const modified = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      shiftKey: true,
    });
    buttons[0]?.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[0]);
    toolbar.dispose();
  });

  it("prevents primary pointer focus and dispatches a frozen preserve-selection declaration", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "selected text";
    const host = document.createElement("div");
    document.body.append(editor, host);
    editor.focus();
    const text = editor.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 8);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const invocations: ToolbarCommandInvocation[] = [];
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      {
        dispatch: (invocation) => {
          invocations.push(invocation);
          return completedDispatch();
        },
      },
    );
    const bold = toolbarButtons(host)[0]!;
    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    bold.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect(selection.toString()).toBe("selected");

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    bold.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toEqual({
      stateId: BASE_TOOLBAR_STATE_IDS.bold,
      selection: "preserve",
      command: DEFAULT_TOOLBAR_MANIFEST.controls[0]!.command,
    });
    expect(Object.isFrozen(invocations[0])).toBe(true);
    expect(invocations[0]?.command).toBe(DEFAULT_TOOLBAR_MANIFEST.controls[0]!.command);
    expect(document.activeElement).toBe(editor);
    expect(selection.toString()).toBe("selected");

    const contextPointer = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    bold.dispatchEvent(contextPointer);
    expect(contextPointer.defaultPrevented).toBe(false);
    toolbar.dispose();
  });

  it("restores the exact toolbar button after synchronous keyboard dispatch moves focus", () => {
    const editor = document.createElement("div");
    editor.tabIndex = 0;
    const host = document.createElement("div");
    document.body.append(editor, host);
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      {
        dispatch: () => {
          editor.focus();
          return completedDispatch();
        },
      },
    );
    const bold = toolbarButtons(host)[0]!;
    bold.focus();
    expect(document.activeElement).toBe(bold);

    bold.click();

    expect(toolbar.state).toBe("live");
    expect(document.activeElement).toBe(bold);
    toolbar.dispose();
  });

  it("never dispatches disabled controls and rechecks current state at click time", () => {
    const host = mountHost();
    const store = new TestStateStore(baseEntries());
    const invocations: ToolbarCommandInvocation[] = [];
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: (invocation) => {
        invocations.push(invocation);
        return completedDispatch();
      },
    });
    const [, undo, redo] = toolbarButtons(host);

    redo?.click();
    expect(invocations).toHaveLength(0);
    // Deliberately skip notification: click still consults the current snapshot.
    store.setWithoutPublishing([
      state(BASE_TOOLBAR_STATE_IDS.bold, "enabled", "inactive"),
      state(BASE_TOOLBAR_STATE_IDS.undo, "disabled", "stateless"),
      state(BASE_TOOLBAR_STATE_IDS.redo, "enabled", "stateless"),
    ]);
    undo?.click();
    redo?.click();
    expect(invocations.map((invocation) => invocation.command)).toEqual([
      { kind: "history", operation: "redo" },
    ]);
    toolbar.dispose();
  });

  it("maps declarative actions and history to exact preserve-selection requests", () => {
    const delivery = toolbarDelivery();
    const bold = toolbarCommandRequest(delivery, {
      stateId: BASE_TOOLBAR_STATE_IDS.bold,
      selection: "preserve",
      command: DEFAULT_TOOLBAR_MANIFEST.controls[0]!.command,
    });
    expect(bold).toMatchObject({
      delivery,
      selection: { kind: "preserve" },
      source: { kind: "toolbar", detail: BASE_TOOLBAR_STATE_IDS.bold },
      requirements: { selection: "preserve", history: "closeBefore" },
      command: {
        kind: "action",
        actionId: "breditor/toggle-strong",
        input: { kind: "none" },
      },
    });
    expect(Object.isFrozen(bold.selection)).toBe(true);

    expect(
      toolbarCommandRequest(delivery, {
        stateId: BASE_TOOLBAR_STATE_IDS.undo,
        selection: "preserve",
        command: DEFAULT_TOOLBAR_MANIFEST.controls[1]!.command,
      }),
    ).toMatchObject({
      selection: { kind: "preserve" },
      requirements: { selection: "preserve", history: "closeBefore" },
      command: { kind: "history", operation: "undo" },
    });

    const stringManifest = createToolbarManifest({
      label: "Snippets",
      controls: [
        {
          kind: "button",
          stateId: "example/control-snippet",
          label: "Snippet",
          activation: "stateless",
          command: {
            kind: "action",
            actionId: "example/insert-snippet",
            input: { kind: "string", value: "Hello" },
            history: "preserve",
          },
        },
      ],
    });
    expect(
      toolbarCommandRequest(delivery, {
        stateId: stringManifest.controls[0]!.stateId,
        selection: "preserve",
        command: stringManifest.controls[0]!.command,
      }),
    ).toMatchObject({
      selection: { kind: "preserve" },
      requirements: { selection: "preserve", history: "preserve" },
      command: {
        kind: "action",
        actionId: "example/insert-snippet",
        input: { kind: "string", value: "Hello" },
      },
    });
  });

  it("accepts only owned synchronous dispatch outcomes and fails closed on uncertainty", () => {
    const throwingHost = mountHost();
    const throwing = new BreditorToolbar(
      throwingHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      {
      dispatch: () => {
        throw new Error("uncertain dispatch");
      },
      },
    );
    expect(() => toolbarButtons(throwingHost)[0]?.click()).not.toThrow();
    expect(throwing.state).toBe("faulted");
    expect(disabledValues(throwingHost)).toEqual(["true", "true", "true"]);
    throwing.dispose();

    const asyncHost = mountHost();
    const asyncToolbar = new BreditorToolbar(
      asyncHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      {
        dispatch: (() => Promise.resolve()) as never,
      },
    );
    toolbarButtons(asyncHost)[0]?.click();
    expect(asyncToolbar.state).toBe("faulted");
    asyncToolbar.dispose();

    const forgedHost = mountHost();
    const forged = new BreditorToolbar(
      forgedHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      {
        dispatch: (() => ({ status: "completed" })) as never,
      },
    );
    toolbarButtons(forgedHost)[0]?.click();
    expect(forged.state).toBe("faulted");
    forged.dispose();

    const rejectedHost = mountHost();
    const rejected = new BreditorToolbar(
      rejectedHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: () => toolbarCommandDispatchResult("rejected") },
    );
    toolbarButtons(rejectedHost)[0]?.click();
    expect(rejected.state).toBe("live");
    rejected.dispose();

    const failedHost = mountHost();
    const failed = new BreditorToolbar(
      failedHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: () => toolbarCommandDispatchResult("failed") },
    );
    toolbarButtons(failedHost)[0]?.click();
    expect(failed.state).toBe("faulted");
    failed.dispose();

    expect(() => toolbarCommandDispatchResult("unknown" as never)).toThrow(
      /status/u,
    );
  });

  it("faults and releases a subscription when the state-store callback throws", () => {
    const host = mountHost();
    let unsubscribed = 0;
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      {
        getSnapshot: () => {
          throw new Error("state read failure");
        },
        getStatus: () => ({ status: "fresh" as const }),
        subscribe: (listener) => {
          listener();
          return () => {
            unsubscribed += 1;
          };
        },
      },
      { dispatch: completedDispatch },
    );
    expect(toolbar.state).toBe("faulted");
    expect(unsubscribed).toBe(1);
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);
    toolbar.dispose();
  });

  it("disposes idempotently and removes only its owned inner toolbar", () => {
    const host = document.createElement("section");
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Existing label");
    const retained = document.createElement("span");
    retained.textContent = "retained";
    const retainedLink = document.createElement("a");
    retainedLink.href = "/kept";
    retainedLink.textContent = "kept link";
    const retainedButton = document.createElement("button");
    retainedButton.textContent = "kept button";
    host.append(retained, retainedLink, retainedButton);
    document.body.append(host);
    const store = new TestStateStore(baseEntries(), true);
    let dispatches = 0;
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: () => {
        dispatches += 1;
        return completedDispatch();
      },
    });
    const oldButton = toolbarButtons(host)[0]!;
    expect(store.listenerCount).toBe(1);

    expect(() => toolbar.dispose()).not.toThrow();
    expect(() => toolbar.dispose()).not.toThrow();
    expect(toolbar.state).toBe("disposed");
    expect(store.listenerCount).toBe(0);
    expect(host.getAttribute("role")).toBe("region");
    expect(host.getAttribute("aria-label")).toBe("Existing label");
    expect(host.hasAttribute("aria-orientation")).toBe(false);
    expect(host.contains(retained)).toBe(true);
    expect(host.contains(retainedLink)).toBe(true);
    expect(host.contains(retainedButton)).toBe(true);
    expect(retainedLink.closest('[role="toolbar"]')).toBeNull();
    expect(retainedButton.closest('[role="toolbar"]')).toBeNull();
    expect(toolbarButtons(host)).toHaveLength(0);
    oldButton.click();
    store.publish(baseEntries());
    expect(dispatches).toBe(0);

    const replacement = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );
    replacement.dispose();
  });

  it("rejects duplicate live ownership and invalid subscription wiring", () => {
    const host = mountHost();
    const first = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );
    expect(
      () =>
        new BreditorToolbar(
          host,
          DEFAULT_TOOLBAR_MANIFEST,
          new TestStateStore(baseEntries()),
          { dispatch: completedDispatch },
        ),
    ).toThrow(/already/u);
    first.dispose();

    const invalidHost = mountHost();
    expect(
      () =>
        new BreditorToolbar(
          invalidHost,
          createToolbarManifest(DEFAULT_TOOLBAR_MANIFEST),
          {
            getSnapshot: () => ({ entries: [] }),
            getStatus: () => ({ status: "fresh" as const }),
            subscribe: () => undefined as never,
          },
          { dispatch: completedDispatch },
        ),
    ).toThrow(/subscription/u);
    expect(invalidHost.hasAttribute("role")).toBe(false);
    expect(toolbarButtons(invalidHost)).toHaveLength(0);
  });

  it("reserves its mount before application-controlled inspection can reenter", () => {
    const host = mountHost();
    const outerStore = new TestStateStore(baseEntries());
    const nestedStore = new TestStateStore(baseEntries());
    let nestedError: unknown;
    let attempted = false;
    const manifestTarget = {
      label: "Editor controls",
      controls: DEFAULT_TOOLBAR_MANIFEST.controls,
    };
    const reentrantManifest = new Proxy(manifestTarget, {
      getOwnPropertyDescriptor(target, key) {
        if (!attempted) {
          attempted = true;
          try {
            new BreditorToolbar(
              host,
              DEFAULT_TOOLBAR_MANIFEST,
              nestedStore,
              { dispatch: completedDispatch },
            );
          } catch (error) {
            nestedError = error;
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    const toolbar = new BreditorToolbar(
      host,
      reentrantManifest,
      outerStore,
      { dispatch: completedDispatch },
    );

    expect(attempted).toBe(true);
    expect(nestedError).toBeInstanceOf(TypeError);
    expect(String(nestedError)).toMatch(/already/u);
    expect(host.querySelectorAll('[data-breditor-toolbar-root]')).toHaveLength(1);
    expect(outerStore.listenerCount).toBe(1);
    expect(nestedStore.listenerCount).toBe(0);
    toolbar.dispose();
  });

  it("makes a callback retained by an invalid subscriber inert before rollback", () => {
    const host = mountHost();
    let retained: (() => void) | undefined;
    let reads = 0;
    expect(
      () =>
        new BreditorToolbar(
          host,
          DEFAULT_TOOLBAR_MANIFEST,
          {
            getSnapshot: () => {
              reads += 1;
              return { entries: baseEntries() };
            },
            getStatus: () => ({ status: "fresh" as const }),
            subscribe: (listener) => {
              retained = listener;
              return undefined as never;
            },
          },
          { dispatch: completedDispatch },
        ),
    ).toThrow(/subscription/u);
    expect(toolbarButtons(host)).toHaveLength(0);
    expect(reads).toBe(0);
    retained?.();
    expect(reads).toBe(0);
  });

  it("uses an isolated same-document root and rejects unsafe mount containers", () => {
    const separateDocument = document.implementation.createHTMLDocument("toolbar");
    const safeHost = separateDocument.createElement("nav");
    safeHost.setAttribute("aria-labelledby", "application-owned-label");
    separateDocument.body.append(safeHost);
    const toolbar = new BreditorToolbar(
      safeHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );
    expect(toolbar.element.ownerDocument).toBe(separateDocument);
    expect(toolbar.element.getAttribute("aria-label")).toBe("Editor controls");
    expect(safeHost.getAttribute("aria-labelledby")).toBe("application-owned-label");
    expect(
      toolbarButtons(safeHost).filter((button) => button.tabIndex === 0),
    ).toHaveLength(1);
    toolbar.dispose();

    const unsafeHosts: HTMLElement[] = [
      document.createElement("button"),
      document.createElement("input"),
      document.createElement("select"),
      document.createElement("textarea"),
      document.createElement("a"),
    ];
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    unsafeHosts.push(roleButton);
    const tabbable = document.createElement("div");
    tabbable.tabIndex = 0;
    unsafeHosts.push(tabbable);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const editableChild = document.createElement("div");
    editable.append(editableChild);
    unsafeHosts.push(editable, editableChild);

    for (const unsafeHost of unsafeHosts) {
      if (!unsafeHost.isConnected) document.body.append(unsafeHost);
      expect(
        () =>
          new BreditorToolbar(
            unsafeHost,
            DEFAULT_TOOLBAR_MANIFEST,
            new TestStateStore(baseEntries()),
            { dispatch: completedDispatch },
          ),
        unsafeHost.outerHTML,
      ).toThrow(/host/u);
      expect(unsafeHost.querySelector('[data-breditor-toolbar-root]')).toBeNull();
    }
  });
});

class TestStateStore {
  #snapshot: ToolbarActionStateSnapshot | undefined;
  #status: "fresh" | "stale" = "fresh";
  readonly #listeners = new Set<() => void>();
  readonly #throwOnUnsubscribe: boolean;

  constructor(entries: readonly ToolbarActionStateEntry[], throwOnUnsubscribe = false) {
    this.#snapshot = Object.freeze({ entries: Object.freeze([...entries]) });
    this.#throwOnUnsubscribe = throwOnUnsubscribe;
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  getSnapshot(): ToolbarActionStateSnapshot | undefined {
    return this.#snapshot;
  }

  getStatus(): Readonly<{ status: "fresh" | "stale" }> {
    return Object.freeze({ status: this.#status });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
      if (this.#throwOnUnsubscribe) throw new Error("unsubscribe failure");
    };
  }

  publish(entries: readonly ToolbarActionStateEntry[]): void {
    this.setWithoutPublishing(entries);
    for (const listener of [...this.#listeners]) listener();
  }

  publishRaw(snapshot: unknown): void {
    this.#snapshot = snapshot as ToolbarActionStateSnapshot;
    for (const listener of [...this.#listeners]) listener();
  }

  publishStatus(status: "fresh" | "stale"): void {
    this.#status = status;
    for (const listener of [...this.#listeners]) listener();
  }

  setWithoutPublishing(entries: readonly ToolbarActionStateEntry[]): void {
    this.#snapshot = Object.freeze({ entries: Object.freeze([...entries]) });
  }
}

function state(
  id: string,
  availability: ToolbarActionStateEntry["availability"],
  activation: ToolbarActionStateEntry["activation"],
): ToolbarActionStateEntry {
  return Object.freeze({ id, availability, activation });
}

function baseEntries(): readonly ToolbarActionStateEntry[] {
  return Object.freeze([
    state(BASE_TOOLBAR_STATE_IDS.bold, "enabled", "inactive"),
    state(BASE_TOOLBAR_STATE_IDS.undo, "enabled", "stateless"),
    state(BASE_TOOLBAR_STATE_IDS.redo, "disabled", "stateless"),
  ]);
}

function mountHost(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
}

function toolbarButtons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button[data-breditor-state-id]"));
}

function disabledValues(host: HTMLElement): Array<string | null> {
  return toolbarButtons(host).map((button) => button.getAttribute("aria-disabled"));
}

function tabIndexes(buttons: readonly HTMLButtonElement[]): Array<string | null> {
  return buttons.map((button) => button.getAttribute("tabindex"));
}

function completedDispatch() {
  return toolbarCommandDispatchResult("completed");
}

function key(button: HTMLButtonElement, value: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: value,
  });
  button.dispatchEvent(event);
  return event;
}

function toolbarDelivery(): EditorDeliveryToken {
  const projection = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "toolbar-tests", revision: "0" },
    paragraphs: [{ runs: [] }],
  });
  if (!projection.ok) throw new Error("projection fixture failed");
  const rendered = new BreditorDomRenderer().render(
    document.createElement("div"),
    projection.value,
  );
  if (!rendered.ok) throw new Error("render fixture failed");
  return issueEditorDeliveryToken(
    projection.value,
    rendered.value.rendered,
    0n,
    Symbol("toolbar-test-authority"),
  );
}
