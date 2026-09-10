import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  nativeAbstractRangeFacts,
  nativeCreateHtmlElement,
  nativeDocumentActiveElement,
  nativeDocumentCreateRange,
  nativeDocumentDefaultView,
  nativeDocumentGetElementById,
  nativeDocumentSelection,
  nativeInputChecked,
  nativeInputIndeterminate,
  nativeInputValue,
  nativeSelectionFacts,
  nativeSetInputChecked,
  nativeSetInputIndeterminate,
  nativeSetInputValue,
} from "./html_host.js";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("trusted platform intrinsics", () => {
  it("ignores a chain-severing Document prototype for reads and factories", () => {
    const focused = document.createElement("input");
    const expected = document.createElement("div");
    const decoy = document.createElement("button");
    expected.id = "expected-id";
    document.body.append(focused, expected, decoy);
    focused.focus();
    const actualSelection = document.getSelection();
    const originalPrototype = Object.getPrototypeOf(document) as object;
    const trap = vi.fn();
    const poison = Object.create(Object.prototype) as object;
    Object.defineProperties(poison, {
      activeElement: {
        configurable: true,
        get: () => {
          trap();
          return decoy;
        },
      },
      defaultView: {
        configurable: true,
        get: () => {
          trap();
          return window;
        },
      },
      getElementById: {
        configurable: true,
        value: () => {
          trap();
          return decoy;
        },
      },
      getSelection: {
        configurable: true,
        value: () => {
          trap();
          return actualSelection;
        },
      },
      createRange: {
        configurable: true,
        value: () => {
          trap();
          return {};
        },
      },
      createElement: {
        configurable: true,
        value: () => {
          trap();
          return decoy;
        },
      },
    });

    let active: Element | null = null;
    let view: Window | null = null;
    let found: Element | null = null;
    let selection: Selection | null = null;
    let range: Range | undefined;
    let created: HTMLSpanElement | undefined;
    try {
      Object.setPrototypeOf(document, poison);
      active = nativeDocumentActiveElement(document);
      view = nativeDocumentDefaultView(document);
      found = nativeDocumentGetElementById(document, "expected-id");
      selection = nativeDocumentSelection(document);
      range = nativeDocumentCreateRange(document);
      created = nativeCreateHtmlElement(document, "span");
    } finally {
      Object.setPrototypeOf(document, originalPrototype);
    }

    expect(active).toBe(focused);
    expect(view).not.toBeNull();
    expect(view?.document).toBe(document);
    expect(found).toBe(expected);
    expect(selection).toBe(actualSelection);
    expect(range).toBeInstanceOf(Range);
    expect(created).toBeInstanceOf(HTMLSpanElement);
    expect(created).not.toBe(decoy);
    expect(trap).not.toHaveBeenCalled();
  });

  it("ignores chain-severing Input, Selection, and Range prototypes", () => {
    const input = document.createElement("input");
    input.value = "before";
    input.checked = true;
    input.indeterminate = true;
    const selection = document.getSelection();
    if (selection === null) throw new Error("missing DOM selection");
    const range = document.createRange();
    range.selectNodeContents(document.body);
    selection.removeAllRanges();
    selection.addRange(range);
    const inputPrototype = Object.getPrototypeOf(input) as object;
    const selectionPrototype = Object.getPrototypeOf(selection) as object;
    const rangePrototype = Object.getPrototypeOf(range) as object;
    const trap = vi.fn();
    const poisonedInput = Object.create(Object.prototype) as object;
    Object.defineProperties(poisonedInput, {
      value: { configurable: true, get: trap, set: trap },
      checked: { configurable: true, get: trap, set: trap },
      indeterminate: { configurable: true, get: trap, set: trap },
    });
    const poisonedSelection = Object.create(Object.prototype) as object;
    Object.defineProperties(poisonedSelection, {
      rangeCount: { configurable: true, get: trap },
      anchorNode: { configurable: true, get: trap },
      anchorOffset: { configurable: true, get: trap },
      focusNode: { configurable: true, get: trap },
      focusOffset: { configurable: true, get: trap },
      getRangeAt: { configurable: true, value: trap },
      addRange: { configurable: true, value: trap },
      removeAllRanges: { configurable: true, value: trap },
    });
    const poisonedRange = Object.create(Object.prototype) as object;
    Object.defineProperties(poisonedRange, {
      startContainer: { configurable: true, get: trap },
      startOffset: { configurable: true, get: trap },
      endContainer: { configurable: true, get: trap },
      endOffset: { configurable: true, get: trap },
      setStart: { configurable: true, value: trap },
      setEnd: { configurable: true, value: trap },
      intersectsNode: { configurable: true, value: trap },
    });

    let value = "";
    let checked = false;
    let indeterminate = false;
    let selectionFacts: ReturnType<typeof nativeSelectionFacts> | undefined;
    let rangeFacts: ReturnType<typeof nativeAbstractRangeFacts> | undefined;
    try {
      Object.setPrototypeOf(input, poisonedInput);
      Object.setPrototypeOf(selection, poisonedSelection);
      Object.setPrototypeOf(range, poisonedRange);
      value = nativeInputValue(input);
      checked = nativeInputChecked(input);
      indeterminate = nativeInputIndeterminate(input);
      nativeSetInputValue(input, "after");
      nativeSetInputChecked(input, false);
      nativeSetInputIndeterminate(input, false);
      selectionFacts = nativeSelectionFacts(selection);
      rangeFacts = nativeAbstractRangeFacts(range);
    } finally {
      Object.setPrototypeOf(range, rangePrototype);
      Object.setPrototypeOf(selection, selectionPrototype);
      Object.setPrototypeOf(input, inputPrototype);
    }

    expect(value).toBe("before");
    expect(checked).toBe(true);
    expect(indeterminate).toBe(true);
    expect(input.value).toBe("after");
    expect(input.checked).toBe(false);
    expect(input.indeterminate).toBe(false);
    expect(selectionFacts?.rangeCount).toBe(1);
    expect(rangeFacts?.startContainer).toBe(document.body);
    expect(trap).not.toHaveBeenCalled();
  });

  it("applies module-realm intrinsics to foreign and adopted objects", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const foreignDocument = iframe.contentDocument;
    if (foreignDocument === null) throw new Error("missing iframe document");
    const input = foreignDocument.createElement("input");
    const foreignPrototype = Object.getPrototypeOf(input);
    input.value = "foreign";
    input.checked = true;
    foreignDocument.body.append(input);

    expect(nativeDocumentDefaultView(foreignDocument)?.document).toBe(
      foreignDocument,
    );
    expect(nativeInputValue(input)).toBe("foreign");
    nativeSetInputChecked(input, false);
    document.adoptNode(input);
    document.body.append(input);

    expect(Object.getPrototypeOf(input)).toBe(foreignPrototype);
    expect(input).not.toBeInstanceOf(HTMLInputElement);
    expect(nativeInputValue(input)).toBe("foreign");
    expect(nativeInputChecked(input)).toBe(false);
    nativeSetInputValue(input, "adopted");
    expect(nativeInputValue(input)).toBe("adopted");
    iframe.remove();
  });
});
