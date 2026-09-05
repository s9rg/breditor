/** Closed ownership result for one light-DOM editor event target. @internal */
export type DomEventOwnership =
  | "owned"
  | "outsideHost"
  | "nestedControl"
  | "invalid";

/**
 * Classifies one event target against a connected light-DOM editor host.
 *
 * Nested form controls and nested editing hosts retain their own native event
 * behavior. The check is total for hostile values and never consults an event's
 * composed path, so crossing a shadow boundary is deliberately unsupported.
 *
 * @internal
 */
export function classifyDomEventOwnership(
  host: HTMLElement,
  target: EventTarget | null,
): DomEventOwnership {
  try {
    if (!host.isConnected) {
      return "outsideHost";
    }
    if (typeof target !== "object" || target === null) {
      return "outsideHost";
    }
    const node = target as Node;
    if (
      typeof node.nodeType !== "number" ||
      node.ownerDocument !== host.ownerDocument ||
      (node !== host && !host.contains(node))
    ) {
      return "outsideHost";
    }
    let current: Node | null = node;
    while (current !== null && current !== host) {
      if (current.nodeType === 1) {
        const element = current as Element;
        const tag = element.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "OPTION" ||
          tag === "BUTTON" ||
          element.hasAttribute("contenteditable")
        ) {
          return "nestedControl";
        }
      }
      current = current.parentNode;
    }
    return current === host ? "owned" : "outsideHost";
  } catch {
    return "invalid";
  }
}
