import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BreditorToolbar,
  toolbarCommandDispatchResult,
  type ToolbarActionStateEntry,
  type ToolbarActionStateSnapshot,
  type ToolbarCommandInvocation,
} from "./toolbar.js";
import { createToolbarManifest } from "./toolbar_manifest.js";

const FORM_STATE_ID = "example/link-presence";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("BreditorToolbar inline-format forms", () => {
  it("renders a sibling disclosure form without putting fields in the toolbar", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch: () => toolbarCommandDispatchResult("completed") },
    );

    const root = host.querySelector<HTMLElement>("[role=toolbar]");
    const launcher = launcherButton(host);
    const panel = linkPanel(host);
    const input = linkInput(host);
    expect(root).toBe(toolbar.element);
    expect(host.children).toHaveLength(2);
    expect(root?.contains(panel)).toBe(false);
    expect(root?.contains(input)).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(launcher.hasAttribute("aria-pressed")).toBe(false);
    expect(launcher.getAttribute("aria-disabled")).toBe("false");
    expect(panel.getAttribute("novalidate")).toBe("");
    expect(panel.noValidate).toBe(true);
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("url");
    expect(input.getAttribute("required")).toBe("");
    expect(input.required).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(toolbar.validateCanonicalDom()).toBe(true);

    toolbar.dispose();
  });

  it("hydrates exact single-line uniform values and follows authoritative refreshes while pristine", () => {
    const host = mountHost();
    const store = new TestStateStore([
      uniformLinkState("  not a normalized URL  ", true),
    ]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch: () => toolbarCommandDispatchResult("completed"),
    });

    launcherButton(host).click();
    expect(linkInput(host).value).toBe("  not a normalized URL  ");
    expect(targetInput(host).checked).toBe(true);

    store.publish([uniformLinkState("https://fresh.example", false)]);
    expect(linkInput(host).value).toBe("https://fresh.example");
    expect(targetInput(host).checked).toBe(false);
    expect(toolbar.validateCanonicalDom()).toBe(true);
    toolbar.dispose();
  });

  it("makes a CR/LF-bearing stored URL unavailable instead of normalizing it", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([uniformLinkState("https://one.example\r\nnext", false)]),
      { dispatch: () => toolbarCommandDispatchResult("completed") },
    );

    expect(launcherButton(host).getAttribute("aria-disabled")).toBe("true");
    launcherButton(host).click();
    expect(linkPanel(host).hidden).toBe(true);
    expect(linkInput(host).value).toBe("");
    expect(toolbar.validateCanonicalDom()).toBe(true);
    toolbar.dispose();
  });

  it("preserves a dirty open draft across selection refresh and discards it on reopen", () => {
    const host = mountHost();
    const store = new TestStateStore([
      uniformLinkState("https://one.example", false),
    ]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch: () => toolbarCommandDispatchResult("completed"),
    });
    const launcher = launcherButton(host);
    launcher.click();
    const input = linkInput(host);
    input.value = "https://draft.example";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    store.publish([uniformLinkState("https://two.example", true)]);
    expect(input.value).toBe("https://draft.example");
    expect(targetInput(host).checked).toBe(false);

    launcher.click();
    expect(input.value).toBe("");
    launcher.click();
    expect(input.value).toBe("https://two.example");
    expect(targetInput(host).checked).toBe(true);
    toolbar.dispose();
  });

  it("hydrates only the authoritative post-completion state", () => {
    const host = mountHost();
    const store = new TestStateStore([inactiveLinkState()]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch() {
        store.publish([uniformLinkState("https://canonical.example", false)]);
        return toolbarCommandDispatchResult("completed");
      },
    });
    launcherButton(host).click();
    const input = linkInput(host);
    input.value = "https://submitted.example";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    targetInput(host).checked = true;
    targetInput(host).dispatchEvent(new Event("change", { bubbles: true }));

    linkPanel(host).dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );

    expect(input.value).toBe("https://canonical.example");
    expect(targetInput(host).checked).toBe(false);
    expect(linkPanel(host).textContent).toContain("Link applied.");
    toolbar.dispose();
  });

  it("fails closed on malformed or activation-inconsistent state values", () => {
    const host = mountHost();
    const store = new TestStateStore([
      state(FORM_STATE_ID, "enabled", "active", undefined, {
        status: "uniform",
        contract: { name: "breditor/set-inline-format-input", version: 1 },
        value: {
          operation: "set",
          properties: [{ name: "example/href", value: "missing boolean" }],
        },
      }),
    ]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch: () => toolbarCommandDispatchResult("completed"),
    });
    expect(launcherButton(host).getAttribute("aria-disabled")).toBe("true");
    launcherButton(host).click();
    expect(linkPanel(host).hidden).toBe(true);

    store.publish([
      state(
        FORM_STATE_ID,
        "enabled",
        "inactive",
        undefined,
        defaultStateValue("mixed"),
      ),
    ]);
    expect(launcherButton(host).getAttribute("aria-disabled")).toBe("true");
    expect(toolbar.state).toBe("live");
    toolbar.dispose();
  });

  it("keeps an all-present selection usable when its property maps are mixed", () => {
    const host = mountHost();
    const store = new TestStateStore([
      state(
        FORM_STATE_ID,
        "enabled",
        "active",
        undefined,
        defaultStateValue("mixed"),
      ),
    ]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch: () => toolbarCommandDispatchResult("completed"),
    });

    expect(launcherButton(host).getAttribute("aria-disabled")).toBe("false");
    launcherButton(host).click();
    expect(linkInput(host).value).toBe("");
    expect(targetInput(host).checked).toBe(false);
    expect(formAction(host, "remove").disabled).toBe(false);
    expect(linkPanel(host).textContent).toContain(
      "Link is active with mixed values.",
    );
    expect(toolbar.validateCanonicalDom()).toBe(true);
    toolbar.dispose();
  });

  it("opens from inactive unchanged state and dispatches canonical typed JSON", () => {
    const host = mountHost();
    const invocations: ToolbarCommandInvocation[] = [];
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      {
        dispatch(invocation) {
          invocations.push(invocation);
          return toolbarCommandDispatchResult("completed");
        },
      },
    );
    const launcher = launcherButton(host);
    const panel = linkPanel(host);
    const url = linkInput(host);
    const target = targetInput(host);
    const apply = formAction(host, "apply");

    launcher.click();
    expect(panel.hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(url);

    const arrow = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    url.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(url);

    url.value = "https://example.com/docs?q=\"breditor\"";
    target.checked = true;
    url.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    expect(apply.disabled).toBe(false);

    panel.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    expect(invocations).toEqual([
      {
        stateId: FORM_STATE_ID,
        selection: "preserve",
        command: {
          kind: "intentJson",
          intentId: "example/set-link-intent",
          inputJson:
            '{"operation":"set","properties":[{"name":"example/href","value":"https://example.com/docs?q=\\\"breditor\\\""},{"name":"example/open-in-new-window","value":true}]}',
        },
      },
    ]);
    expect(document.activeElement).toBe(url);
    expect(url.value).toBe("");
    expect(target.checked).toBe(false);
    expect(panel.textContent).toContain("Link applied.");
    expect(panel.textContent).not.toContain("example.com");
    expect(toolbar.validateCanonicalDom()).toBe(true);

    toolbar.dispose();
  });

  it("enables Remove only for active or mixed presence", () => {
    const host = mountHost();
    const store = new TestStateStore([inactiveLinkState()]);
    const invocations: ToolbarCommandInvocation[] = [];
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch(invocation) {
        invocations.push(invocation);
        return toolbarCommandDispatchResult("completed");
      },
    });
    const remove = formAction(host, "remove");
    launcherButton(host).click();
    expect(remove.disabled).toBe(true);

    store.publish([
      state(FORM_STATE_ID, "enabled", "mixed", undefined),
    ]);
    expect(remove.disabled).toBe(false);
    remove.click();
    expect(invocations[0]).toMatchObject({
      selection: "preserve",
      command: {
        kind: "intentJson",
        intentId: "example/set-link-intent",
        inputJson: '{"operation":"remove"}',
      },
    });
    expect(linkPanel(host).textContent).toContain("Link removed.");

    toolbar.dispose();
  });

  it("closes on Escape, clears the draft, and restores the launcher", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch: () => toolbarCommandDispatchResult("completed") },
    );
    const launcher = launcherButton(host);
    const panel = linkPanel(host);
    const url = linkInput(host);
    launcher.click();
    url.value = "https://draft.example";
    url.dispatchEvent(new Event("input", { bubbles: true }));

    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    url.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(url.value).toBe("");
    expect(document.activeElement).toBe(launcher);
    expect(toolbar.validateCanonicalDom()).toBe(true);

    toolbar.dispose();
  });

  it("does not close on Escape until an active composition ends", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch: () => toolbarCommandDispatchResult("completed") },
    );
    const launcher = launcherButton(host);
    const panel = linkPanel(host);
    const url = linkInput(host);
    launcher.click();
    url.value = "https://composing.example";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    url.dispatchEvent(
      new CompositionEvent("compositionstart", {
        bubbles: true,
        cancelable: true,
      }),
    );

    const composingEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: false,
      key: "Escape",
    });
    url.dispatchEvent(composingEscape);
    expect(composingEscape.defaultPrevented).toBe(false);
    expect(panel.hidden).toBe(false);
    expect(url.value).toBe("https://composing.example");
    expect(document.activeElement).toBe(url);

    url.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        cancelable: true,
      }),
    );
    const settledEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    url.dispatchEvent(settledEscape);
    expect(settledEscape.defaultPrevented).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(url.value).toBe("");
    expect(document.activeElement).toBe(launcher);

    toolbar.dispose();
  });

  it("retains a valid draft across a recoverable rejected dispatch", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch: () => toolbarCommandDispatchResult("rejected") },
    );
    const panel = linkPanel(host);
    const url = linkInput(host);
    launcherButton(host).click();
    url.value = "https://retry.example";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    panel.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    expect(url.value).toBe("https://retry.example");
    expect(panel.textContent).toContain("Check the fields and selection");
    expect(panel.textContent).not.toContain("retry.example");

    toolbar.dispose();
  });

  it("preserves field focus across primary-pointer form actions", () => {
    const host = mountHost();
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch: () => toolbarCommandDispatchResult("completed") },
    );
    const url = linkInput(host);
    const apply = formAction(host, "apply");
    launcherButton(host).click();
    url.value = "https://pointer.example";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    });

    apply.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(url);
    apply.click();
    expect(document.activeElement).toBe(url);
    expect(linkPanel(host).textContent).toContain("Link applied.");
    toolbar.dispose();
  });

  it("restores form focus after an ordinary toolbar command moves it", () => {
    const host = mountHost();
    const editor = mountHost();
    editor.tabIndex = -1;
    const store = new TestStateStore([
      inactiveLinkState(),
      state("breditor/control-undo", "enabled", "stateless", undefined),
    ]);
    const dispatch = vi.fn(() => {
      editor.focus();
      return toolbarCommandDispatchResult("completed");
    });
    const manifest = createToolbarManifest({
      label: "Editor controls",
      controls: [
        linkManifest().controls[0],
        {
          kind: "button",
          stateId: "breditor/control-undo",
          label: "Undo",
          activation: "stateless",
          command: { kind: "history", operation: "undo" },
        },
      ],
    });
    const toolbar = new BreditorToolbar(host, manifest, store, { dispatch });
    const url = linkInput(host);
    const undo = host.querySelector<HTMLButtonElement>(
      'button[data-breditor-state-id="breditor/control-undo"]',
    );
    if (undo === null) throw new Error("missing Undo control");
    launcherButton(host).click();
    url.value = "https://draft.example/private";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    url.focus();

    undo.click();

    expect(dispatch).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(url);
    expect(url.value).toBe("https://draft.example/private");
    expect(linkPanel(host).hidden).toBe(false);
    expect(toolbar.validateCanonicalDom()).toBe(true);
    toolbar.dispose();
  });

  it("reads native input state despite own shadows and faults on semantic DOM drift", () => {
    const host = mountHost();
    const dispatch = vi.fn(() => toolbarCommandDispatchResult("completed"));
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch },
    );
    const url = linkInput(host);
    launcherButton(host).click();
    url.value = "https://native.example";
    Object.defineProperty(url, "value", {
      configurable: true,
      get() {
        throw new Error("own value shadow must not run");
      },
    });
    url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(toolbar.state).toBe("live");

    url.setAttribute("type", "url");
    url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(toolbar.state).toBe("faulted");
    expect(dispatch).not.toHaveBeenCalled();

    Reflect.deleteProperty(url, "value");
    toolbar.dispose();
  });

  it("submits schema-valid single-line text without browser URL validation", () => {
    const host = mountHost();
    const invocations: ToolbarCommandInvocation[] = [];
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      {
        dispatch(invocation) {
          invocations.push(invocation);
          return toolbarCommandDispatchResult("completed");
        },
      },
    );
    launcherButton(host).click();
    const url = linkInput(host);
    url.value = "not a url";
    url.dispatchEvent(new Event("input", { bubbles: true }));

    formAction(host, "apply").click();

    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.command).toMatchObject({
      kind: "intentJson",
      inputJson:
        '{"operation":"set","properties":[{"name":"example/href","value":"not a url"},{"name":"example/open-in-new-window","value":false}]}',
    });
    expect(linkPanel(host).textContent).toContain("Link applied.");
    toolbar.dispose();
  });

  it("rejects a Boolean field whose non-reflected indeterminate state drifts", () => {
    const host = mountHost();
    const dispatch = vi.fn(() => toolbarCommandDispatchResult("completed"));
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch },
    );
    launcherButton(host).click();
    const target = targetInput(host);
    target.indeterminate = true;

    expect(toolbar.validateCanonicalDom()).toBe(false);
    target.dispatchEvent(new Event("change", { bubbles: true }));
    expect(toolbar.state).toBe("faulted");
    expect(dispatch).not.toHaveBeenCalled();
    toolbar.dispose();
  });

  it.each(["open", "closed"] as const)(
    "mounts, focuses, and dispatches inside a %s ShadowRoot",
    (mode) => {
      const shadowHost = document.createElement("div");
      document.body.append(shadowHost);
      const shadowRoot = shadowHost.attachShadow({ mode });
      const host = document.createElement("div");
      shadowRoot.append(host);
      const dispatch = vi.fn(() => toolbarCommandDispatchResult("completed"));
      const toolbar = new BreditorToolbar(
        host,
        linkManifest(),
        new TestStateStore([inactiveLinkState()]),
        { dispatch },
      );

      launcherButton(host).click();
      const url = linkInput(host);
      expect(document.activeElement).toBe(shadowHost);
      expect(shadowRoot.activeElement).toBe(url);
      if (mode === "closed") expect(shadowHost.shadowRoot).toBeNull();
      url.value = "shadow value";
      url.dispatchEvent(new Event("input", { bubbles: true }));
      formAction(host, "apply").click();

      expect(dispatch).toHaveBeenCalledOnce();
      expect(shadowRoot.activeElement).toBe(url);
      expect(toolbar.validateCanonicalDom()).toBe(true);
      toolbar.dispose();
    },
  );

  it("rejects coordinated panel ID retargeting", () => {
    const host = mountHost();
    const dispatch = vi.fn(() => toolbarCommandDispatchResult("completed"));
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch },
    );
    const launcher = launcherButton(host);
    const panel = linkPanel(host);
    const url = linkInput(host);
    launcher.click();
    panel.id = "application/retargeted-panel";
    launcher.setAttribute("aria-controls", panel.id);

    expect(toolbar.validateCanonicalDom()).toBe(false);
    url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(toolbar.state).toBe("faulted");
    expect(dispatch).not.toHaveBeenCalled();
    toolbar.dispose();
  });

  it("rejects presentation drift that removes a field's accessible name", () => {
    const host = mountHost();
    const dispatch = vi.fn(() => toolbarCommandDispatchResult("completed"));
    const toolbar = new BreditorToolbar(
      host,
      linkManifest(),
      new TestStateStore([inactiveLinkState()]),
      { dispatch },
    );
    const url = linkInput(host);
    const labelText = url.parentElement?.querySelector("span");
    if (!(labelText instanceof HTMLSpanElement)) {
      throw new Error("missing Link field label text");
    }
    launcherButton(host).click();
    labelText.setAttribute("aria-hidden", "true");

    expect(toolbar.validateCanonicalDom()).toBe(false);
    url.dispatchEvent(new Event("input", { bubbles: true }));
    expect(toolbar.state).toBe("faulted");
    expect(dispatch).not.toHaveBeenCalled();
    toolbar.dispose();
  });

  it("keeps only one panel open and allocates collision-free owned IDs", () => {
    const collisionIds = new Set<string>();
    for (let index = 1; index <= 128; index += 1) {
      const collision = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      collision.id = `breditor-toolbar-panel-${index}`;
      collisionIds.add(collision.id);
      document.body.append(collision);
    }
    const host = mountHost();
    const manifest = createToolbarManifest({
      label: "Editor controls",
      controls: [formDeclaration("first", "First link"), formDeclaration("second", "Second link")],
    });
    const toolbar = new BreditorToolbar(
      host,
      manifest,
      new TestStateStore([
        state(
          "example/first-presence",
          "disabled",
          "inactive",
          "breditor/inline-format-unchanged",
        ),
        state(
          "example/second-presence",
          "disabled",
          "inactive",
          "breditor/inline-format-unchanged",
        ),
      ]),
      { dispatch: () => toolbarCommandDispatchResult("completed") },
    );
    const launchers = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button[data-breditor-state-id]"),
    );
    const panels = Array.from(
      host.querySelectorAll<HTMLFormElement>("form[data-breditor-toolbar-panel]"),
    );
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(2);
    expect(panels.every((panel) => !collisionIds.has(panel.id))).toBe(true);

    launchers[0]?.click();
    const firstInput = panels[0]?.querySelector<HTMLInputElement>(
      'input[type="text"][inputmode="url"]',
    );
    if (firstInput === null || firstInput === undefined) {
      throw new Error("missing first URL field");
    }
    firstInput.value = "https://draft.example";
    firstInput.dispatchEvent(new Event("input", { bubbles: true }));
    launchers[1]?.click();
    expect(panels[0]?.hidden).toBe(true);
    expect(panels[1]?.hidden).toBe(false);
    expect(firstInput.value).toBe("");
    expect(toolbar.validateCanonicalDom()).toBe(true);

    toolbar.dispose();
  });

  it("disables an open form when the action-state store becomes stale", () => {
    const host = mountHost();
    const store = new TestStateStore([inactiveLinkState()]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch: () => toolbarCommandDispatchResult("completed"),
    });
    launcherButton(host).click();
    store.publishStatus("stale");
    expect(launcherButton(host).getAttribute("aria-disabled")).toBe("true");
    expect(formAction(host, "apply").disabled).toBe(true);
    expect(formAction(host, "remove").disabled).toBe(true);
    expect(linkPanel(host).textContent).toContain("Link is unavailable.");

    toolbar.dispose();
  });

  it("moves focus to the first field when refresh disables a focused action", () => {
    const host = mountHost();
    const store = new TestStateStore([inactiveLinkState()]);
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch: () => toolbarCommandDispatchResult("completed"),
    });
    launcherButton(host).click();
    const url = linkInput(host);
    url.value = "https://focus.example";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    const apply = formAction(host, "apply");
    apply.focus();
    expect(document.activeElement).toBe(apply);

    store.publishStatus("stale");

    expect(apply.disabled).toBe(true);
    expect(document.activeElement).toBe(url);
    expect(linkPanel(host).hidden).toBe(false);
    expect(toolbar.validateCanonicalDom()).toBe(true);
    toolbar.dispose();
  });

  it("rejects a cached submission when a state getter closes its form", () => {
    const host = mountHost();
    const store = new TestStateStore([inactiveLinkState()]);
    const dispatch = vi.fn(() => toolbarCommandDispatchResult("completed"));
    const toolbar = new BreditorToolbar(host, linkManifest(), store, {
      dispatch,
    });
    const launcher = launcherButton(host);
    const panel = linkPanel(host);
    const url = linkInput(host);
    launcher.click();
    url.value = "https://stale.example/private";
    url.dispatchEvent(new Event("input", { bubbles: true }));
    store.onNextSnapshotRead(() => launcher.click());

    panel.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(toolbar.state).toBe("live");
    expect(panel.hidden).toBe(true);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(url.value).toBe("");
    expect(toolbar.validateCanonicalDom()).toBe(true);
    toolbar.dispose();
  });
});

function linkManifest() {
  return createToolbarManifest({
    label: "Editor controls",
    controls: [
      {
        kind: "inlineFormatForm",
        stateId: FORM_STATE_ID,
        label: "Link",
        group: "inline",
        formatKind: "example/link",
        intentId: "example/set-link-intent",
        fields: [
          {
            kind: "string",
            propertyName: "example/href",
            label: "Link URL",
            presentation: "url",
            autocomplete: "url",
            minimumUtf8Bytes: 1,
            maximumUtf8Bytes: 2_048,
            placeholder: "https://example.com",
          },
          {
            kind: "boolean",
            propertyName: "example/open-in-new-window",
            label: "Open in a new window",
            defaultValue: false,
          },
        ],
        applyLabel: "Apply",
        removeLabel: "Remove",
        closeLabel: "Close",
      },
    ],
  });
}

class TestStateStore {
  #snapshot: ToolbarActionStateSnapshot;
  #status: "fresh" | "stale" = "fresh";
  #nextSnapshotRead: (() => void) | undefined;
  readonly #listeners = new Set<() => void>();

  constructor(entries: readonly ToolbarActionStateEntry[]) {
    this.#snapshot = Object.freeze({ entries: Object.freeze([...entries]) });
  }

  getSnapshot(): ToolbarActionStateSnapshot {
    const callback = this.#nextSnapshotRead;
    this.#nextSnapshotRead = undefined;
    callback?.();
    return this.#snapshot;
  }

  getStatus() {
    return Object.freeze({ status: this.#status });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  publish(entries: readonly ToolbarActionStateEntry[]): void {
    this.#snapshot = Object.freeze({ entries: Object.freeze([...entries]) });
    for (const listener of this.#listeners) listener();
  }

  publishStatus(status: "fresh" | "stale"): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }

  onNextSnapshotRead(callback: () => void): void {
    this.#nextSnapshotRead = callback;
  }
}

function inactiveLinkState(): ToolbarActionStateEntry {
  return state(
    FORM_STATE_ID,
    "disabled",
    "inactive",
    "breditor/inline-format-unchanged",
  );
}

function uniformLinkState(
  href: string,
  openInNewWindow: boolean,
): ToolbarActionStateEntry {
  return state(FORM_STATE_ID, "enabled", "active", undefined, {
    status: "uniform",
    contract: {
      name: "breditor/set-inline-format-input",
      version: 1,
    },
    value: {
      operation: "set",
      properties: [
        { name: "example/href", value: href },
        { name: "example/open-in-new-window", value: openInNewWindow },
      ],
    },
  });
}

function state(
  id: string,
  availability: ToolbarActionStateEntry["availability"],
  activation: ToolbarActionStateEntry["activation"],
  reasonCode: string | undefined,
  value: unknown = defaultStateValue(activation),
): ToolbarActionStateEntry {
  return Object.freeze({ id, availability, activation, reasonCode, value });
}

function defaultStateValue(
  activation: ToolbarActionStateEntry["activation"],
): unknown {
  if (activation !== "inactive" && activation !== "mixed") return undefined;
  return Object.freeze({
    status: activation === "inactive" ? "unset" : "mixed",
    contract: Object.freeze({
      name: "breditor/set-inline-format-input",
      version: 1,
    }),
  });
}

function formDeclaration(suffix: string, label: string) {
  return {
    kind: "inlineFormatForm",
    stateId: `example/${suffix}-presence`,
    label,
    formatKind: `example/${suffix}-link`,
    intentId: `example/set-${suffix}-link-intent`,
    fields: [
      {
        kind: "string",
        propertyName: `example/${suffix}-href`,
        label: `${label} URL`,
        presentation: "url",
        autocomplete: "url",
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 2_048,
      },
    ],
    applyLabel: "Apply",
    removeLabel: "Remove",
    closeLabel: "Close",
  };
}

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
}

function launcherButton(host: HTMLElement): HTMLButtonElement {
  const value = host.querySelector<HTMLButtonElement>(
    `button[data-breditor-state-id="${FORM_STATE_ID}"]`,
  );
  if (value === null) throw new Error("missing Link launcher");
  return value;
}

function linkPanel(host: HTMLElement): HTMLFormElement {
  const value = host.querySelector<HTMLFormElement>(
    "form[data-breditor-toolbar-panel]",
  );
  if (value === null) throw new Error("missing Link panel");
  return value;
}

function linkInput(host: HTMLElement): HTMLInputElement {
  const value = host.querySelector<HTMLInputElement>(
    'input[name="example/href"]',
  );
  if (value === null) throw new Error("missing Link URL input");
  return value;
}

function targetInput(host: HTMLElement): HTMLInputElement {
  const value = host.querySelector<HTMLInputElement>(
    'input[name="example/open-in-new-window"]',
  );
  if (value === null) throw new Error("missing Link target input");
  return value;
}

function formAction(
  host: HTMLElement,
  action: "apply" | "remove" | "close",
): HTMLButtonElement {
  const value = host.querySelector<HTMLButtonElement>(
    `button[data-breditor-toolbar-form-action="${action}"]`,
  );
  if (value === null) throw new Error(`missing ${action} form action`);
  return value;
}
