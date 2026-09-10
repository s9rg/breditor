import {
  createToolbarInlineFormatFormRemoveInputJson,
  createToolbarInlineFormatFormSetInputJson,
} from "./toolbar_inline_format_form_input.js";
import type {
  ToolbarInlineFormatFormDeclaration,
  ToolbarInlineFormatFormFieldDeclaration,
} from "./toolbar_manifest.js";
import {
  nativeAddEventListener,
  nativeAppendChild,
  nativeAttributeNames,
  nativeChildNodes,
  nativeCreateHtmlElement,
  nativeFocusHtmlElement,
  nativeGetAttribute,
  nativeHasAttribute,
  nativeHtmlHostFacts,
  nativeInputChecked,
  nativeInputIndeterminate,
  nativeInputValue,
  nativeOptionValue,
  nativeNodeType,
  nativeNodeValue,
  nativeParentElement,
  nativeParentNode,
  nativeRemoveAttribute,
  nativeRemoveElement,
  nativeRemoveEventListener,
  nativeReplaceChildren,
  nativeSelectValue,
  nativeSetAttribute,
  nativeSetInputChecked,
  nativeSetInputIndeterminate,
  nativeSetInputValue,
  nativeSetSelectValue,
  nativeTreeRoot,
  nativeTreeRootActiveElement,
  nativeTreeRootGetElementById,
} from "./html_host.js";
import {
  preventDomEventDefault,
  readDomEventBase,
  readDomKeyboardEvent,
  readDomMouseEvent,
} from "./dom_event_intrinsics.js";
import {
  decodeToolbarInlineFormatFormStateValue,
  type ToolbarInlineFormatFormStateSeed,
} from "./toolbar_inline_format_form_state_value.js";
import {
  decodeToolbarInlineFormatRgb24Color,
  encodeToolbarInlineFormatRgb24Color,
} from "./toolbar_inline_format_rgb24.js";
import {
  decodeToolbarInlineFormatIntegerSelectValue,
  encodeToolbarInlineFormatIntegerSelectValue,
} from "./toolbar_inline_format_integer_select.js";

const PREVENT_SCROLL_FOCUS_OPTIONS: FocusOptions = Object.freeze({
  preventScroll: true,
});
const INLINE_FORMAT_UNCHANGED = "breditor/inline-format-unchanged";
let nextPanelIdentity = 1;

export interface ToolbarInlineFormatFormActionState {
  readonly availability:
    "enabled" | "disabled" | "blocked" | "unhandled" | "faulted";
  readonly activation:
    "stateless" | "inactive" | "active" | "mixed" | undefined;
  readonly reasonCode: string | undefined;
  readonly value?: unknown;
}

export type ToolbarInlineFormatFormDispatch = (
  operation: "set" | "remove",
  inputJson: string,
) => "completed" | "rejected" | "failed";

interface StringFieldRecord {
  readonly declaration: Extract<
    ToolbarInlineFormatFormFieldDeclaration,
    { readonly kind: "string" }
  >;
  readonly label: HTMLLabelElement;
  readonly labelText: HTMLSpanElement;
  readonly input: HTMLInputElement;
  readonly onInput: (event: Event) => void;
  readonly onChange: (event: Event) => void;
}

interface BooleanFieldRecord {
  readonly declaration: Extract<
    ToolbarInlineFormatFormFieldDeclaration,
    { readonly kind: "boolean" }
  >;
  readonly label: HTMLLabelElement;
  readonly labelText: HTMLSpanElement;
  readonly input: HTMLInputElement;
  readonly onInput: (event: Event) => void;
  readonly onChange: (event: Event) => void;
}

interface Rgb24IntegerFieldRecord {
  readonly declaration: Extract<
    ToolbarInlineFormatFormFieldDeclaration,
    { readonly kind: "integer"; readonly presentation: "rgb24" }
  >;
  readonly label: HTMLLabelElement;
  readonly labelText: HTMLSpanElement;
  readonly input: HTMLInputElement;
  readonly onInput: (event: Event) => void;
  readonly onChange: (event: Event) => void;
}

interface SelectIntegerFieldRecord {
  readonly declaration: Extract<
    ToolbarInlineFormatFormFieldDeclaration,
    { readonly kind: "integer"; readonly presentation: "select" }
  >;
  readonly label: HTMLLabelElement;
  readonly labelText: HTMLSpanElement;
  readonly input: HTMLSelectElement;
  readonly onInput: (event: Event) => void;
  readonly onChange: (event: Event) => void;
}

type FieldRecord =
  | StringFieldRecord
  | BooleanFieldRecord
  | Rgb24IntegerFieldRecord
  | SelectIntegerFieldRecord;

/**
 * Internal native form owned by one `inlineFormatForm` toolbar launcher.
 *
 * The class is deliberately presentation-only: it builds typed input JSON,
 * consumes only a detached validated action-state seed, and delegates the
 * resulting semantic intent to the toolbar. It never inspects editor DOM or
 * document state.
 *
 * @internal
 */
export class BreditorToolbarInlineFormatForm {
  readonly #ownerDocument: Document;
  readonly #treeRoot: Document | ShadowRoot;
  readonly #host: HTMLElement;
  readonly #launcher: HTMLButtonElement;
  readonly #declaration: ToolbarInlineFormatFormDeclaration;
  readonly #dispatch: ToolbarInlineFormatFormDispatch;
  readonly #guard: (callback: () => void) => void;
  readonly #beforeOpen: (form: BreditorToolbarInlineFormatForm) => void;
  readonly #refreshState: () => void;
  readonly #panel: HTMLFormElement;
  readonly #panelId: string;
  readonly #fields: FieldRecord[] = [];
  readonly #actions: HTMLDivElement;
  readonly #apply: HTMLButtonElement;
  readonly #remove: HTMLButtonElement;
  readonly #close: HTMLButtonElement;
  readonly #selectionState: HTMLParagraphElement;
  readonly #feedback: HTMLParagraphElement;
  readonly #onSubmit: (event: SubmitEvent) => void;
  readonly #onKeyDown: (event: KeyboardEvent) => void;
  readonly #onRemove: (event: MouseEvent) => void;
  readonly #onClose: (event: MouseEvent) => void;
  readonly #onActionPointerDown: (event: PointerEvent) => void;
  readonly #onActionMouseDown: (event: MouseEvent) => void;
  readonly #onCompositionStart: (event: CompositionEvent) => void;
  readonly #onCompositionEnd: (event: CompositionEvent) => void;
  #formReady = false;
  #removeReady = false;
  #setInputJson: string | undefined;
  #open = false;
  #composing = false;
  #dirty = false;
  #stateSeed: ToolbarInlineFormatFormStateSeed | undefined;
  #disposed = false;
  #selectionText: string;
  #feedbackText = "";

  constructor(
    ownerDocument: Document,
    host: HTMLElement,
    launcher: HTMLButtonElement,
    declaration: ToolbarInlineFormatFormDeclaration,
    dispatch: ToolbarInlineFormatFormDispatch,
    guard: (callback: () => void) => void,
    beforeOpen: (form: BreditorToolbarInlineFormatForm) => void,
    refreshState: () => void,
  ) {
    this.#ownerDocument = ownerDocument;
    this.#treeRoot = nativeTreeRoot(host);
    this.#host = host;
    this.#launcher = launcher;
    this.#declaration = declaration;
    this.#dispatch = dispatch;
    this.#guard = guard;
    this.#beforeOpen = beforeOpen;
    this.#refreshState = refreshState;
    this.#selectionText = `${declaration.label} is unavailable.`;

    const panel = nativeCreateHtmlElement(ownerDocument, "form");
    const panelId = nextAvailablePanelId(this.#treeRoot);
    nativeSetAttribute(panel, "id", panelId);
    nativeSetAttribute(panel, "data-breditor-toolbar-panel", "");
    nativeSetAttribute(panel, "aria-label", declaration.label);
    nativeSetAttribute(panel, "novalidate", "");
    nativeSetAttribute(panel, "hidden", "");
    nativeSetAttribute(launcher, "aria-controls", panelId);
    nativeSetAttribute(launcher, "aria-expanded", "false");
    nativeSetAttribute(
      launcher,
      "data-breditor-control-kind",
      "inline-format-form",
    );
    this.#panel = panel;
    this.#panelId = panelId;

    for (const field of declaration.fields) {
      this.#fields.push(this.#installField(field));
    }

    const actions = nativeCreateHtmlElement(ownerDocument, "div");
    nativeSetAttribute(actions, "data-breditor-toolbar-form-actions", "");
    this.#actions = actions;
    this.#apply = this.#actionButton("submit", "apply", declaration.applyLabel);
    this.#remove = this.#actionButton(
      "button",
      "remove",
      declaration.removeLabel,
    );
    this.#close = this.#actionButton("button", "close", declaration.closeLabel);
    nativeAppendChild(actions, this.#apply);
    nativeAppendChild(actions, this.#remove);
    nativeAppendChild(actions, this.#close);
    nativeAppendChild(panel, actions);

    const selectionState = nativeCreateHtmlElement(ownerDocument, "p");
    nativeSetAttribute(selectionState, "data-breditor-toolbar-form-state", "");
    nativeReplaceChildren(selectionState, this.#selectionText);
    this.#selectionState = selectionState;
    nativeAppendChild(panel, selectionState);

    const feedback = nativeCreateHtmlElement(ownerDocument, "p");
    nativeSetAttribute(feedback, "data-breditor-toolbar-form-feedback", "");
    nativeSetAttribute(feedback, "role", "status");
    nativeSetAttribute(feedback, "aria-live", "polite");
    nativeSetAttribute(feedback, "aria-atomic", "true");
    this.#feedback = feedback;
    nativeAppendChild(panel, feedback);

    this.#onSubmit = (event) => this.#guard(() => this.#handleSubmit(event));
    this.#onKeyDown = (event) => this.#guard(() => this.#handleKeyDown(event));
    this.#onRemove = (event) => this.#guard(() => this.#handleRemove(event));
    this.#onClose = (event) => this.#guard(() => this.#handleClose(event));
    this.#onActionPointerDown = (event) =>
      this.#guard(() => this.#handleActionPress(event, "pointerdown"));
    this.#onActionMouseDown = (event) =>
      this.#guard(() => this.#handleActionPress(event, "mousedown"));
    this.#onCompositionStart = (event) =>
      this.#guard(() => this.#handleComposition(event, true));
    this.#onCompositionEnd = (event) =>
      this.#guard(() => this.#handleComposition(event, false));
    nativeAddEventListener(panel, "submit", this.#onSubmit);
    nativeAddEventListener(panel, "keydown", this.#onKeyDown);
    nativeAddEventListener(panel, "compositionstart", this.#onCompositionStart);
    nativeAddEventListener(panel, "compositionend", this.#onCompositionEnd);
    nativeAddEventListener(this.#remove, "click", this.#onRemove);
    nativeAddEventListener(this.#close, "click", this.#onClose);
    for (const action of [this.#apply, this.#remove, this.#close]) {
      nativeAddEventListener(action, "pointerdown", this.#onActionPointerDown);
      nativeAddEventListener(action, "mousedown", this.#onActionMouseDown);
    }
    nativeAppendChild(host, panel);
    this.#refreshDraft();
  }

  get panel(): HTMLFormElement {
    return this.#panel;
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get formReady(): boolean {
    return this.#formReady;
  }

  get removeReady(): boolean {
    return this.#removeReady;
  }

  /** Captures one exact currently focused control owned by this open form. @internal */
  captureFocusedControl(): HTMLElement | undefined {
    if (this.#disposed || !this.#open) return undefined;
    this.#requireCanonicalDom();
    const active = nativeTreeRootActiveElement(this.#treeRoot);
    const facts = nativeHtmlHostFacts(active);
    return facts?.ownerDocument === this.#ownerDocument &&
      this.#ownsControl(facts.element)
      ? facts.element
      : undefined;
  }

  /** Restores a previously captured control when this form is still open. @internal */
  restoreFocusedControl(control: HTMLElement): void {
    if (this.#disposed || !this.#open) return;
    this.#requireCanonicalDom();
    if (!this.#ownsControl(control)) {
      throw new TypeError("toolbar form focus target is invalid");
    }
    const target = nativeHasAttribute(control, "disabled")
      ? this.#fields[0]?.input
      : control;
    if (target === undefined) {
      throw new TypeError("toolbar form focus fallback is unavailable");
    }
    nativeFocusHtmlElement(target, PREVENT_SCROLL_FOCUS_OPTIONS);
    if (nativeTreeRootActiveElement(this.#treeRoot) !== target) {
      throw new TypeError("toolbar form focus could not be restored");
    }
  }

  toggle(): void {
    if (this.#disposed || !this.#formReady) return;
    this.#requireCanonicalDom();
    if (this.#open) {
      this.close(true, true);
      return;
    }
    this.#beforeOpen(this);
    if (this.#disposed || !this.#formReady) return;
    this.#applyStateSeed();
    this.#open = true;
    nativeRemoveAttribute(this.#panel, "hidden");
    nativeSetAttribute(this.#launcher, "aria-expanded", "true");
    this.#setFeedback("");
    const first = this.#fields[0]?.input;
    if (first !== undefined) {
      nativeFocusHtmlElement(first, PREVENT_SCROLL_FOCUS_OPTIONS);
      if (nativeTreeRootActiveElement(this.#treeRoot) !== first) {
        throw new TypeError("toolbar form focus could not be established");
      }
    }
  }

  close(restoreLauncherFocus: boolean, clearDraft: boolean): void {
    if (this.#disposed) return;
    this.#open = false;
    this.#composing = false;
    nativeSetAttribute(this.#panel, "hidden", "");
    nativeSetAttribute(this.#launcher, "aria-expanded", "false");
    if (clearDraft) this.#clearDraft();
    this.#setFeedback("");
    if (restoreLauncherFocus) {
      nativeFocusHtmlElement(this.#launcher, PREVENT_SCROLL_FOCUS_OPTIONS);
      if (nativeTreeRootActiveElement(this.#treeRoot) !== this.#launcher) {
        throw new TypeError("toolbar launcher focus could not be restored");
      }
    }
  }

  renderState(state: ToolbarInlineFormatFormActionState | undefined): void {
    if (this.#disposed) return;
    const focusedControl = this.captureFocusedControl();
    const activation = state?.activation;
    const stateSeed =
      state === undefined
        ? null
        : decodeToolbarInlineFormatFormStateValue(
            this.#declaration,
            state.value,
          );
    const valueMatchesActivation =
      (activation === "inactive" && stateSeed?.status === "unset") ||
      (activation === "active" && stateSeed?.status === "uniform") ||
      (activation === "active" && stateSeed?.status === "mixed") ||
      (activation === "mixed" && stateSeed?.status === "mixed");
    const presentedActivation = valueMatchesActivation ? activation : undefined;
    this.#stateSeed = valueMatchesActivation ? stateSeed : undefined;
    this.#formReady =
      valueMatchesActivation &&
      ((state?.availability === "enabled" &&
        (activation === "inactive" ||
          activation === "active" ||
          activation === "mixed")) ||
        ((state?.availability === "disabled" ||
          state?.availability === "blocked") &&
          activation === "inactive" &&
          state.reasonCode === INLINE_FORMAT_UNCHANGED));
    this.#removeReady =
      valueMatchesActivation &&
      state?.availability === "enabled" &&
      (activation === "active" || activation === "mixed");
    if (this.#open && !this.#dirty) this.#applyStateSeed();
    nativeSetAttribute(
      this.#launcher,
      "data-breditor-activation",
      presentedActivation === "inactive" ||
        presentedActivation === "active" ||
        presentedActivation === "mixed"
        ? presentedActivation
        : "unavailable",
    );
    if (presentedActivation === "active") {
      this.#selectionText =
        stateSeed?.status === "mixed"
          ? `${this.#declaration.label} is active with mixed values.`
          : `${this.#declaration.label} is active.`;
    } else if (presentedActivation === "mixed") {
      this.#selectionText = `${this.#declaration.label} is mixed.`;
    } else if (presentedActivation === "inactive" && this.#formReady) {
      this.#selectionText = `${this.#declaration.label} is not active.`;
    } else {
      this.#selectionText = `${this.#declaration.label} is unavailable.`;
    }
    nativeReplaceChildren(this.#selectionState, this.#selectionText);
    this.#renderButtons();
    if (
      focusedControl !== undefined &&
      nativeHasAttribute(focusedControl, "disabled")
    ) {
      this.restoreFocusedControl(focusedControl);
    }
  }

  validateCanonicalDom(toolbarRoot: HTMLElement): boolean {
    if (this.#disposed) return false;
    try {
      const panelFacts = nativeHtmlHostFacts(this.#panel);
      const panelChildren = nativeChildNodes(this.#panel);
      const expectedChildren = this.#fields.length + 3;
      return (
        panelFacts !== undefined &&
        panelFacts.isConnected &&
        panelFacts.ownerDocument === this.#ownerDocument &&
        panelFacts.tagName === "FORM" &&
        nativeParentElement(this.#panel) === this.#host &&
        nativeParentElement(this.#launcher) === toolbarRoot &&
        nativeTreeRoot(this.#panel) === this.#treeRoot &&
        nativeTreeRoot(this.#launcher) === this.#treeRoot &&
        nativeGetAttribute(this.#panel, "id") === this.#panelId &&
        nativeTreeRootGetElementById(this.#treeRoot, this.#panelId) ===
          this.#panel &&
        nativeGetAttribute(this.#launcher, "aria-controls") === this.#panelId &&
        nativeGetAttribute(this.#launcher, "aria-expanded") ===
          (this.#open ? "true" : "false") &&
        nativeGetAttribute(this.#launcher, "data-breditor-control-kind") ===
          "inline-format-form" &&
        nativeAttributeNames(this.#panel).length === (this.#open ? 4 : 5) &&
        nativeHasAttribute(this.#panel, "data-breditor-toolbar-panel") &&
        nativeGetAttribute(this.#panel, "data-breditor-toolbar-panel") === "" &&
        nativeGetAttribute(this.#panel, "aria-label") ===
          this.#declaration.label &&
        nativeGetAttribute(this.#panel, "novalidate") === "" &&
        nativeHasAttribute(this.#panel, "hidden") === !this.#open &&
        panelChildren.length === expectedChildren &&
        this.#fields.every(
          (record, index) =>
            panelChildren[index] === record.label && this.#validField(record),
        ) &&
        panelChildren[this.#fields.length] === this.#actions &&
        panelChildren[this.#fields.length + 1] === this.#selectionState &&
        panelChildren[this.#fields.length + 2] === this.#feedback &&
        this.#validActions() &&
        this.#validTextRegion(
          this.#selectionState,
          "data-breditor-toolbar-form-state",
          this.#selectionText,
          false,
        ) &&
        this.#validTextRegion(
          this.#feedback,
          "data-breditor-toolbar-form-feedback",
          this.#feedbackText,
          true,
        )
      );
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    bestEffort(() => this.#clearDraft());
    this.#disposed = true;
    for (const record of this.#fields) {
      bestEffort(() =>
        nativeRemoveEventListener(record.input, "input", record.onInput),
      );
      bestEffort(() =>
        nativeRemoveEventListener(record.input, "change", record.onChange),
      );
    }
    bestEffort(() =>
      nativeRemoveEventListener(this.#panel, "submit", this.#onSubmit),
    );
    bestEffort(() =>
      nativeRemoveEventListener(this.#panel, "keydown", this.#onKeyDown),
    );
    bestEffort(() =>
      nativeRemoveEventListener(
        this.#panel,
        "compositionstart",
        this.#onCompositionStart,
      ),
    );
    bestEffort(() =>
      nativeRemoveEventListener(
        this.#panel,
        "compositionend",
        this.#onCompositionEnd,
      ),
    );
    bestEffort(() =>
      nativeRemoveEventListener(this.#remove, "click", this.#onRemove),
    );
    bestEffort(() =>
      nativeRemoveEventListener(this.#close, "click", this.#onClose),
    );
    for (const action of [this.#apply, this.#remove, this.#close]) {
      bestEffort(() =>
        nativeRemoveEventListener(
          action,
          "pointerdown",
          this.#onActionPointerDown,
        ),
      );
      bestEffort(() =>
        nativeRemoveEventListener(action, "mousedown", this.#onActionMouseDown),
      );
    }
    bestEffort(() => nativeRemoveElement(this.#panel));
  }

  #installField(field: ToolbarInlineFormatFormFieldDeclaration): FieldRecord {
    const label = nativeCreateHtmlElement(this.#ownerDocument, "label");
    nativeSetAttribute(label, "data-breditor-toolbar-field", field.kind);
    const labelText = nativeCreateHtmlElement(this.#ownerDocument, "span");
    nativeReplaceChildren(labelText, field.label);
    let input: HTMLInputElement | HTMLSelectElement;
    if (field.kind === "string") {
      input = nativeCreateHtmlElement(this.#ownerDocument, "input");
      nativeSetAttribute(input, "name", field.propertyName);
      nativeSetAttribute(input, "data-breditor-property", field.propertyName);
      // `type=url` trims surrounding ASCII whitespace in current engines.
      // Keep the scalar surface as text and provide only the mobile-keyboard
      // hint so a form-admissible stored value round-trips byte-for-byte.
      nativeSetAttribute(input, "type", "text");
      nativeSetAttribute(input, "inputmode", "url");
      nativeSetAttribute(input, "required", "");
      nativeSetAttribute(input, "autocomplete", field.autocomplete);
      if (field.placeholder !== undefined) {
        nativeSetAttribute(input, "placeholder", field.placeholder);
      }
      nativeAppendChild(label, labelText);
      nativeAppendChild(label, input);
    } else if (field.kind === "boolean") {
      input = nativeCreateHtmlElement(this.#ownerDocument, "input");
      nativeSetAttribute(input, "name", field.propertyName);
      nativeSetAttribute(input, "data-breditor-property", field.propertyName);
      nativeSetAttribute(input, "type", "checkbox");
      nativeSetInputIndeterminate(input, false);
      nativeAppendChild(label, input);
      nativeAppendChild(label, labelText);
    } else if (field.presentation === "rgb24") {
      input = nativeCreateHtmlElement(this.#ownerDocument, "input");
      nativeSetAttribute(input, "name", field.propertyName);
      nativeSetAttribute(input, "data-breditor-property", field.propertyName);
      nativeSetAttribute(input, "type", "color");
      const defaultColor = encodeToolbarInlineFormatRgb24Color(
        field.defaultValue,
      );
      if (defaultColor === null) {
        throw new TypeError("toolbar RGB24 default is invalid");
      }
      nativeSetInputValue(input, defaultColor);
      nativeAppendChild(label, labelText);
      nativeAppendChild(label, input);
    } else {
      input = nativeCreateHtmlElement(this.#ownerDocument, "select");
      nativeSetAttribute(input, "name", field.propertyName);
      nativeSetAttribute(input, "data-breditor-property", field.propertyName);
      for (const declaredOption of field.options) {
        const option = nativeCreateHtmlElement(this.#ownerDocument, "option");
        const encoded = encodeToolbarInlineFormatIntegerSelectValue(
          declaredOption.value,
          field.minimum,
          field.maximum,
        );
        if (encoded === null) {
          throw new TypeError("toolbar integer select option is invalid");
        }
        nativeSetAttribute(option, "value", encoded);
        nativeReplaceChildren(option, declaredOption.label);
        nativeAppendChild(input, option);
      }
      const defaultValue = encodeToolbarInlineFormatIntegerSelectValue(
        field.defaultValue,
        field.minimum,
        field.maximum,
      );
      if (defaultValue === null) {
        throw new TypeError("toolbar integer select default is invalid");
      }
      nativeSetSelectValue(input, defaultValue);
      nativeAppendChild(label, labelText);
      nativeAppendChild(label, input);
    }
    const onInput = (event: Event) =>
      this.#guard(() => this.#handleDraftEvent(event, "input"));
    const onChange = (event: Event) =>
      this.#guard(() => this.#handleDraftEvent(event, "change"));
    nativeAddEventListener(input, "input", onInput);
    nativeAddEventListener(input, "change", onChange);
    nativeAppendChild(this.#panel, label);
    return {
      declaration: field,
      label,
      labelText,
      input,
      onInput,
      onChange,
    } as FieldRecord;
  }

  #actionButton(
    type: "submit" | "button",
    action: "apply" | "remove" | "close",
    label: string,
  ): HTMLButtonElement {
    const button = nativeCreateHtmlElement(this.#ownerDocument, "button");
    nativeSetAttribute(button, "type", type);
    nativeSetAttribute(button, "data-breditor-toolbar-form-action", action);
    nativeSetAttribute(button, "aria-disabled", "false");
    nativeReplaceChildren(button, label);
    return button;
  }

  #handleDraftEvent(event: Event, expectedType: "input" | "change"): void {
    const base = readDomEventBase(event);
    if (
      this.#disposed ||
      base?.type !== expectedType ||
      base.defaultPrevented ||
      !this.#hasCanonicalDom()
    ) {
      throw new TypeError("toolbar form draft event is invalid");
    }
    this.#refreshDraft();
    this.#dirty = true;
    this.#setFeedback("");
  }

  #handleSubmit(event: SubmitEvent): void {
    const base = readDomEventBase(event);
    if (base?.type !== "submit" || base.defaultPrevented) {
      throw new TypeError("toolbar form submission is invalid");
    }
    if (!preventDomEventDefault(event).ok) {
      throw new TypeError("toolbar form submission could not be cancelled");
    }
    this.#requireCanonicalDom();
    if (this.#disposed || this.#composing || !this.#open) return;
    this.#dirty = true;
    this.#refreshDraft();
    const inputJson = this.#setInputJson;
    if (!this.#formReady || inputJson === undefined) {
      this.#setFeedback("Complete the required fields before applying.");
      return;
    }
    this.#runDispatch("set", inputJson, `${this.#declaration.label} applied.`);
  }

  #handleActionPress(
    event: PointerEvent | MouseEvent,
    expectedType: "pointerdown" | "mousedown",
  ): void {
    const mouse = readDomMouseEvent(event);
    if (
      mouse?.base.type !== expectedType ||
      mouse.button !== 0 ||
      mouse.base.defaultPrevented
    ) {
      return;
    }
    this.#requireCanonicalDom();
    if (!preventDomEventDefault(event).ok) {
      throw new TypeError("toolbar form action focus could not be preserved");
    }
  }

  #handleRemove(event: MouseEvent): void {
    const mouse = readDomMouseEvent(event);
    if (mouse?.base.type !== "click") {
      throw new TypeError("toolbar form remove event is invalid");
    }
    if (mouse.base.defaultPrevented) return;
    if (!preventDomEventDefault(event).ok) {
      throw new TypeError("toolbar form remove event could not be cancelled");
    }
    this.#requireCanonicalDom();
    if (this.#disposed || !this.#open || !this.#removeReady) return;
    this.#runDispatch(
      "remove",
      createToolbarInlineFormatFormRemoveInputJson(),
      `${this.#declaration.label} removed.`,
    );
  }

  #handleClose(event: MouseEvent): void {
    const mouse = readDomMouseEvent(event);
    if (mouse?.base.type !== "click") {
      throw new TypeError("toolbar form close event is invalid");
    }
    if (mouse.base.defaultPrevented) return;
    if (!preventDomEventDefault(event).ok) {
      throw new TypeError("toolbar form close event could not be cancelled");
    }
    this.#requireCanonicalDom();
    this.close(true, true);
  }

  #handleKeyDown(event: KeyboardEvent): void {
    const base = readDomEventBase(event);
    const key = readDomKeyboardEvent(event);
    if (
      base?.type !== "keydown" ||
      key === null ||
      base.source !== key.source ||
      base.defaultPrevented ||
      this.#composing ||
      key.isComposing ||
      key.key !== "Escape" ||
      key.altKey ||
      key.ctrlKey ||
      key.metaKey ||
      key.shiftKey
    ) {
      return;
    }
    if (!preventDomEventDefault(event).ok) {
      throw new TypeError("toolbar form Escape could not be cancelled");
    }
    this.#requireCanonicalDom();
    this.close(true, true);
  }

  #handleComposition(event: CompositionEvent, active: boolean): void {
    const base = readDomEventBase(event);
    const expected = active ? "compositionstart" : "compositionend";
    if (base?.type !== expected || base.defaultPrevented) {
      throw new TypeError("toolbar form composition event is invalid");
    }
    this.#composing = active;
    this.#dirty = true;
    if (!active) {
      this.#refreshDraft();
    }
  }

  #runDispatch(
    operation: "set" | "remove",
    inputJson: string,
    completedText: string,
  ): void {
    const restore = this.captureFocusedControl();
    const status = this.#dispatch(operation, inputJson);
    if (this.#disposed) return;
    if (status === "failed") {
      throw new TypeError("toolbar form dispatch failed");
    }
    if (status === "rejected") {
      const outcome = operation === "set" ? "applied" : "removed";
      this.#setFeedback(
        `${this.#declaration.label} could not be ${outcome}. Check the fields and selection, then try again.`,
      );
    } else {
      this.#clearDraft();
      this.#refreshState();
      if (this.#disposed) return;
      this.#setFeedback(completedText);
    }
    if (restore !== undefined) this.restoreFocusedControl(restore);
  }

  #refreshDraft(): void {
    const values: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const record of this.#fields) {
      const declaration = record.declaration;
      values[declaration.propertyName] =
        declaration.kind === "string"
          ? nativeInputValue(record.input as HTMLInputElement)
          : declaration.kind === "boolean"
            ? nativeInputChecked(record.input as HTMLInputElement)
            : declaration.presentation === "rgb24"
              ? decodeToolbarInlineFormatRgb24Color(
                  nativeInputValue(record.input as HTMLInputElement),
                )
              : decodeToolbarInlineFormatIntegerSelectValue(
                  nativeSelectValue(record.input as HTMLSelectElement),
                  declaration.minimum,
                  declaration.maximum,
                );
    }
    try {
      this.#setInputJson = createToolbarInlineFormatFormSetInputJson(
        this.#declaration,
        values,
      );
    } catch {
      this.#setInputJson = undefined;
    }
    this.#renderButtons();
  }

  #renderButtons(): void {
    const applyReady = this.#formReady && this.#setInputJson !== undefined;
    setButtonDisabled(this.#apply, !applyReady);
    setButtonDisabled(this.#remove, !this.#removeReady);
  }

  #clearDraft(): void {
    this.#dirty = false;
    for (const record of this.#fields) {
      if (record.declaration.kind === "string") {
        nativeSetInputValue(record.input as HTMLInputElement, "");
      } else if (record.declaration.kind === "boolean") {
        nativeSetInputChecked(
          record.input as HTMLInputElement,
          record.declaration.defaultValue,
        );
        nativeSetInputIndeterminate(record.input as HTMLInputElement, false);
      } else if (record.declaration.presentation === "rgb24") {
        const defaultColor = encodeToolbarInlineFormatRgb24Color(
          record.declaration.defaultValue,
        );
        if (defaultColor === null) {
          throw new TypeError("toolbar RGB24 default is invalid");
        }
        nativeSetInputValue(record.input as HTMLInputElement, defaultColor);
      } else {
        const defaultValue = encodeToolbarInlineFormatIntegerSelectValue(
          record.declaration.defaultValue,
          record.declaration.minimum,
          record.declaration.maximum,
        );
        if (defaultValue === null) {
          throw new TypeError("toolbar integer select default is invalid");
        }
        nativeSetSelectValue(record.input as HTMLSelectElement, defaultValue);
      }
    }
    this.#refreshDraft();
  }

  #applyStateSeed(): void {
    const values = new Map<string, string | boolean | number>();
    if (this.#stateSeed?.status === "uniform") {
      for (const field of this.#stateSeed.fields) {
        values.set(field.name, field.value);
      }
    }
    for (const record of this.#fields) {
      const value = values.get(record.declaration.propertyName);
      if (record.declaration.kind === "string") {
        nativeSetInputValue(
          record.input as HTMLInputElement,
          typeof value === "string" ? value : "",
        );
      } else if (record.declaration.kind === "boolean") {
        nativeSetInputChecked(
          record.input as HTMLInputElement,
          typeof value === "boolean" ? value : record.declaration.defaultValue,
        );
        nativeSetInputIndeterminate(record.input as HTMLInputElement, false);
      } else if (record.declaration.presentation === "rgb24") {
        const color = encodeToolbarInlineFormatRgb24Color(
          typeof value === "number" ? value : record.declaration.defaultValue,
        );
        if (color === null) {
          throw new TypeError("toolbar RGB24 state is invalid");
        }
        nativeSetInputValue(record.input as HTMLInputElement, color);
      } else {
        const selected = encodeToolbarInlineFormatIntegerSelectValue(
          typeof value === "number" ? value : record.declaration.defaultValue,
          record.declaration.minimum,
          record.declaration.maximum,
        );
        if (selected === null) {
          throw new TypeError("toolbar integer select state is invalid");
        }
        nativeSetSelectValue(record.input as HTMLSelectElement, selected);
      }
    }
    this.#refreshDraft();
  }

  #setFeedback(value: string): void {
    this.#feedbackText = value;
    if (value.length === 0) nativeReplaceChildren(this.#feedback);
    else nativeReplaceChildren(this.#feedback, value);
  }

  #hasCanonicalDom(): boolean {
    const root = nativeParentElement(this.#launcher);
    return root !== null && this.validateCanonicalDom(root);
  }

  #requireCanonicalDom(): void {
    if (!this.#hasCanonicalDom()) {
      throw new TypeError("toolbar inline-format form DOM is invalid");
    }
  }

  #validField(record: FieldRecord): boolean {
    const labelFacts = nativeHtmlHostFacts(record.label);
    const labelTextFacts = nativeHtmlHostFacts(record.labelText);
    const inputFacts = nativeHtmlHostFacts(record.input);
    const labelChildren = nativeChildNodes(record.label);
    const stringField = record.declaration.kind === "string";
    const booleanField = record.declaration.kind === "boolean";
    const scalarField = !booleanField;
    if (!(
      labelFacts?.tagName === "LABEL" &&
      labelFacts.ownerDocument === this.#ownerDocument &&
      labelTextFacts?.tagName === "SPAN" &&
      labelTextFacts.ownerDocument === this.#ownerDocument &&
      inputFacts !== undefined &&
      inputFacts.ownerDocument === this.#ownerDocument &&
      nativeParentElement(record.label) === this.#panel &&
      nativeParentElement(record.labelText) === record.label &&
      nativeParentElement(record.input) === record.label &&
      nativeAttributeNames(record.label).length === 1 &&
      nativeAttributeNames(record.labelText).length === 0 &&
      nativeGetAttribute(record.label, "data-breditor-toolbar-field") ===
        record.declaration.kind &&
      labelChildren.length === 2 &&
      labelChildren[scalarField ? 0 : 1] === record.labelText &&
      labelChildren[scalarField ? 1 : 0] === record.input &&
      nativeGetAttribute(record.input, "name") ===
        record.declaration.propertyName &&
      nativeGetAttribute(record.input, "data-breditor-property") ===
        record.declaration.propertyName &&
      isSingleTextElement(record.labelText, record.declaration.label)
    )) {
      return false;
    }

    if (
      record.declaration.kind === "integer" &&
      record.declaration.presentation === "select"
    ) {
      const selectRecord = record as SelectIntegerFieldRecord;
      const options = nativeChildNodes(selectRecord.input);
      return (
        inputFacts.tagName === "SELECT" &&
        nativeAttributeNames(selectRecord.input).length === 2 &&
        options.length === selectRecord.declaration.options.length &&
        selectRecord.declaration.options.every((option, index) => {
          const node = options[index];
          if (node === undefined) return false;
          const facts = nativeHtmlHostFacts(node);
          const encoded = encodeToolbarInlineFormatIntegerSelectValue(
            option.value,
            selectRecord.declaration.minimum,
            selectRecord.declaration.maximum,
          );
          return (
            facts?.tagName === "OPTION" &&
            facts.ownerDocument === this.#ownerDocument &&
            nativeParentElement(facts.element) === selectRecord.input &&
            nativeAttributeNames(facts.element).length === 1 &&
            encoded !== null &&
            nativeGetAttribute(facts.element, "value") === encoded &&
            nativeOptionValue(facts.element as HTMLOptionElement) === encoded &&
            isSingleTextElement(facts.element, option.label)
          );
        }) &&
        decodeToolbarInlineFormatIntegerSelectValue(
          nativeSelectValue(selectRecord.input),
          selectRecord.declaration.minimum,
          selectRecord.declaration.maximum,
        ) !== null
      );
    }

    const inputRecord = record as
      StringFieldRecord | BooleanFieldRecord | Rgb24IntegerFieldRecord;
    const expectedInputAttributes =
      3 +
      (stringField ? 3 : 0) +
      (stringField && record.declaration.placeholder !== undefined ? 1 : 0);
    return (
      inputFacts.tagName === "INPUT" &&
      nativeAttributeNames(inputRecord.input).length ===
        expectedInputAttributes &&
      nativeGetAttribute(inputRecord.input, "type") ===
        (stringField ? "text" : booleanField ? "checkbox" : "color") &&
      (stringField
        ? nativeGetAttribute(inputRecord.input, "inputmode") === "url" &&
          nativeGetAttribute(inputRecord.input, "required") === "" &&
          nativeGetAttribute(inputRecord.input, "autocomplete") ===
            record.declaration.autocomplete &&
          (record.declaration.placeholder === undefined
            ? !nativeHasAttribute(inputRecord.input, "placeholder")
            : nativeGetAttribute(inputRecord.input, "placeholder") ===
              record.declaration.placeholder)
        : !nativeHasAttribute(inputRecord.input, "inputmode") &&
          !nativeHasAttribute(inputRecord.input, "autocomplete") &&
          !nativeHasAttribute(inputRecord.input, "required") &&
          !nativeHasAttribute(inputRecord.input, "placeholder") &&
          (booleanField
            ? !nativeInputIndeterminate(inputRecord.input)
            : decodeToolbarInlineFormatRgb24Color(
                nativeInputValue(inputRecord.input),
              ) !== null))
    );
  }

  #validActions(): boolean {
    const children = nativeChildNodes(this.#actions);
    return (
      nativeHtmlHostFacts(this.#actions)?.tagName === "DIV" &&
      nativeParentElement(this.#actions) === this.#panel &&
      nativeAttributeNames(this.#actions).length === 1 &&
      nativeHasAttribute(this.#actions, "data-breditor-toolbar-form-actions") &&
      children.length === 3 &&
      children[0] === this.#apply &&
      children[1] === this.#remove &&
      children[2] === this.#close &&
      isActionButton(
        this.#apply,
        "submit",
        "apply",
        this.#declaration.applyLabel,
      ) &&
      isActionButton(
        this.#remove,
        "button",
        "remove",
        this.#declaration.removeLabel,
      ) &&
      isActionButton(
        this.#close,
        "button",
        "close",
        this.#declaration.closeLabel,
      )
    );
  }

  #ownsControl(control: HTMLElement): boolean {
    return (
      this.#fields.some((record) => record.input === control) ||
      control === this.#apply ||
      control === this.#remove ||
      control === this.#close
    );
  }

  #validTextRegion(
    element: HTMLParagraphElement,
    dataAttribute: string,
    text: string,
    live: boolean,
  ): boolean {
    return (
      nativeHtmlHostFacts(element)?.tagName === "P" &&
      nativeParentElement(element) === this.#panel &&
      nativeAttributeNames(element).length === (live ? 4 : 1) &&
      nativeHasAttribute(element, dataAttribute) &&
      (!live ||
        (nativeGetAttribute(element, "role") === "status" &&
          nativeGetAttribute(element, "aria-live") === "polite" &&
          nativeGetAttribute(element, "aria-atomic") === "true")) &&
      isSingleTextElement(element, text)
    );
  }
}

function nextAvailablePanelId(treeRoot: Document | ShadowRoot): string {
  for (let attempt = 0; attempt < 1_024; attempt += 1) {
    if (nextPanelIdentity >= Number.MAX_SAFE_INTEGER) nextPanelIdentity = 1;
    const id = `breditor-toolbar-panel-${nextPanelIdentity}`;
    nextPanelIdentity += 1;
    if (nativeTreeRootGetElementById(treeRoot, id) === null) return id;
  }
  throw new RangeError("toolbar panel identity capacity is exhausted");
}

function setButtonDisabled(button: HTMLButtonElement, disabled: boolean): void {
  nativeSetAttribute(button, "aria-disabled", disabled ? "true" : "false");
  if (disabled) nativeSetAttribute(button, "disabled", "");
  else nativeRemoveAttribute(button, "disabled");
}

function isActionButton(
  button: HTMLButtonElement,
  type: "submit" | "button",
  action: "apply" | "remove" | "close",
  text: string,
): boolean {
  const disabled = nativeHasAttribute(button, "disabled");
  return (
    nativeHtmlHostFacts(button)?.tagName === "BUTTON" &&
    nativeGetAttribute(button, "type") === type &&
    nativeGetAttribute(button, "data-breditor-toolbar-form-action") ===
      action &&
    nativeGetAttribute(button, "aria-disabled") ===
      (disabled ? "true" : "false") &&
    nativeAttributeNames(button).length === (disabled ? 4 : 3) &&
    isSingleTextElement(button, text)
  );
}

function isSingleTextElement(element: HTMLElement, text: string): boolean {
  const children = nativeChildNodes(element);
  return (
    children.length === (text.length === 0 ? 0 : 1) &&
    (text.length === 0 ||
      (nativeNodeType(children[0]!) === 3 &&
        nativeNodeValue(children[0]!) === text &&
        nativeParentNode(children[0]!) === element))
  );
}

function bestEffort(callback: () => void): void {
  try {
    callback();
  } catch {
    // Logical ownership does not depend on damaged application DOM.
  }
}
