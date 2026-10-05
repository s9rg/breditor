import {readDomEventBase, readDomKeyboardEvent} from "./dom_event_intrinsics.js";
import {
  nativeAddEventListener, nativeRemoveEventListener, nativeContainsNode,
  nativeTreeRoot, nativeTreeRootActiveElement,
} from "./html_host.js";

/**
 * Restores semantic selection only for the next keyboard Tab transition from
 * this toolbar into its editor. Never intercepts Tab, chooses a focus target,
 * retains a DOM range, or restores selection for pointer/programmatic entry.
 * A different focus target, key, pointer, composition or disposal spends the
 * pending return. Kept separate from the toolbar's presentation-only roving UI.
 * @internal
 */
export function installToolbarKeyboardReturn(
  editor: HTMLElement,
  toolbar: HTMLElement,
  restore: () => void,
  failed: () => void,
): () => void {
  const root = nativeTreeRoot(editor);
  if (root !== nativeTreeRoot(toolbar)) throw new TypeError("Toolbar and editor must share a focus root");
  let pending = false;
  let disposed = false;
  const guard = (action: (event: Event) => void): EventListener => event => {
    if (disposed) return;
    try { action(event); } catch { pending = false; failed(); }
  };
  const cancel = (): void => { pending = false; };
  const keydown = guard(event => {
    pending = false;
    const base = readDomEventBase(event);
    const key = readDomKeyboardEvent(event);
    if (base?.type !== "keydown" || base.defaultPrevented || !key || key.source !== base.source ||
        key.key !== "Tab" || key.altKey || key.ctrlKey || key.metaKey || key.isComposing || key.keyCode === 229) return;
    const active = nativeTreeRootActiveElement(root);
    if (active && nativeContainsNode(toolbar, active) && base.target === active) pending = true;
  });
  const focus = guard(event => {
    const returning = pending;
    pending = false;
    if (!returning) return;
    const base = readDomEventBase(event);
    if (base?.type === "focusin" && base.target === editor && nativeTreeRootActiveElement(root) === editor) restore();
  });
  const registrations = [
    ["keydown", keydown], ["focusin", focus],
    ["keyup", cancel], ["pointerdown", cancel],
    ["mousedown", cancel], ["compositionstart", cancel],
  ] as const;
  const installed: typeof registrations[number][] = [];
  const dispose = (): void => {
    disposed = true;
    pending = false;
    for (const [type, listener] of installed.splice(0)) {
      nativeRemoveEventListener(root, type, listener);
    }
  };
  try {
    for (const entry of registrations) {
      installed.push(entry);
      nativeAddEventListener(root, entry[0], entry[1]);
    }
  } catch (error) { dispose(); throw error; }
  return dispose;
}
