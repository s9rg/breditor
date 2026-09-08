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
  readonly childNodes: NativeGetter;
  readonly parentNode: NativeGetter;
  readonly nodeValue: NativeGetter;
  readonly nodeListLength: NativeGetter;
  readonly nodeListItem: NativeMethod;
  readonly isConnected: NativeGetter;
  readonly parentElement: NativeGetter;
  readonly hasChildNodes: NativeMethod;
  readonly contains: NativeMethod;
  readonly appendChild: NativeMethod;
  readonly addEventListener: NativeMethod;
  readonly removeEventListener: NativeMethod;
  readonly namespaceUri: NativeGetter;
  readonly tagName: NativeGetter;
  readonly localName: NativeGetter;
  readonly getAttributeNames: NativeMethod;
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

interface SelectionIntrinsics {
  readonly rangeCount: NativeGetter;
  readonly anchorNode: NativeGetter;
  readonly anchorOffset: NativeGetter;
  readonly focusNode: NativeGetter;
  readonly focusOffset: NativeGetter;
  readonly getRangeAt: NativeMethod;
  readonly addRange: NativeMethod;
  readonly removeAllRanges: NativeMethod;
  readonly setBaseAndExtent: NativeMethod | undefined;
  readonly collapse: NativeMethod | undefined;
  readonly extend: NativeMethod | undefined;
}

interface AbstractRangeIntrinsics {
  readonly startContainer: NativeGetter;
  readonly startOffset: NativeGetter;
  readonly endContainer: NativeGetter;
  readonly endOffset: NativeGetter;
}

interface RangeIntrinsics extends AbstractRangeIntrinsics {
  readonly setStart: NativeMethod;
  readonly setEnd: NativeMethod;
  readonly intersectsNode: NativeMethod;
}

let capturedDomIntrinsics: DomIntrinsics | undefined;
let capturedHtmlElementFocusIntrinsics: HtmlElementFocusIntrinsics | undefined;
const ACTIVE_ELEMENT_GETTERS = new WeakMap<object, NativeGetter>();
const DEFAULT_VIEW_GETTERS = new WeakMap<object, NativeGetter>();
const DOCUMENT_GET_SELECTION_METHODS = new WeakMap<object, NativeMethod>();
const DOCUMENT_CREATE_RANGE_METHODS = new WeakMap<object, NativeMethod>();
const SELECTION_INTRINSICS = new WeakMap<object, SelectionIntrinsics>();
const ABSTRACT_RANGE_INTRINSICS = new WeakMap<object, AbstractRangeIntrinsics>();
const RANGE_INTRINSICS = new WeakMap<object, RangeIntrinsics>();

/** Maximum children copied by one native topology snapshot. */
export const MAX_NATIVE_CHILD_NODE_SNAPSHOT = 262_144;

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

/** Returns exact attribute names without consulting an own `attributes` shadow. */
export function nativeAttributeNames(element: HTMLElement): readonly string[] {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const names = Reflect.apply(
    intrinsics.getAttributeNames,
    element,
    [],
  ) as unknown;
  if (!Array.isArray(names)) {
    throw new TypeError("DOM attribute names are invalid");
  }
  const safe: string[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index] as unknown;
    if (typeof name !== "string") {
      throw new TypeError("DOM attribute names are invalid");
    }
    safe.push(name);
  }
  return Object.freeze(safe);
}

/** Reads an element's native local name without consulting an own shadow. */
export function nativeElementLocalName(element: Element): string {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const value = Reflect.apply(intrinsics.localName, element, []) as unknown;
  if (typeof value !== "string") {
    throw new TypeError("DOM element local name is invalid");
  }
  return value;
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

/** Tests inclusive native containment without consulting an own method. */
export function nativeContainsNode(parent: Node, node: Node): boolean {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const value = Reflect.apply(intrinsics.contains, parent, [node]) as unknown;
  if (typeof value !== "boolean") {
    throw new TypeError("DOM containment result is invalid");
  }
  return value;
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

/**
 * Snapshots a node's children through the captured, brand-checked native
 * getter. An own `childNodes` shadow therefore cannot forge the baseline used
 * by an ownership-preserving DOM transaction.
 */
export function nativeChildNodes(node: Node): readonly ChildNode[] {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const childNodes = Reflect.apply(intrinsics.childNodes, node, []) as unknown;
  if (typeof childNodes !== "object" || childNodes === null) {
    throw new TypeError("DOM child nodes are invalid");
  }
  const length = Reflect.apply(
    intrinsics.nodeListLength,
    childNodes,
    [],
  ) as unknown;
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_NATIVE_CHILD_NODE_SNAPSHOT
  ) {
    throw new TypeError("DOM child node count is invalid");
  }
  const safe: ChildNode[] = [];
  for (let index = 0; index < length; index += 1) {
    const child = Reflect.apply(
      intrinsics.nodeListItem,
      childNodes,
      [index],
    ) as unknown;
    if (typeof child !== "object" || child === null) {
      throw new TypeError("DOM child nodes are invalid");
    }
    safe.push(child as ChildNode);
  }
  return Object.freeze(safe);
}

/** Reads a node's native numeric kind without consulting an own shadow. */
export function nativeNodeType(node: Node): number {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const value = Reflect.apply(intrinsics.nodeType, node, []) as unknown;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError("DOM node type is invalid");
  }
  return value;
}

/** Reads native document-connectivity without consulting an own shadow. */
export function nativeIsConnected(node: Node): boolean {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const value = Reflect.apply(intrinsics.isConnected, node, []) as unknown;
  if (typeof value !== "boolean") {
    throw new TypeError("DOM connectivity is invalid");
  }
  return value;
}

/** Reads a node's native parent without consulting an own shadow. */
export function nativeParentNode(node: Node): Node | null {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const value = Reflect.apply(intrinsics.parentNode, node, []) as unknown;
  if (value !== null && (typeof value !== "object" || value === undefined)) {
    throw new TypeError("DOM parent node is invalid");
  }
  return value as Node | null;
}

/** Reads a node's native value without consulting an own shadow. */
export function nativeNodeValue(node: Node): string | null {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const value = Reflect.apply(intrinsics.nodeValue, node, []) as unknown;
  if (value !== null && typeof value !== "string") {
    throw new TypeError("DOM node value is invalid");
  }
  return value as string | null;
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
    activeElement = deepestGetter(prototype, "activeElement");
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

/** Reads a document's native associated Window without consulting an own shadow. */
export function nativeDocumentDefaultView(
  ownerDocument: Document,
): (Window & typeof globalThis) | null {
  const prototype = Object.getPrototypeOf(ownerDocument) as object | null;
  if (prototype === null) throw new TypeError("DOM window is unavailable");
  let defaultView = DEFAULT_VIEW_GETTERS.get(prototype);
  if (defaultView === undefined) {
    defaultView = deepestGetter(prototype, "defaultView");
    if (defaultView === undefined) throw new TypeError("DOM window is unavailable");
    DEFAULT_VIEW_GETTERS.set(prototype, defaultView);
  }
  const view = Reflect.apply(defaultView, ownerDocument, []) as unknown;
  if (view === null) return null;
  if (typeof view !== "object" && typeof view !== "function") {
    throw new TypeError("DOM window is invalid");
  }
  return view as Window & typeof globalThis;
}

/** Returns the real selection owned by a document's native associated Window. */
export function nativeDocumentSelection(ownerDocument: Document): Selection | null {
  if (nativeDocumentDefaultView(ownerDocument) === null) return null;
  const prototype = Object.getPrototypeOf(ownerDocument) as object | null;
  if (prototype === null) throw new TypeError("DOM selection is unavailable");
  let getSelection = DOCUMENT_GET_SELECTION_METHODS.get(prototype);
  if (getSelection === undefined) {
    getSelection = deepestMethod(prototype, "getSelection");
    if (getSelection === undefined) {
      throw new TypeError("DOM selection is unavailable");
    }
    DOCUMENT_GET_SELECTION_METHODS.set(prototype, getSelection);
  }
  const selection = Reflect.apply(getSelection, ownerDocument, []) as unknown;
  if (selection === null) return null;
  if (typeof selection !== "object") {
    throw new TypeError("DOM selection is invalid");
  }
  // Capturing the native getter table proves the returned object's brand.
  selectionIntrinsics(selection as Selection);
  return selection as Selection;
}

/** Creates a real Range through the document's captured native method. */
export function nativeDocumentCreateRange(ownerDocument: Document): Range {
  const prototype = Object.getPrototypeOf(ownerDocument) as object | null;
  if (prototype === null) throw new TypeError("DOM Range is unavailable");
  let createRange = DOCUMENT_CREATE_RANGE_METHODS.get(prototype);
  if (createRange === undefined) {
    createRange = deepestMethod(prototype, "createRange");
    if (createRange === undefined) throw new TypeError("DOM Range is unavailable");
    DOCUMENT_CREATE_RANGE_METHODS.set(prototype, createRange);
  }
  const range = Reflect.apply(createRange, ownerDocument, []) as unknown;
  if (typeof range !== "object" || range === null) {
    throw new TypeError("DOM Range is invalid");
  }
  rangeIntrinsics(range as Range);
  return range as Range;
}

/** Native scalar facts for one real browser Selection. */
export interface NativeSelectionFacts {
  readonly rangeCount: number;
  readonly anchorNode: Node | null;
  readonly anchorOffset: number;
  readonly focusNode: Node | null;
  readonly focusOffset: number;
}

/** Reads Selection state through captured brand-checked prototype getters. */
export function nativeSelectionFacts(selection: Selection): NativeSelectionFacts {
  const intrinsics = selectionIntrinsics(selection);
  const rangeCount = Reflect.apply(intrinsics.rangeCount, selection, []) as unknown;
  const anchorNode = Reflect.apply(intrinsics.anchorNode, selection, []) as unknown;
  const anchorOffset = Reflect.apply(intrinsics.anchorOffset, selection, []) as unknown;
  const focusNode = Reflect.apply(intrinsics.focusNode, selection, []) as unknown;
  const focusOffset = Reflect.apply(intrinsics.focusOffset, selection, []) as unknown;
  if (
    typeof rangeCount !== "number" ||
    typeof anchorOffset !== "number" ||
    typeof focusOffset !== "number" ||
    (anchorNode !== null && typeof anchorNode !== "object") ||
    (focusNode !== null && typeof focusNode !== "object")
  ) {
    throw new TypeError("DOM selection facts are invalid");
  }
  return Object.freeze({
    rangeCount,
    anchorNode: anchorNode as Node | null,
    anchorOffset,
    focusNode: focusNode as Node | null,
    focusOffset,
  });
}

/** Reads one real Range from a Selection through its captured native method. */
export function nativeSelectionGetRangeAt(
  selection: Selection,
  index: number,
): Range {
  const value = Reflect.apply(
    selectionIntrinsics(selection).getRangeAt,
    selection,
    [index],
  ) as unknown;
  if (typeof value !== "object" || value === null) {
    throw new TypeError("DOM selection Range is invalid");
  }
  rangeIntrinsics(value as Range);
  return value as Range;
}

/** Whether the real Selection prototype provides directional installation. */
export function nativeSelectionSupportsSetBaseAndExtent(
  selection: Selection,
): boolean {
  return selectionIntrinsics(selection).setBaseAndExtent !== undefined;
}

/** Installs directional endpoints through the captured native Selection method. */
export function nativeSelectionSetBaseAndExtent(
  selection: Selection,
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
): void {
  const setBaseAndExtent = selectionIntrinsics(selection).setBaseAndExtent;
  if (setBaseAndExtent === undefined) {
    throw new TypeError("Directional DOM selection is unavailable");
  }
  Reflect.apply(setBaseAndExtent, selection, [
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
  ]);
}

/** Removes all ranges through the captured native Selection method. */
export function nativeSelectionRemoveAllRanges(selection: Selection): void {
  Reflect.apply(
    selectionIntrinsics(selection).removeAllRanges,
    selection,
    [],
  );
}

/** Adds one real Range through the captured native Selection method. */
export function nativeSelectionAddRange(selection: Selection, range: Range): void {
  Reflect.apply(selectionIntrinsics(selection).addRange, selection, [range]);
}

/** Whether native collapse/extend fallback methods are both available. */
export function nativeSelectionSupportsCollapseExtend(
  selection: Selection,
): boolean {
  const intrinsics = selectionIntrinsics(selection);
  return intrinsics.collapse !== undefined && intrinsics.extend !== undefined;
}

/** Reinstalls directional endpoints through native collapse then extend. */
export function nativeSelectionCollapseAndExtend(
  selection: Selection,
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
): void {
  const intrinsics = selectionIntrinsics(selection);
  if (intrinsics.collapse === undefined || intrinsics.extend === undefined) {
    throw new TypeError("DOM collapse/extend is unavailable");
  }
  Reflect.apply(intrinsics.collapse, selection, [anchorNode, anchorOffset]);
  Reflect.apply(intrinsics.extend, selection, [focusNode, focusOffset]);
}

/** Native scalar facts for one real browser Range. */
export interface NativeRangeFacts {
  readonly startContainer: Node;
  readonly startOffset: number;
  readonly endContainer: Node;
  readonly endOffset: number;
}

/** Reads real Range or StaticRange endpoints through native prototype getters. */
export function nativeAbstractRangeFacts(
  range: AbstractRange,
): NativeRangeFacts {
  const intrinsics = abstractRangeIntrinsics(range);
  const startContainer = Reflect.apply(
    intrinsics.startContainer,
    range,
    [],
  ) as unknown;
  const startOffset = Reflect.apply(intrinsics.startOffset, range, []) as unknown;
  const endContainer = Reflect.apply(intrinsics.endContainer, range, []) as unknown;
  const endOffset = Reflect.apply(intrinsics.endOffset, range, []) as unknown;
  if (
    typeof startContainer !== "object" ||
    startContainer === null ||
    typeof endContainer !== "object" ||
    endContainer === null ||
    typeof startOffset !== "number" ||
    typeof endOffset !== "number"
  ) {
    throw new TypeError("DOM AbstractRange facts are invalid");
  }
  return Object.freeze({
    startContainer: startContainer as Node,
    startOffset,
    endContainer: endContainer as Node,
    endOffset,
  });
}

/** Reads Range endpoints through captured brand-checked prototype getters. */
export function nativeRangeFacts(range: Range): NativeRangeFacts {
  rangeIntrinsics(range);
  return nativeAbstractRangeFacts(range);
}

/** Sets the start endpoint through the captured native Range method. */
export function nativeRangeSetStart(
  range: Range,
  node: Node,
  offset: number,
): void {
  Reflect.apply(rangeIntrinsics(range).setStart, range, [node, offset]);
}

/** Sets the end endpoint through the captured native Range method. */
export function nativeRangeSetEnd(
  range: Range,
  node: Node,
  offset: number,
): void {
  Reflect.apply(rangeIntrinsics(range).setEnd, range, [node, offset]);
}

/** Tests Range intersection through the captured native method. */
export function nativeRangeIntersectsNode(range: Range, node: Node): boolean {
  const value = Reflect.apply(
    rangeIntrinsics(range).intersectsNode,
    range,
    [node],
  ) as unknown;
  if (typeof value !== "boolean") {
    throw new TypeError("DOM Range intersection is invalid");
  }
  return value;
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
  const createElement = deepestMethod(prototype ?? undefined, "createElement");
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
  const nodeListPrototype =
    typeof NodeList === "function" ? NodeList.prototype : undefined;
  const elementPrototype =
    typeof Element === "function" ? Element.prototype : undefined;
  const nodeType = getter(nodePrototype, "nodeType");
  const ownerDocument = getter(nodePrototype, "ownerDocument");
  const childNodes = getter(nodePrototype, "childNodes");
  const parentNode = getter(nodePrototype, "parentNode");
  const nodeValue = getter(nodePrototype, "nodeValue");
  const nodeListLength = getter(nodeListPrototype, "length");
  const nodeListItem = method(nodeListPrototype, "item");
  const isConnected = getter(nodePrototype, "isConnected");
  const parentElement = getter(nodePrototype, "parentElement");
  const hasChildNodes = method(nodePrototype, "hasChildNodes");
  const contains = method(nodePrototype, "contains");
  const appendChild = method(nodePrototype, "appendChild");
  const addEventListener = method(nodePrototype, "addEventListener");
  const removeEventListener = method(nodePrototype, "removeEventListener");
  const namespaceUri = getter(elementPrototype, "namespaceURI");
  const tagName = getter(elementPrototype, "tagName");
  const localName = getter(elementPrototype, "localName");
  const getAttributeNames = method(elementPrototype, "getAttributeNames");
  const getAttribute = method(elementPrototype, "getAttribute");
  const hasAttribute = method(elementPrototype, "hasAttribute");
  const setAttribute = method(elementPrototype, "setAttribute");
  const removeAttribute = method(elementPrototype, "removeAttribute");
  const removeElement = method(elementPrototype, "remove");
  const replaceChildren = method(elementPrototype, "replaceChildren");
  if (
    nodeType === undefined ||
    ownerDocument === undefined ||
    childNodes === undefined ||
    parentNode === undefined ||
    nodeValue === undefined ||
    nodeListLength === undefined ||
    nodeListItem === undefined ||
    isConnected === undefined ||
    parentElement === undefined ||
    hasChildNodes === undefined ||
    contains === undefined ||
    appendChild === undefined ||
    addEventListener === undefined ||
    removeEventListener === undefined ||
    namespaceUri === undefined ||
    tagName === undefined ||
    localName === undefined ||
    getAttributeNames === undefined ||
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
    childNodes,
    parentNode,
    nodeValue,
    nodeListLength,
    nodeListItem,
    isConnected,
    parentElement,
    hasChildNodes,
    contains,
    appendChild,
    addEventListener,
    removeEventListener,
    namespaceUri,
    tagName,
    localName,
    getAttributeNames,
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

function selectionIntrinsics(selection: Selection): SelectionIntrinsics {
  const prototype = Object.getPrototypeOf(selection) as object | null;
  if (prototype === null) throw new TypeError("DOM Selection is invalid");
  const cached = SELECTION_INTRINSICS.get(prototype);
  if (cached !== undefined) {
    Reflect.apply(cached.rangeCount, selection, []);
    return cached;
  }
  const rangeCount = deepestGetter(prototype, "rangeCount");
  const anchorNode = deepestGetter(prototype, "anchorNode");
  const anchorOffset = deepestGetter(prototype, "anchorOffset");
  const focusNode = deepestGetter(prototype, "focusNode");
  const focusOffset = deepestGetter(prototype, "focusOffset");
  const getRangeAt = deepestMethod(prototype, "getRangeAt");
  const addRange = deepestMethod(prototype, "addRange");
  const removeAllRanges = deepestMethod(prototype, "removeAllRanges");
  if (
    rangeCount === undefined ||
    anchorNode === undefined ||
    anchorOffset === undefined ||
    focusNode === undefined ||
    focusOffset === undefined ||
    getRangeAt === undefined ||
    addRange === undefined ||
    removeAllRanges === undefined
  ) {
    throw new TypeError("DOM Selection is invalid");
  }
  const captured = Object.freeze({
    rangeCount,
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
    getRangeAt,
    addRange,
    removeAllRanges,
    setBaseAndExtent: deepestMethod(prototype, "setBaseAndExtent"),
    collapse: deepestMethod(prototype, "collapse"),
    extend: deepestMethod(prototype, "extend"),
  });
  SELECTION_INTRINSICS.set(prototype, captured);
  // Prove the candidate's brand before caching its prototype as authoritative.
  Reflect.apply(rangeCount, selection, []);
  return captured;
}

function rangeIntrinsics(range: Range): RangeIntrinsics {
  const prototype = Object.getPrototypeOf(range) as object | null;
  if (prototype === null) throw new TypeError("DOM Range is invalid");
  const cached = RANGE_INTRINSICS.get(prototype);
  if (cached !== undefined) {
    Reflect.apply(cached.startContainer, range, []);
    return cached;
  }
  const startContainer = deepestGetter(prototype, "startContainer");
  const startOffset = deepestGetter(prototype, "startOffset");
  const endContainer = deepestGetter(prototype, "endContainer");
  const endOffset = deepestGetter(prototype, "endOffset");
  const setStart = deepestMethod(prototype, "setStart");
  const setEnd = deepestMethod(prototype, "setEnd");
  const intersectsNode = deepestMethod(prototype, "intersectsNode");
  if (
    startContainer === undefined ||
    startOffset === undefined ||
    endContainer === undefined ||
    endOffset === undefined ||
    setStart === undefined ||
    setEnd === undefined ||
    intersectsNode === undefined
  ) {
    throw new TypeError("DOM Range is invalid");
  }
  const captured = Object.freeze({
    startContainer,
    startOffset,
    endContainer,
    endOffset,
    setStart,
    setEnd,
    intersectsNode,
  });
  RANGE_INTRINSICS.set(prototype, captured);
  // Prove the candidate's brand before caching its prototype as authoritative.
  Reflect.apply(startContainer, range, []);
  return captured;
}

function abstractRangeIntrinsics(range: AbstractRange): AbstractRangeIntrinsics {
  const prototype = Object.getPrototypeOf(range) as object | null;
  if (prototype === null) throw new TypeError("DOM AbstractRange is invalid");
  const cached = ABSTRACT_RANGE_INTRINSICS.get(prototype);
  if (cached !== undefined) {
    Reflect.apply(cached.startContainer, range, []);
    return cached;
  }
  const startContainer = deepestGetter(prototype, "startContainer");
  const startOffset = deepestGetter(prototype, "startOffset");
  const endContainer = deepestGetter(prototype, "endContainer");
  const endOffset = deepestGetter(prototype, "endOffset");
  if (
    startContainer === undefined ||
    startOffset === undefined ||
    endContainer === undefined ||
    endOffset === undefined
  ) {
    throw new TypeError("DOM AbstractRange is invalid");
  }
  const captured = Object.freeze({
    startContainer,
    startOffset,
    endContainer,
    endOffset,
  });
  ABSTRACT_RANGE_INTRINSICS.set(prototype, captured);
  // Brand proof runs on cache misses and hits; plain prototype impostors fail.
  Reflect.apply(startContainer, range, []);
  return captured;
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

/**
 * Selects the deepest non-root getter in one instance's prototype chain.
 * Host-local prototype layers can imitate platform names, while the genuine
 * realm prototype remains deeper. Realm-wide prototype mutation is outside
 * the application-owned-host contract.
 */
function deepestGetter(
  prototype: object | undefined,
  name: string,
): NativeGetter | undefined {
  let candidate: object | null | undefined = prototype;
  let found: NativeGetter | undefined;
  while (candidate !== undefined && candidate !== null) {
    const parent = Object.getPrototypeOf(candidate) as object | null;
    if (parent === null) break;
    const value = Object.getOwnPropertyDescriptor(candidate, name)?.get;
    if (typeof value === "function") found = value;
    candidate = parent;
  }
  return found;
}

/** Deepest-method counterpart to {@link deepestGetter}. */
function deepestMethod(
  prototype: object | undefined,
  name: string,
): NativeMethod | undefined {
  let candidate: object | null | undefined = prototype;
  let found: NativeMethod | undefined;
  while (candidate !== undefined && candidate !== null) {
    const parent = Object.getPrototypeOf(candidate) as object | null;
    if (parent === null) break;
    const value = Object.getOwnPropertyDescriptor(candidate, name)?.value;
    if (typeof value === "function") found = value as NativeMethod;
    candidate = parent;
  }
  return found;
}
