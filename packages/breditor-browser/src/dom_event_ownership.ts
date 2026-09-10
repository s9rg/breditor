import {
  nativeContainsNode,
  nativeElementLocalName,
  nativeHasAttribute,
  nativeHtmlHostFacts,
  nativeNodeType,
  nativeOwnerDocument,
  nativeParentNode,
  nativeTreeRoot,
} from "./html_host.js";

const MAX_EVENT_TARGET_ANCESTORS = 64;

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
    const hostFacts = nativeHtmlHostFacts(host);
    if (hostFacts === undefined) {
      return "invalid";
    }
    if (!hostFacts.isConnected) {
      return "outsideHost";
    }
    if (nativeTreeRoot(hostFacts.element) !== hostFacts.ownerDocument) {
      return "invalid";
    }
    if (typeof target !== "object" || target === null) {
      return "outsideHost";
    }
    const node = target as Node;
    if (
      nativeOwnerDocument(node) !== hostFacts.ownerDocument ||
      !nativeContainsNode(host, node)
    ) {
      return "outsideHost";
    }
    let current: Node | null = node;
    let traversed = 0;
    while (current !== null && current !== host) {
      traversed += 1;
      if (traversed > MAX_EVENT_TARGET_ANCESTORS) return "invalid";
      if (nativeNodeType(current) === 1) {
        const facts = nativeHtmlHostFacts(current);
        if (facts === undefined) return "invalid";
        const localName = nativeElementLocalName(facts.element);
        if (
          localName === "input" ||
          localName === "textarea" ||
          localName === "select" ||
          localName === "option" ||
          localName === "button" ||
          nativeHasAttribute(facts.element, "contenteditable")
        ) {
          return "nestedControl";
        }
      }
      current = nativeParentNode(current);
    }
    return current === host ? "owned" : "outsideHost";
  } catch {
    return "invalid";
  }
}
