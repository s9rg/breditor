const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const SAFE_FLOW_CONTAINER_TAGS: ReadonlySet<string> = new Set([
  "ARTICLE",
  "ASIDE",
  "DIV",
  "FOOTER",
  "HEADER",
  "MAIN",
  "NAV",
  "SECTION",
]);

type NativeGetter = (this: unknown) => unknown;
type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;

interface DomIntrinsics {
  readonly nodeType: NativeGetter;
  readonly ownerDocument: NativeGetter;
  readonly isConnected: NativeGetter;
  readonly parentElement: NativeGetter;
  readonly hasChildNodes: NativeMethod;
  readonly appendChild: NativeMethod;
  readonly addEventListener: NativeMethod;
  readonly removeEventListener: NativeMethod;
  readonly namespaceUri: NativeGetter;
  readonly tagName: NativeGetter;
  readonly getAttribute: NativeMethod;
  readonly hasAttribute: NativeMethod;
  readonly setAttribute: NativeMethod;
  readonly removeAttribute: NativeMethod;
  readonly removeElement: NativeMethod;
  readonly replaceChildren: NativeMethod;
}

interface HtmlElementFocusIntrinsics {
  readonly focus: NativeMethod;
  readonly blur: NativeMethod;
}

let capturedDomIntrinsics: DomIntrinsics | undefined;
let capturedHtmlElementFocusIntrinsics: HtmlElementFocusIntrinsics | undefined;
const ACTIVE_ELEMENT_GETTERS = new WeakMap<object, NativeGetter>();

/** Brand-checked native facts used to admit an application-owned HTML host. */
export interface NativeHtmlHostFacts {
  readonly element: HTMLElement;
  readonly ownerDocument: Document;
  readonly tagName: string;
  readonly isConnected: boolean;
  readonly hasChildren: boolean;
}

/**
 * Reads host identity and topology through captured DOM intrinsics.
 *
 * Own properties such as `tagName`, `isConnected`, or `childNodes` therefore
 * cannot make an unsupported, detached, or populated element pass admission.
 */
export function nativeHtmlHostFacts(
  value: unknown,
): NativeHtmlHostFacts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) return undefined;
  try {
    if (Reflect.apply(intrinsics.nodeType, value, []) !== 1) return undefined;
    if (Reflect.apply(intrinsics.namespaceUri, value, []) !== HTML_NAMESPACE) {
      return undefined;
    }
    const ownerDocument = Reflect.apply(
      intrinsics.ownerDocument,
      value,
      [],
    ) as unknown;
    const tagName = Reflect.apply(intrinsics.tagName, value, []) as unknown;
    const isConnected = Reflect.apply(
      intrinsics.isConnected,
      value,
      [],
    ) as unknown;
    const hasChildren = Reflect.apply(
      intrinsics.hasChildNodes,
      value,
      [],
    ) as unknown;
    if (
      ownerDocument === null ||
      typeof ownerDocument !== "object" ||
      typeof tagName !== "string" ||
      typeof isConnected !== "boolean" ||
      typeof hasChildren !== "boolean"
    ) {
      return undefined;
    }
    return Object.freeze({
      element: value as HTMLElement,
      ownerDocument: ownerDocument as Document,
      tagName,
      isConnected,
      hasChildren,
    });
  } catch {
    return undefined;
  }
}

/** Returns whether native element identity is in the supported host allowlist. */
export function isSafeFlowContainerHost(value: unknown): value is HTMLElement {
  const facts = nativeHtmlHostFacts(value);
  return facts !== undefined && SAFE_FLOW_CONTAINER_TAGS.has(facts.tagName);
}

/** Reads an attribute through the captured, brand-checked Element method. */
export function nativeGetAttribute(
  element: HTMLElement,
  name: string,
): string | null {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  return Reflect.apply(intrinsics.getAttribute, element, [name]) as
    string | null;
}

/** Checks an attribute through the captured, brand-checked Element method. */
export function nativeHasAttribute(
  element: HTMLElement,
  name: string,
): boolean {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  return Reflect.apply(intrinsics.hasAttribute, element, [name]) as boolean;
}

/** Sets an attribute through the captured, brand-checked Element method. */
export function nativeSetAttribute(
  element: HTMLElement,
  name: string,
  value: string,
): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.setAttribute, element, [name, value]);
}

/** Removes an attribute through the captured, brand-checked Element method. */
export function nativeRemoveAttribute(
  element: HTMLElement,
  name: string,
): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.removeAttribute, element, [name]);
}

/** Appends one node through the captured, brand-checked Node method. */
export function nativeAppendChild(parent: Node, child: Node): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.appendChild, parent, [child]);
}

/** Reads a node's owner document without consulting an own shadow property. */
export function nativeOwnerDocument(node: Node): Document | null {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const ownerDocument = Reflect.apply(
    intrinsics.ownerDocument,
    node,
    [],
  ) as unknown;
  if (ownerDocument === null) return null;
  if (typeof ownerDocument !== "object") {
    throw new TypeError("DOM owner document is invalid");
  }
  return ownerDocument as Document;
}

/** Focuses an HTML element through the captured, brand-checked native method. */
export function nativeFocusHtmlElement(
  element: HTMLElement,
  options?: FocusOptions,
): void {
  const intrinsics = htmlElementFocusIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM focus is unavailable");
  Reflect.apply(
    intrinsics.focus,
    element,
    options === undefined ? [] : [options],
  );
}

/** Blurs an HTML element through the captured, brand-checked native method. */
export function nativeBlurHtmlElement(element: HTMLElement): void {
  const intrinsics = htmlElementFocusIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM focus is unavailable");
  Reflect.apply(intrinsics.blur, element, []);
}

/** Reads a document's active element through its realm's captured native getter. */
export function nativeDocumentActiveElement(
  ownerDocument: Document,
): Element | null {
  const prototype = Object.getPrototypeOf(ownerDocument) as object | null;
  if (prototype === null) throw new TypeError("DOM focus is unavailable");
  let activeElement = ACTIVE_ELEMENT_GETTERS.get(prototype);
  if (activeElement === undefined) {
    activeElement = getter(prototype, "activeElement");
    if (activeElement === undefined) {
      throw new TypeError("DOM focus is unavailable");
    }
    ACTIVE_ELEMENT_GETTERS.set(prototype, activeElement);
  }
  const active = Reflect.apply(activeElement, ownerDocument, []) as unknown;
  if (active !== null && typeof active !== "object") {
    throw new TypeError("DOM active element is invalid");
  }
  return active as Element | null;
}

/** Adds an event listener without consulting an own target method. */
export function nativeAddEventListener<EventType extends Event>(
  target: EventTarget,
  type: string,
  listener: (event: EventType) => void,
): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.addEventListener, target, [type, listener]);
}

/** Removes an event listener without consulting an own target method. */
export function nativeRemoveEventListener<EventType extends Event>(
  target: EventTarget,
  type: string,
  listener: (event: EventType) => void,
): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.removeEventListener, target, [type, listener]);
}

/** Removes one element from its current parent through the captured method. */
export function nativeRemoveElement(element: HTMLElement): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.removeElement, element, []);
}

/** Replaces all children through the captured, brand-checked Element method. */
export function nativeReplaceChildren(
  element: HTMLElement,
  ...children: readonly (Node | string)[]
): void {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  Reflect.apply(intrinsics.replaceChildren, element, children);
}

/** Creates one ordinary HTML element without consulting an own document method. */
export function nativeCreateHtmlElement<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  localName: K,
): HTMLElementTagNameMap[K] {
  const prototype = Object.getPrototypeOf(ownerDocument) as object | null;
  const createElement = method(prototype ?? undefined, "createElement");
  if (createElement === undefined) throw new TypeError("DOM is unavailable");
  return Reflect.apply(createElement, ownerDocument, [
    localName,
  ]) as HTMLElementTagNameMap[K];
}

/** Reads the native parent element without consulting an own shadow property. */
export function nativeParentElement(element: HTMLElement): HTMLElement | null {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  return Reflect.apply(
    intrinsics.parentElement,
    element,
    [],
  ) as HTMLElement | null;
}

function domIntrinsics(): DomIntrinsics | undefined {
  if (capturedDomIntrinsics !== undefined) return capturedDomIntrinsics;
  const nodePrototype = typeof Node === "function" ? Node.prototype : undefined;
  const elementPrototype =
    typeof Element === "function" ? Element.prototype : undefined;
  const nodeType = getter(nodePrototype, "nodeType");
  const ownerDocument = getter(nodePrototype, "ownerDocument");
  const isConnected = getter(nodePrototype, "isConnected");
  const parentElement = getter(nodePrototype, "parentElement");
  const hasChildNodes = method(nodePrototype, "hasChildNodes");
  const appendChild = method(nodePrototype, "appendChild");
  const addEventListener = method(nodePrototype, "addEventListener");
  const removeEventListener = method(nodePrototype, "removeEventListener");
  const namespaceUri = getter(elementPrototype, "namespaceURI");
  const tagName = getter(elementPrototype, "tagName");
  const getAttribute = method(elementPrototype, "getAttribute");
  const hasAttribute = method(elementPrototype, "hasAttribute");
  const setAttribute = method(elementPrototype, "setAttribute");
  const removeAttribute = method(elementPrototype, "removeAttribute");
  const removeElement = method(elementPrototype, "remove");
  const replaceChildren = method(elementPrototype, "replaceChildren");
  if (
    nodeType === undefined ||
    ownerDocument === undefined ||
    isConnected === undefined ||
    parentElement === undefined ||
    hasChildNodes === undefined ||
    appendChild === undefined ||
    addEventListener === undefined ||
    removeEventListener === undefined ||
    namespaceUri === undefined ||
    tagName === undefined ||
    getAttribute === undefined ||
    hasAttribute === undefined ||
    setAttribute === undefined ||
    removeAttribute === undefined ||
    removeElement === undefined ||
    replaceChildren === undefined
  ) {
    return undefined;
  }
  capturedDomIntrinsics = Object.freeze({
    nodeType,
    ownerDocument,
    isConnected,
    parentElement,
    hasChildNodes,
    appendChild,
    addEventListener,
    removeEventListener,
    namespaceUri,
    tagName,
    getAttribute,
    hasAttribute,
    setAttribute,
    removeAttribute,
    removeElement,
    replaceChildren,
  });
  return capturedDomIntrinsics;
}

function htmlElementFocusIntrinsics(): HtmlElementFocusIntrinsics | undefined {
  if (capturedHtmlElementFocusIntrinsics !== undefined) {
    return capturedHtmlElementFocusIntrinsics;
  }
  const htmlElementPrototype =
    typeof HTMLElement === "function" ? HTMLElement.prototype : undefined;
  const focus = method(htmlElementPrototype, "focus");
  const blur = method(htmlElementPrototype, "blur");
  if (focus === undefined || blur === undefined) return undefined;
  capturedHtmlElementFocusIntrinsics = Object.freeze({ focus, blur });
  return capturedHtmlElementFocusIntrinsics;
}

function getter(
  prototype: object | undefined,
  name: string,
): NativeGetter | undefined {
  let candidate: object | null | undefined = prototype;
  while (candidate !== undefined && candidate !== null) {
    const found = Object.getOwnPropertyDescriptor(candidate, name)?.get;
    if (found !== undefined) return found;
    candidate = Object.getPrototypeOf(candidate) as object | null;
  }
  return undefined;
}

function method(
  prototype: object | undefined,
  name: string,
): NativeMethod | undefined {
  let candidate: object | null | undefined = prototype;
  while (candidate !== undefined && candidate !== null) {
    const value = Object.getOwnPropertyDescriptor(candidate, name)?.value;
    if (typeof value === "function") return value as NativeMethod;
    candidate = Object.getPrototypeOf(candidate) as object | null;
  }
  return undefined;
}
