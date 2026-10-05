import {beforeEach, describe, expect, it, vi} from "vitest";
import {installToolbarKeyboardReturn} from "./toolbar_keyboard_return.js";

beforeEach(() => document.body.replaceChildren());

function fixture(root: HTMLElement | ShadowRoot = document.body) {
  const toolbar = document.createElement("div");
  const button = document.createElement("button");
  toolbar.append(button);
  const editor = document.createElement("div");
  editor.tabIndex = 0;
  const other = document.createElement("button");
  root.append(toolbar, editor, other);
  const restore = vi.fn();
  const failed = vi.fn();
  const dispose = installToolbarKeyboardReturn(editor, toolbar, restore, failed);
  const tab = (options: KeyboardEventInit = {}) => button.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Tab", code: "Tab", bubbles: true, cancelable: true, ...options,
  }));
  return {toolbar, button, editor, other, restore, failed, dispose, tab};
}

describe("toolbar keyboard return", () => {
  it.each([false, true])("restores once for direct Tab return (shift=%s), without selecting the focus target", shiftKey => {
    const f = fixture();
    f.button.focus();
    expect(f.tab({shiftKey})).toBe(true);
    expect(document.activeElement).toBe(f.button);
    expect(f.restore).not.toHaveBeenCalled();
    f.editor.focus();
    expect(f.restore).toHaveBeenCalledTimes(1);
    f.button.focus(); f.editor.focus();
    expect(f.restore).toHaveBeenCalledTimes(1);
    expect(f.failed).not.toHaveBeenCalled();
    f.dispose();
  });

  it.each([
    {key: "ArrowRight"}, {altKey: true}, {ctrlKey: true}, {metaKey: true},
    {isComposing: true}, {keyCode: 229},
  ])("does not arm for unrelated/composing keys: %j", options => {
    const f = fixture();
    f.button.focus(); f.tab(options); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.dispose();
  });

  it("respects canceled Tab and rejects an unfocused keyboard event target", () => {
    const f = fixture();
    f.button.focus();
    f.button.addEventListener("keydown", event => event.preventDefault(), {once: true});
    f.tab(); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.other.focus(); f.tab(); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.dispose();
  });

  it.each(["keyup", "pointerdown", "mousedown", "compositionstart"])("spends pending return on %s", type => {
    const f = fixture();
    f.button.focus(); f.tab();
    f.button.dispatchEvent(new Event(type, {bubbles: true}));
    f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.dispose();
  });

  it("does not carry a return across another focus target or a later key", () => {
    const f = fixture();
    f.button.focus(); f.tab(); f.other.focus(); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.button.focus(); f.tab(); f.tab({key: "a"}); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.dispose();
  });

  it("does not intercept ordinary pointer/programmatic focus and becomes inert on disposal", () => {
    const f = fixture();
    f.button.focus(); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
    f.button.focus(); f.tab(); f.dispose(); f.dispose(); f.editor.focus();
    expect(f.restore).not.toHaveBeenCalled();
  });

  it("spends the return before callback reentrancy and contains a restoration exception", () => {
    const f = fixture();
    f.restore.mockImplementation(() => { f.button.focus(); f.editor.focus(); throw new Error("restore failed"); });
    f.button.focus(); f.tab(); f.editor.focus();
    expect(f.restore).toHaveBeenCalledTimes(1);
    expect(f.failed).toHaveBeenCalledTimes(1);
    f.dispose();
  });

  it("keeps independently mounted editor owners separate", () => {
    const first = fixture(), second = fixture();
    first.button.focus(); first.tab(); second.editor.focus();
    expect(first.restore).not.toHaveBeenCalled();
    expect(second.restore).not.toHaveBeenCalled();
    first.dispose(); second.dispose();
  });

  it("uses the local focus root inside a shadow tree", () => {
    const host = document.createElement("div"); document.body.append(host);
    const f = fixture(host.attachShadow({mode: "open"}));
    f.button.focus(); f.tab(); f.editor.focus();
    expect(f.restore).toHaveBeenCalledTimes(1);
    f.dispose();
  });
});
