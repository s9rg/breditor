import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BreditorToolbar,
  MAX_TOOLBAR_STATE_ENTRIES,
  toolbarCommandDispatchResult,
  toolbarCommandRequest,
  type ToolbarActionStateEntry,
  type ToolbarActionStateSnapshot,
  type ToolbarActionStateStore,
  type ToolbarCommandDispatcher,
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
  type ToolbarCommandDeclaration,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
import {
  DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
} from "./keyboard_shortcut_profile_contract.js";

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
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Bold",
      "Undo",
      "Redo",
    ]);
    expect(buttons.every((button) => button.type === "button")).toBe(true);
    expect(buttons.map((button) => button.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
    expect(
      buttons.map((button) => button.getAttribute("aria-disabled")),
    ).toEqual(["false", "false", "true"]);
    expect(buttons.map((button) => button.hasAttribute("disabled"))).toEqual([
      false,
      false,
      false,
    ]);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.hasAttribute("aria-pressed")).toBe(false);
    expect(buttons[2]?.hasAttribute("aria-pressed")).toBe(false);
    expect(toolbar.validateCanonicalDom()).toBe(true);

    const foreignSibling = document.createElement("span");
    host.append(foreignSibling);
    expect(toolbar.validateCanonicalDom()).toBe(false);
    foreignSibling.remove();

    const foreignChild = document.createElement("span");
    toolbar.element.append(foreignChild);
    expect(toolbar.validateCanonicalDom()).toBe(false);
    foreignChild.remove();
    expect(toolbar.validateCanonicalDom()).toBe(true);

    toolbar.dispose();
  });

  it("uses native topology and attribute facts despite forged toolbar shadows", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: vi.fn(completedDispatch) },
    );
    const canonicalHostChildren = Object.freeze([toolbar.element]);
    const canonicalRootChildren = Object.freeze(
      Array.from(toolbar.element.childNodes),
    );
    const nativeHostChildList = host.childNodes;
    const nativeRootChildList = toolbar.element.childNodes;
    const foreignSibling = document.createElement("aside");
    const foreignChild = document.createElement("span");
    host.append(foreignSibling);
    toolbar.element.append(foreignChild);
    toolbar.element.setAttribute("data-application", "preserve");
    const hostChildNodes = vi.fn(() => canonicalHostChildren);
    const rootChildNodes = vi.fn(() => canonicalRootChildren);
    const rootAttributes = vi.fn(() => Object.freeze({ length: 4 }));
    const hostIterator = vi.fn(function* () {
      yield toolbar.element;
    });
    const rootIterator = vi.fn(function* () {
      yield* canonicalRootChildren;
    });
    Object.defineProperty(nativeHostChildList, Symbol.iterator, {
      configurable: true,
      value: hostIterator,
    });
    Object.defineProperty(nativeRootChildList, Symbol.iterator, {
      configurable: true,
      value: rootIterator,
    });
    Object.defineProperty(host, "childNodes", {
      configurable: true,
      get: hostChildNodes,
    });
    Object.defineProperties(toolbar.element, {
      childNodes: { configurable: true, get: rootChildNodes },
      attributes: { configurable: true, get: rootAttributes },
    });

    try {
      expect(toolbar.validateCanonicalDom()).toBe(false);
      expect(hostChildNodes).not.toHaveBeenCalled();
      expect(rootChildNodes).not.toHaveBeenCalled();
      expect(rootAttributes).not.toHaveBeenCalled();
      expect(hostIterator).not.toHaveBeenCalled();
      expect(rootIterator).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(nativeHostChildList, Symbol.iterator);
      Reflect.deleteProperty(nativeRootChildList, Symbol.iterator);
      Reflect.deleteProperty(host, "childNodes");
      Reflect.deleteProperty(toolbar.element, "childNodes");
      Reflect.deleteProperty(toolbar.element, "attributes");
      toolbar.dispose();
      foreignSibling.remove();
    }
  });

  it("rejects same-button semantic and accessibility drift", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );
    const bold = toolbarButtons(host)[0];
    if (bold === undefined) throw new Error("missing Bold toolbar button");

    const expectRejectedUntilRestored = (
      mutate: () => void,
      restore: () => void,
    ): void => {
      mutate();
      expect(toolbar.validateCanonicalDom()).toBe(false);
      restore();
      expect(toolbar.validateCanonicalDom()).toBe(true);
    };

    expectRejectedUntilRestored(
      () => {
        bold.textContent = "Forged";
      },
      () => {
        bold.textContent = "Bold";
      },
    );
    for (const [name, forged, canonical] of [
      ["type", "submit", "button"],
      ["aria-label", "Forged", "Bold"],
      ["aria-disabled", "true", "false"],
      ["aria-pressed", "mixed", "false"],
      ["tabindex", "-1", "0"],
      ["data-breditor-state-id", "forged/control", BASE_TOOLBAR_STATE_IDS.bold],
    ] as const) {
      expectRejectedUntilRestored(
        () => bold.setAttribute(name, forged),
        () => bold.setAttribute(name, canonical),
      );
    }
    expectRejectedUntilRestored(
      () => bold.setAttribute("data-application", "forged"),
      () => bold.removeAttribute("data-application"),
    );

    toolbar.dispose();
  });

  it.each(["label", "root relocation"] as const)(
    "faults instead of dispatching through %s drift",
    (violation) => {
      const host = mountHost();
      const dispatch = vi.fn(completedDispatch);
      const toolbar = new BreditorToolbar(
        host,
        DEFAULT_TOOLBAR_MANIFEST,
        new TestStateStore(baseEntries()),
        { dispatch },
      );
      const bold = toolbarButtons(host)[0];
      if (bold === undefined) throw new Error("missing Bold toolbar button");
      if (violation === "label") {
        bold.replaceChildren("Undo");
      } else {
        const other = document.createElement("div");
        document.body.append(other);
        other.append(toolbar.element);
      }

      bold.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

      expect(dispatch).not.toHaveBeenCalled();
      expect(toolbar.state).toBe("faulted");
      toolbar.dispose();
    },
  );

  it("faults instead of dispatching after retained mount children are reordered", () => {
    const host = mountHost();
    const first = document.createTextNode("first");
    const second = document.createComment("second");
    host.append(first, second);
    const dispatch = vi.fn(completedDispatch);
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch },
    );
    const bold = toolbarButtons(host)[0];
    if (bold === undefined) throw new Error("missing Bold toolbar button");
    expect(toolbar.validateCanonicalDom()).toBe(true);

    host.insertBefore(second, first);
    bold.click();

    expect(dispatch).not.toHaveBeenCalled();
    expect(toolbar.state).toBe("faulted");
    expect([...host.childNodes]).toEqual([second, first, toolbar.element]);
    toolbar.dispose();
    expect([...host.childNodes]).toEqual([second, first]);
  });

  it("uses native host DOM operations despite own mutation shadows", () => {
    const hostDocument =
      document.implementation.createHTMLDocument("shadowed toolbar");
    const host = hostDocument.createElement("div");
    hostDocument.body.append(host);
    const createElement = vi.fn(() => {
      throw new Error("shadowed createElement must not be called");
    });
    Object.defineProperty(hostDocument, "createElement", {
      configurable: true,
      value: createElement,
    });
    const ownerDocument = vi.fn(() => {
      throw new Error("shadowed ownerDocument must not be read");
    });
    const append = vi.fn();
    const appendChild = vi.fn(() => {
      throw new Error("shadowed appendChild must not be called");
    });
    const getAttribute = vi.fn(() => {
      throw new Error("shadowed getAttribute must not be called");
    });
    const hasAttribute = vi.fn(() => {
      throw new Error("shadowed hasAttribute must not be called");
    });
    const setAttribute = vi.fn(() => {
      throw new Error("shadowed setAttribute must not be called");
    });
    const removeAttribute = vi.fn(() => {
      throw new Error("shadowed removeAttribute must not be called");
    });
    Object.defineProperties(host, {
      ownerDocument: { configurable: true, get: ownerDocument },
      append: { configurable: true, value: append },
      appendChild: { configurable: true, value: appendChild },
      getAttribute: { configurable: true, value: getAttribute },
      hasAttribute: { configurable: true, value: hasAttribute },
      setAttribute: { configurable: true, value: setAttribute },
      removeAttribute: { configurable: true, value: removeAttribute },
    });

    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );

    expect(toolbar.element.parentNode).toBe(host);
    expect(toolbar.element.ownerDocument).toBe(hostDocument);
    expect(toolbar.element.getAttribute("data-breditor-toolbar-root")).toBe("");
    expect(toolbarButtons(toolbar.element)).toHaveLength(3);
    for (const shadow of [
      createElement,
      ownerDocument,
      append,
      appendChild,
      getAttribute,
      hasAttribute,
      setAttribute,
      removeAttribute,
    ]) {
      expect(shadow).not.toHaveBeenCalled();
    }

    toolbar.dispose();
    expect(host.childNodes).toHaveLength(0);
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

  it.each([
    [
      "control",
      ["Control+B", "Control+Z", "Control+Y Control+Shift+Z"],
    ],
    ["meta", ["Meta+B", "Meta+Z", "Meta+Y Meta+Shift+Z"]],
  ] as const)(
    "projects descriptor-compiled shortcuts for the host-selected %s modifier",
    (primaryModifier, expected) => {
      const host = mountHost();
      const toolbar = new BreditorToolbar(
        host,
        DEFAULT_TOOLBAR_MANIFEST,
        new TestStateStore(baseEntries()),
        { dispatch: completedDispatch },
        {
          keyboardShortcuts: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
          primaryModifier,
          shortcutsEnabled: true,
        },
      );
      const buttons = toolbarButtons(host);

      expect(
        buttons.map((button) => button.getAttribute("aria-keyshortcuts")),
      ).toEqual(expected);
      expect(toolbar.validateCanonicalDom()).toBe(true);

      const bold = buttons[0];
      if (bold === undefined) throw new Error("missing Bold toolbar button");
      bold.setAttribute("aria-keyshortcuts", `${expected[0]} Shift+X`);
      expect(toolbar.validateCanonicalDom()).toBe(false);
      bold.setAttribute("aria-keyshortcuts", expected[0]);
      expect(toolbar.validateCanonicalDom()).toBe(true);

      toolbar.dispose();
    },
  );

  it("omits shortcut metadata when shortcuts are disabled or a control has no binding", () => {
    const disabledHost = mountHost();
    const disabled = new BreditorToolbar(
      disabledHost,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
      {
        keyboardShortcuts: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
        primaryModifier: "control",
        shortcutsEnabled: false,
      },
    );
    expect(
      toolbarButtons(disabledHost).every(
        (button) => !button.hasAttribute("aria-keyshortcuts"),
      ),
    ).toBe(true);
    expect(disabled.validateCanonicalDom()).toBe(true);
    disabled.dispose();

    const unboundHost = mountHost();
    const unboundManifest = createToolbarManifest({
      label: "Unbound controls",
      controls: [
        {
          kind: "button",
          stateId: "example/control-emphasis",
          label: "Emphasis",
          activation: "tracked",
          command: {
            kind: "action",
            actionId: "example/toggle-emphasis",
            input: { kind: "none" },
            history: "closeBefore",
          },
        },
      ],
    });
    const unbound = new BreditorToolbar(
      unboundHost,
      unboundManifest,
      new TestStateStore([
        state("example/control-emphasis", "enabled", "inactive"),
      ]),
      { dispatch: completedDispatch },
      {
        keyboardShortcuts: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
        primaryModifier: "control",
        shortcutsEnabled: true,
      },
    );
    expect(
      toolbarButtons(unboundHost)[0]?.hasAttribute("aria-keyshortcuts"),
    ).toBe(false);
    expect(unbound.validateCanonicalDom()).toBe(true);
    unbound.dispose();
  });

  it("rejects malformed or forged shortcut presentation before mounting", () => {
    const forgedHost = mountHost();
    expect(
      () =>
        new BreditorToolbar(
          forgedHost,
          DEFAULT_TOOLBAR_MANIFEST,
          new TestStateStore(baseEntries()),
          { dispatch: completedDispatch },
          {
            keyboardShortcuts: {
              manifest: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS.manifest,
              profileDescriptor: undefined,
              bindings: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS.bindings,
            } as never,
            primaryModifier: "control",
            shortcutsEnabled: true,
          },
        ),
    ).toThrow(/presentation/u);
    expect(forgedHost.childNodes).toHaveLength(0);

    const incompleteHost = mountHost();
    expect(
      () =>
        new BreditorToolbar(
          incompleteHost,
          DEFAULT_TOOLBAR_MANIFEST,
          new TestStateStore(baseEntries()),
          { dispatch: completedDispatch },
          { shortcutsEnabled: true },
        ),
    ).toThrow(/presentation/u);
    expect(incompleteHost.childNodes).toHaveLength(0);
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
      entries: Array.from(
        { length: MAX_TOOLBAR_STATE_ENTRIES + 1 },
        (_, index) => state(`example/control-${index}`, "enabled", "stateless"),
      ),
    });
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    store.publishRaw({
      entries: [{ id: BASE_TOOLBAR_STATE_IDS.bold, availability: "maybe" }],
    });
    expect(disabledValues(host)).toEqual(["true", "true", "true"]);

    store.publish(baseEntries());
    expect(disabledValues(host)).toEqual(["false", "false", "true"]);
    toolbar.dispose();
  });

  it("accepts the complete 514-entry engine snapshot while presenting a toolbar subset", () => {
    const host = mountHost();
    const store = new TestStateStore(baseEntries());
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: completedDispatch,
    });
    const filler = Array.from(
      { length: MAX_TOOLBAR_STATE_ENTRIES - baseEntries().length },
      (_, index) =>
        state(`example/capacity-${index}`, "enabled", "stateless"),
    );

    store.publish([...baseEntries(), ...filler]);

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

  it("does not invoke an accessor-backed action-state value", () => {
    const host = mountHost();
    const store = new TestStateStore(baseEntries());
    const toolbar = new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, store, {
      dispatch: completedDispatch,
    });
    let reads = 0;
    const entry = {
      id: BASE_TOOLBAR_STATE_IDS.bold,
      availability: "enabled",
      activation: "inactive",
    };
    Object.defineProperty(entry, "value", {
      enumerable: true,
      get() {
        reads += 1;
        return undefined;
      },
    });

    store.publishRaw({ entries: [entry] });

    expect(reads).toBe(0);
    expect(toolbarButtons(host)[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(toolbar.state).toBe("live");
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
      command: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
    });
    expect(Object.isFrozen(invocations[0])).toBe(true);
    expect(invocations[0]?.command).toBe(
      manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
    );
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

  it("uses native toolbar event facts and cancellation below own shadows", () => {
    const host = mountHost();
    const dispatch = vi.fn(completedDispatch);
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch },
    );
    const bold = toolbarButtons(host)[0]!;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    const shadow = vi.fn(() => {
      throw new Error("own event shadow must not run");
    });
    for (const name of ["type", "target", "button", "defaultPrevented"]) {
      Object.defineProperty(event, name, {
        configurable: true,
        get: shadow,
      });
    }
    Object.defineProperty(event, "preventDefault", {
      configurable: true,
      value: shadow,
    });

    expect(() => bold.dispatchEvent(event)).not.toThrow();
    for (const name of [
      "type",
      "target",
      "button",
      "defaultPrevented",
      "preventDefault",
    ]) {
      Reflect.deleteProperty(event, name);
    }
    expect(shadow).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(toolbar.state).toBe("live");
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

  it.each(["noOp", "throw"] as const)(
    "uses native topology and focus proofs during %s-shadowed navigation and restoration",
    (mode) => {
      const editor = document.createElement("div");
      editor.tabIndex = 0;
      const host = document.createElement("div");
      document.body.append(editor, host);
      const dispatch = vi.fn(() => {
        editor.focus();
        return completedDispatch();
      });
      const toolbar = new BreditorToolbar(
        host,
        DEFAULT_TOOLBAR_MANIFEST,
        new TestStateStore(baseEntries()),
        { dispatch },
      );
      const [bold, undo] = toolbarButtons(host);
      if (bold === undefined || undo === undefined) {
        throw new Error("toolbar buttons are unavailable");
      }
      bold.focus();

      const shadowResult = <Value>(value: Value): Value => {
        if (mode === "throw") {
          throw new DOMException(
            "own focus topology shadow ran",
            "InvalidStateError",
          );
        }
        return value;
      };
      const focusShadow = vi.fn(() => shadowResult(undefined));
      const parentNodeShadow = vi.fn(() => shadowResult(toolbar.element));
      const isConnectedShadow = vi.fn(() => shadowResult(true));
      const ownerDocumentShadow = vi.fn(() => shadowResult(document));
      const activeElementShadow = vi.fn(() => shadowResult(undo));
      const activeElementDescriptor = Object.getOwnPropertyDescriptor(
        document,
        "activeElement",
      );
      Object.defineProperties(undo, {
        focus: { configurable: true, value: focusShadow },
        parentNode: { configurable: true, get: parentNodeShadow },
        isConnected: { configurable: true, get: isConnectedShadow },
        ownerDocument: {
          configurable: true,
          get: ownerDocumentShadow,
        },
      });
      Object.defineProperty(document, "activeElement", {
        configurable: true,
        get: activeElementShadow,
      });

      try {
        expect(key(bold, "ArrowRight").defaultPrevented).toBe(true);
        undo.click();

        Reflect.deleteProperty(undo, "focus");
        Reflect.deleteProperty(undo, "parentNode");
        Reflect.deleteProperty(undo, "isConnected");
        Reflect.deleteProperty(undo, "ownerDocument");
        if (activeElementDescriptor === undefined) {
          Reflect.deleteProperty(document, "activeElement");
        } else {
          Object.defineProperty(
            document,
            "activeElement",
            activeElementDescriptor,
          );
        }

        expect(toolbar.state).toBe("live");
        expect(dispatch).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(undo);
        for (const shadow of [
          focusShadow,
          parentNodeShadow,
          isConnectedShadow,
          ownerDocumentShadow,
          activeElementShadow,
        ]) {
          expect(shadow).not.toHaveBeenCalled();
        }
      } finally {
        Reflect.deleteProperty(undo, "focus");
        Reflect.deleteProperty(undo, "parentNode");
        Reflect.deleteProperty(undo, "isConnected");
        Reflect.deleteProperty(undo, "ownerDocument");
        if (activeElementDescriptor === undefined) {
          Reflect.deleteProperty(document, "activeElement");
        } else {
          Object.defineProperty(
            document,
            "activeElement",
            activeElementDescriptor,
          );
        }
        toolbar.dispose();
      }
    },
  );

  it("ignores a detached generated button despite forged topology and focus shadows", () => {
    const host = mountHost();
    const dispatch = vi.fn(completedDispatch);
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch },
    );
    const button = toolbarButtons(host)[0];
    if (button === undefined) throw new Error("toolbar button is unavailable");
    toolbar.element.removeChild(button);

    const parentNodeShadow = vi.fn(() => toolbar.element);
    const isConnectedShadow = vi.fn(() => true);
    const ownerDocumentShadow = vi.fn(() => document);
    const activeElementShadow = vi.fn(() => button);
    const activeElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "activeElement",
    );
    Object.defineProperties(button, {
      parentNode: { configurable: true, get: parentNodeShadow },
      isConnected: { configurable: true, get: isConnectedShadow },
      ownerDocument: { configurable: true, get: ownerDocumentShadow },
    });
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: activeElementShadow,
    });

    try {
      button.click();

      expect(toolbar.state).toBe("live");
      expect(dispatch).not.toHaveBeenCalled();
      for (const shadow of [
        parentNodeShadow,
        isConnectedShadow,
        ownerDocumentShadow,
        activeElementShadow,
      ]) {
        expect(shadow).not.toHaveBeenCalled();
      }
    } finally {
      Reflect.deleteProperty(button, "parentNode");
      Reflect.deleteProperty(button, "isConnected");
      Reflect.deleteProperty(button, "ownerDocument");
      if (activeElementDescriptor === undefined) {
        Reflect.deleteProperty(document, "activeElement");
      } else {
        Object.defineProperty(
          document,
          "activeElement",
          activeElementDescriptor,
        );
      }
      toolbar.dispose();
    }
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

  it("maps declarative intents, actions, and history to preserve-selection requests", () => {
    const delivery = toolbarDelivery();
    const bold = toolbarCommandRequest(delivery, {
      stateId: BASE_TOOLBAR_STATE_IDS.bold,
      selection: "preserve",
      command: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
    });
    expect(bold).toMatchObject({
      delivery,
      selection: { kind: "preserve" },
      source: { kind: "toolbar", detail: BASE_TOOLBAR_STATE_IDS.bold },
      requirements: { selection: "preserve", history: "closeBefore" },
      command: {
        kind: "intent",
        intentId: "breditor/format-strong",
        input: { kind: "none" },
      },
    });
    expect(Object.isFrozen(bold.selection)).toBe(true);

    expect(
      toolbarCommandRequest(delivery, {
        stateId: "example/link-presence",
        selection: "preserve",
        command: {
          kind: "intentJson",
          intentId: "example/set-link-intent",
          inputJson: '{"operation":"remove"}',
        },
      }),
    ).toMatchObject({
      selection: { kind: "preserve" },
      requirements: { selection: "preserve", history: "closeBefore" },
      command: {
        kind: "intent",
        intentId: "example/set-link-intent",
        input: { kind: "json", value: '{"operation":"remove"}' },
      },
    });

    expect(
      toolbarCommandRequest(delivery, {
        stateId: BASE_TOOLBAR_STATE_IDS.undo,
        selection: "preserve",
        command: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 1),
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
        command: manifestButtonCommand(stringManifest, 0),
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

  it("admits toolbar requests through own data only and contains hostile objects", () => {
    const delivery = toolbarDelivery();
    let reads = 0;
    const accessorInvocation = Object.defineProperties({}, {
      stateId: {
        enumerable: true,
        get() {
          reads += 1;
          return BASE_TOOLBAR_STATE_IDS.bold;
        },
      },
      selection: { enumerable: true, value: "preserve" },
      command: {
        enumerable: true,
        value: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
      },
    });
    expect(() =>
      toolbarCommandRequest(
        delivery,
        accessorInvocation as ToolbarCommandInvocation,
      ),
    ).toThrow(/toolbar invocation/u);

    const intent = Object.defineProperties({}, {
      kind: { enumerable: true, value: "intent" },
      intentId: {
        enumerable: true,
        get() {
          reads += 1;
          return "example/format-highlight";
        },
      },
    });
    expect(() =>
      toolbarCommandRequest(delivery, {
        stateId: "example/control-highlight",
        selection: "preserve",
        command: intent as ToolbarCommandInvocation["command"],
      }),
    ).toThrow(/toolbar invocation/u);
    expect(reads).toBe(0);

    expect(() =>
      toolbarCommandRequest(delivery, {
        stateId: BASE_TOOLBAR_STATE_IDS.bold,
        selection: "preserve",
        command: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
        extra: true,
      } as ToolbarCommandInvocation),
    ).toThrow(/toolbar invocation/u);

    const hostile = new Proxy(
      {
        stateId: BASE_TOOLBAR_STATE_IDS.bold,
        selection: "preserve" as const,
        command: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
      },
      {
        ownKeys() {
          throw new Error("hostile invocation");
        },
      },
    );
    expect(() => toolbarCommandRequest(delivery, hostile)).toThrow(
      /toolbar invocation/u,
    );

    const inherited = Object.assign(
      Object.create({ stateId: BASE_TOOLBAR_STATE_IDS.bold }),
      {
        selection: "preserve",
        command: manifestButtonCommand(DEFAULT_TOOLBAR_MANIFEST, 0),
      },
    ) as ToolbarCommandInvocation;
    expect(() => toolbarCommandRequest(delivery, inherited)).toThrow(
      /toolbar invocation/u,
    );
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

  it("publishes one contained terminal lifecycle transition", async () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: () => toolbarCommandDispatchResult("failed") },
    );
    const observed = vi.fn();
    const rejected = vi.fn(() => Promise.reject(new Error("listener-local")));
    const releaseFirst = toolbar.subscribe(observed);
    const releaseSecond = toolbar.subscribe(observed);
    toolbar.subscribe(rejected);

    releaseFirst();
    toolbarButtons(host)[0]?.click();
    await Promise.resolve();

    expect(toolbar.state).toBe("faulted");
    expect(observed).toHaveBeenCalledExactlyOnceWith("faulted");
    expect(rejected).toHaveBeenCalledExactlyOnceWith("faulted");
    releaseSecond();
    toolbar.dispose();
    expect(observed).toHaveBeenCalledOnce();
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
    oldButton.click();
    expect(dispatches).toBe(1);

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
    expect(dispatches).toBe(1);

    const replacement = new BreditorToolbar(
      host,
      DEFAULT_TOOLBAR_MANIFEST,
      new TestStateStore(baseEntries()),
      { dispatch: completedDispatch },
    );
    replacement.dispose();
  });

  it.each(["noOp", "throw"] as const)(
    "uses native teardown despite %s own removal shadows",
    (mode) => {
      const host = mountHost();
      const toolbar = new BreditorToolbar(
        host,
        DEFAULT_TOOLBAR_MANIFEST,
        new TestStateStore(baseEntries()),
        { dispatch: completedDispatch },
      );
      const root = toolbar.element;
      const buttons = toolbarButtons(root);
      const removeShadows = [root, ...buttons].map((element) => {
        const shadow = vi.fn(() => {
          if (mode === "throw") {
            throw new DOMException(
              "own remove shadow ran",
              "InvalidStateError",
            );
          }
        });
        Object.defineProperty(element, "remove", {
          configurable: true,
          value: shadow,
        });
        return shadow;
      });
      const listenerShadows = buttons.map((button) => {
        const shadow = vi.fn(() => {
          if (mode === "throw") {
            throw new DOMException(
              "own removeEventListener shadow ran",
              "InvalidStateError",
            );
          }
        });
        Object.defineProperty(button, "removeEventListener", {
          configurable: true,
          value: shadow,
        });
        return shadow;
      });

      expect(() => toolbar.dispose()).not.toThrow();

      expect(toolbar.state).toBe("disposed");
      expect(host.childNodes).toHaveLength(0);
      expect(root.parentNode).toBeNull();
      expect(buttons.every((button) => button.parentNode === null)).toBe(true);
      for (const shadow of [...removeShadows, ...listenerShadows]) {
        expect(shadow).not.toHaveBeenCalled();
      }

      const replacement = new BreditorToolbar(
        host,
        DEFAULT_TOOLBAR_MANIFEST,
        new TestStateStore(baseEntries()),
        { dispatch: completedDispatch },
      );
      expect(replacement.element.parentNode).toBe(host);
      replacement.dispose();
    },
  );

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
            new BreditorToolbar(host, DEFAULT_TOOLBAR_MANIFEST, nestedStore, {
              dispatch: completedDispatch,
            });
          } catch (error) {
            nestedError = error;
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    const toolbar = new BreditorToolbar(host, reentrantManifest, outerStore, {
      dispatch: completedDispatch,
    });

    expect(attempted).toBe(true);
    expect(nestedError).toBeInstanceOf(TypeError);
    expect(String(nestedError)).toMatch(/already/u);
    expect(host.querySelectorAll("[data-breditor-toolbar-root]")).toHaveLength(
      1,
    );
    expect(outerStore.listenerCount).toBe(1);
    expect(nestedStore.listenerCount).toBe(0);
    toolbar.dispose();
  });

  it.each(["dispatcher getter", "initial state read"] as const)(
    "re-proves retained mount children after a hostile %s",
    (phase) => {
      const host = mountHost();
      const first = document.createTextNode("first");
      const second = document.createElement("aside");
      second.textContent = "second";
      host.append(first, second);
      let changed = false;
      const changeBaseline = vi.fn(() => {
        if (changed) return;
        changed = true;
        host.append(first);
      });
      const stateStore: ToolbarActionStateStore =
        phase === "initial state read"
          ? {
              getSnapshot: () => {
                changeBaseline();
                return { entries: baseEntries() };
              },
              getStatus: () => ({ status: "fresh" as const }),
              subscribe: () => () => undefined,
            }
          : new TestStateStore(baseEntries());
      const dispatcher: ToolbarCommandDispatcher =
        phase === "dispatcher getter"
          ? {
              get dispatch() {
                changeBaseline();
                return completedDispatch;
              },
            }
          : { dispatch: completedDispatch };

      expect(
        () =>
          new BreditorToolbar(
            host,
            DEFAULT_TOOLBAR_MANIFEST,
            stateStore,
            dispatcher,
          ),
      ).toThrow(/host changed/u);
      expect(changeBaseline).toHaveBeenCalledOnce();
      expect([...host.childNodes]).toEqual([second, first]);
      expect(
        host.querySelector("[data-breditor-toolbar-root]"),
      ).toBeNull();

      const replacement = new BreditorToolbar(
        host,
        DEFAULT_TOOLBAR_MANIFEST,
        new TestStateStore(baseEntries()),
        { dispatch: completedDispatch },
      );
      expect(replacement.validateCanonicalDom()).toBe(true);
      replacement.dispose();
      expect([...host.childNodes]).toEqual([second, first]);
    },
  );

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
    const separateDocument =
      document.implementation.createHTMLDocument("toolbar");
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
    expect(safeHost.getAttribute("aria-labelledby")).toBe(
      "application-owned-label",
    );
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
    Object.defineProperty(unsafeHosts[0], "tagName", {
      configurable: true,
      value: "DIV",
    });
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    Object.defineProperties(roleButton, {
      getAttribute: { configurable: true, value: () => null },
      hasAttribute: { configurable: true, value: () => false },
    });
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
      expect(
        unsafeHost.querySelector("[data-breditor-toolbar-root]"),
      ).toBeNull();
    }
  });
});

class TestStateStore {
  #snapshot: ToolbarActionStateSnapshot | undefined;
  #status: "fresh" | "stale" = "fresh";
  readonly #listeners = new Set<() => void>();
  readonly #throwOnUnsubscribe: boolean;

  constructor(
    entries: readonly ToolbarActionStateEntry[],
    throwOnUnsubscribe = false,
  ) {
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
  return Array.from(
    host.querySelectorAll<HTMLButtonElement>("button[data-breditor-state-id]"),
  );
}

function disabledValues(host: HTMLElement): Array<string | null> {
  return toolbarButtons(host).map((button) =>
    button.getAttribute("aria-disabled"),
  );
}

function tabIndexes(
  buttons: readonly HTMLButtonElement[],
): Array<string | null> {
  return buttons.map((button) => button.getAttribute("tabindex"));
}

function completedDispatch() {
  return toolbarCommandDispatchResult("completed");
}

function manifestButtonCommand(
  manifest: ToolbarManifest,
  index: number,
): ToolbarCommandDeclaration {
  const control = manifest.controls[index];
  if (control?.kind !== "button") throw new Error("missing button declaration");
  return control.command;
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
