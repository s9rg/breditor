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
type NativeSetter = (this: unknown, value: unknown) => void;
type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;

interface DomIntrinsics {
  readonly nodeType: NativeGetter;
  readonly ownerDocument: NativeGetter;
  readonly childNodes: NativeGetter;
  readonly parentNode: NativeGetter;
  readonly nodeValue: NativeGetter;
  readonly getRootNode: NativeMethod;
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

interface HtmlInputElementIntrinsics {
  readonly value: NativeGetter;
  readonly setValue: NativeSetter;
  readonly checked: NativeGetter;
  readonly setChecked: NativeSetter;
  readonly indeterminate: NativeGetter;
  readonly setIndeterminate: NativeSetter;
}

interface DocumentIntrinsics {
  readonly activeElement: NativeGetter;
  readonly defaultView: NativeGetter;
  readonly getElementById: NativeMethod;
  readonly getSelection: NativeMethod;
  readonly createRange: NativeMethod;
  readonly createElement: NativeMethod;
}

interface DocumentFragmentIntrinsics {
  readonly getElementById: NativeMethod;
}

interface ShadowRootIntrinsics {
  readonly activeElement: NativeGetter;
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
let capturedHtmlInputElementIntrinsics:
  | HtmlInputElementIntrinsics
  | undefined;
let capturedDocumentIntrinsics: DocumentIntrinsics | undefined;
let capturedDocumentFragmentIntrinsics:
  | DocumentFragmentIntrinsics
  | undefined;
let capturedShadowRootIntrinsics: ShadowRootIntrinsics | undefined;
let capturedSelectionIntrinsics: SelectionIntrinsics | undefined;
let capturedAbstractRangeIntrinsics: AbstractRangeIntrinsics | undefined;
let capturedRangeIntrinsics: RangeIntrinsics | undefined;

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

/** Returns the node's exact non-composed Document or ShadowRoot. */
export function nativeTreeRoot(node: Node): Document | ShadowRoot {
  const intrinsics = domIntrinsics();
  if (intrinsics === undefined) throw new TypeError("DOM is unavailable");
  const root = Reflect.apply(intrinsics.getRootNode, node, []) as unknown;
  if (typeof root !== "object" || root === null) {
    throw new TypeError("DOM tree root is invalid");
  }
  const type = nativeNodeType(root as Node);
  if (type !== 9 && type !== 11) {
    throw new TypeError("DOM tree root is unsupported");
  }
  const self = Reflect.apply(intrinsics.getRootNode, root, []) as unknown;
  if (self !== root) throw new TypeError("DOM tree root is invalid");
  return root as Document | ShadowRoot;
}

/** Reads the focused element scoped to one exact Document or ShadowRoot. */
export function nativeTreeRootActiveElement(
  root: Document | ShadowRoot,
): Element | null {
  const type = nativeNodeType(root);
  const activeElement =
    type === 9
      ? documentIntrinsics().activeElement
      : type === 11
        ? shadowRootIntrinsics().activeElement
        : undefined;
  if (activeElement === undefined) {
    throw new TypeError("DOM root focus is unavailable");
  }
  const value = Reflect.apply(activeElement, root, []) as unknown;
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    nativeNodeType(value as Node) !== 1 ||
    nativeTreeRoot(value as Node) !== root
  ) {
    throw new TypeError("DOM root focus result is invalid");
  }
  return value as Element;
}

/** Looks up an ID inside one exact Document or ShadowRoot tree. */
export function nativeTreeRootGetElementById(
  root: Document | ShadowRoot,
  id: string,
): Element | null {
  const type = nativeNodeType(root);
  const getElementById =
    type === 9
      ? documentIntrinsics().getElementById
      : type === 11
        ? documentFragmentIntrinsics().getElementById
        : undefined;
  if (getElementById === undefined) {
    throw new TypeError("DOM root lookup is unavailable");
  }
  const value = Reflect.apply(getElementById, root, [id]) as unknown;
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    nativeNodeType(value as Node) !== 1 ||
    nativeTreeRoot(value as Node) !== root
  ) {
    throw new TypeError("DOM root lookup result is invalid");
  }
  return value as Element;
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
  const { activeElement } = documentIntrinsics();
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
  const { defaultView } = documentIntrinsics();
  const view = Reflect.apply(defaultView, ownerDocument, []) as unknown;
  if (view === null) return null;
  if (typeof view !== "object" && typeof view !== "function") {
    throw new TypeError("DOM window is invalid");
  }
  return view as Window & typeof globalThis;
}

/** Looks up an element ID through the document realm's captured native method. */
export function nativeDocumentGetElementById(
  ownerDocument: Document,
  id: string,
): Element | null {
  const { getElementById } = documentIntrinsics();
  const value = Reflect.apply(getElementById, ownerDocument, [id]) as unknown;
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    nativeNodeType(value as Node) !== 1 ||
    nativeOwnerDocument(value as Node) !== ownerDocument
  ) {
    throw new TypeError("DOM lookup result is invalid");
  }
  return value as Element;
}

/** Reads a real input's string value through its realm's native accessor. */
export function nativeInputValue(input: HTMLInputElement): string {
  const value = Reflect.apply(inputElementIntrinsics(input).value, input, []) as unknown;
  if (typeof value !== "string") throw new TypeError("DOM input value is invalid");
  return value;
}

/** Writes a real input's string value through its realm's native accessor. */
export function nativeSetInputValue(
  input: HTMLInputElement,
  value: string,
): void {
  Reflect.apply(inputElementIntrinsics(input).setValue, input, [value]);
}

/** Reads a real input's Boolean checked state through its native accessor. */
export function nativeInputChecked(input: HTMLInputElement): boolean {
  const value = Reflect.apply(
    inputElementIntrinsics(input).checked,
    input,
    [],
  ) as unknown;
  if (typeof value !== "boolean") {
    throw new TypeError("DOM input checked state is invalid");
  }
  return value;
}

/** Writes a real input's checked state through its realm's native accessor. */
export function nativeSetInputChecked(
  input: HTMLInputElement,
  value: boolean,
): void {
  Reflect.apply(inputElementIntrinsics(input).setChecked, input, [value]);
}

/** Reads a real input's non-reflected indeterminate state. */
export function nativeInputIndeterminate(input: HTMLInputElement): boolean {
  const value = Reflect.apply(
    inputElementIntrinsics(input).indeterminate,
    input,
    [],
  ) as unknown;
  if (typeof value !== "boolean") {
    throw new TypeError("DOM input indeterminate state is invalid");
  }
  return value;
}

/** Writes a real input's non-reflected indeterminate state. */
export function nativeSetInputIndeterminate(
  input: HTMLInputElement,
  value: boolean,
): void {
  Reflect.apply(inputElementIntrinsics(input).setIndeterminate, input, [value]);
}

/** Returns the real selection owned by a document's native associated Window. */
export function nativeDocumentSelection(ownerDocument: Document): Selection | null {
  if (nativeDocumentDefaultView(ownerDocument) === null) return null;
  const { getSelection } = documentIntrinsics();
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
  const { createRange } = documentIntrinsics();
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
  const { createElement } = documentIntrinsics();
  const value = Reflect.apply(createElement, ownerDocument, [localName]) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    nativeNodeType(value as Node) !== 1 ||
    nativeOwnerDocument(value as Node) !== ownerDocument ||
    nativeElementLocalName(value as Element) !== localName
  ) {
    throw new TypeError("DOM element creation is invalid");
  }
  return value as HTMLElementTagNameMap[K];
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
  const getRootNode = method(nodePrototype, "getRootNode");
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
    getRootNode === undefined ||
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
    getRootNode,
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

/**
 * Captures Document operations from this module's platform realm.
 *
 * Web IDL brand checks accept genuine same-origin platform objects from other
 * realms. Starting from the trusted platform prototype, instead of an
 * application's mutable instance prototype, prevents a locally detached or
 * inserted prototype from supplying forged document facts or factory methods.
 */
function documentIntrinsics(): DocumentIntrinsics {
  if (capturedDocumentIntrinsics !== undefined) {
    return capturedDocumentIntrinsics;
  }
  const prototype =
    typeof Document === "function" ? Document.prototype : undefined;
  const activeElement = getter(prototype, "activeElement");
  const defaultView = getter(prototype, "defaultView");
  const getElementById = method(prototype, "getElementById");
  const getSelection = method(prototype, "getSelection");
  const createRange = method(prototype, "createRange");
  const createElement = method(prototype, "createElement");
  if (
    activeElement === undefined ||
    defaultView === undefined ||
    getElementById === undefined ||
    getSelection === undefined ||
    createRange === undefined ||
    createElement === undefined
  ) {
    throw new TypeError("DOM Document intrinsics are unavailable");
  }
  capturedDocumentIntrinsics = Object.freeze({
    activeElement,
    defaultView,
    getElementById,
    getSelection,
    createRange,
    createElement,
  });
  return capturedDocumentIntrinsics;
}

function documentFragmentIntrinsics(): DocumentFragmentIntrinsics {
  if (capturedDocumentFragmentIntrinsics !== undefined) {
    return capturedDocumentFragmentIntrinsics;
  }
  const prototype =
    typeof DocumentFragment === "function"
      ? DocumentFragment.prototype
      : undefined;
  const getElementById = method(prototype, "getElementById");
  if (getElementById === undefined) {
    throw new TypeError("DOM DocumentFragment intrinsics are unavailable");
  }
  capturedDocumentFragmentIntrinsics = Object.freeze({ getElementById });
  return capturedDocumentFragmentIntrinsics;
}

function shadowRootIntrinsics(): ShadowRootIntrinsics {
  if (capturedShadowRootIntrinsics !== undefined) {
    return capturedShadowRootIntrinsics;
  }
  const prototype =
    typeof ShadowRoot === "function" ? ShadowRoot.prototype : undefined;
  const activeElement = getter(prototype, "activeElement");
  if (activeElement === undefined) {
    throw new TypeError("DOM ShadowRoot intrinsics are unavailable");
  }
  capturedShadowRootIntrinsics = Object.freeze({ activeElement });
  return capturedShadowRootIntrinsics;
}

function inputElementIntrinsics(
  input: HTMLInputElement,
): HtmlInputElementIntrinsics {
  let intrinsics = capturedHtmlInputElementIntrinsics;
  if (intrinsics === undefined) {
    const prototype =
      typeof HTMLInputElement === "function"
        ? HTMLInputElement.prototype
        : undefined;
    const value = getter(prototype, "value");
    const setValue = setter(prototype, "value");
    const checked = getter(prototype, "checked");
    const setChecked = setter(prototype, "checked");
    const indeterminate = getter(prototype, "indeterminate");
    const setIndeterminate = setter(prototype, "indeterminate");
    if (
      value === undefined ||
      setValue === undefined ||
      checked === undefined ||
      setChecked === undefined ||
      indeterminate === undefined ||
      setIndeterminate === undefined
    ) {
      throw new TypeError("DOM input is invalid");
    }
    intrinsics = Object.freeze({
      value,
      setValue,
      checked,
      setChecked,
      indeterminate,
      setIndeterminate,
    });
    capturedHtmlInputElementIntrinsics = intrinsics;
  }
  // Run the platform brand checks on every use; instance prototypes are never
  // consulted and therefore cannot intercept either reads or writes.
  Reflect.apply(intrinsics.value, input, []);
  Reflect.apply(intrinsics.checked, input, []);
  Reflect.apply(intrinsics.indeterminate, input, []);
  return intrinsics;
}

function selectionIntrinsics(selection: Selection): SelectionIntrinsics {
  let intrinsics = capturedSelectionIntrinsics;
  if (intrinsics === undefined) {
    const prototype =
      typeof Selection === "function" ? Selection.prototype : undefined;
    const rangeCount = getter(prototype, "rangeCount");
    const anchorNode = getter(prototype, "anchorNode");
    const anchorOffset = getter(prototype, "anchorOffset");
    const focusNode = getter(prototype, "focusNode");
    const focusOffset = getter(prototype, "focusOffset");
    const getRangeAt = method(prototype, "getRangeAt");
    const addRange = method(prototype, "addRange");
    const removeAllRanges = method(prototype, "removeAllRanges");
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
    intrinsics = Object.freeze({
      rangeCount,
      anchorNode,
      anchorOffset,
      focusNode,
      focusOffset,
      getRangeAt,
      addRange,
      removeAllRanges,
      setBaseAndExtent: method(prototype, "setBaseAndExtent"),
      collapse: method(prototype, "collapse"),
      extend: method(prototype, "extend"),
    });
    capturedSelectionIntrinsics = intrinsics;
  }
  Reflect.apply(intrinsics.rangeCount, selection, []);
  return intrinsics;
}

function rangeIntrinsics(range: Range): RangeIntrinsics {
  let intrinsics = capturedRangeIntrinsics;
  if (intrinsics === undefined) {
    const prototype = typeof Range === "function" ? Range.prototype : undefined;
    const startContainer = getter(prototype, "startContainer");
    const startOffset = getter(prototype, "startOffset");
    const endContainer = getter(prototype, "endContainer");
    const endOffset = getter(prototype, "endOffset");
    const setStart = method(prototype, "setStart");
    const setEnd = method(prototype, "setEnd");
    const intersectsNode = method(prototype, "intersectsNode");
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
    intrinsics = Object.freeze({
      startContainer,
      startOffset,
      endContainer,
      endOffset,
      setStart,
      setEnd,
      intersectsNode,
    });
    capturedRangeIntrinsics = intrinsics;
  }
  Reflect.apply(intrinsics.startContainer, range, []);
  return intrinsics;
}

function abstractRangeIntrinsics(range: AbstractRange): AbstractRangeIntrinsics {
  let intrinsics = capturedAbstractRangeIntrinsics;
  if (intrinsics === undefined) {
    const prototype = typeof Range === "function" ? Range.prototype : undefined;
    const startContainer = getter(prototype, "startContainer");
    const startOffset = getter(prototype, "startOffset");
    const endContainer = getter(prototype, "endContainer");
    const endOffset = getter(prototype, "endOffset");
    if (
      startContainer === undefined ||
      startOffset === undefined ||
      endContainer === undefined ||
      endOffset === undefined
    ) {
      throw new TypeError("DOM AbstractRange is invalid");
    }
    intrinsics = Object.freeze({
      startContainer,
      startOffset,
      endContainer,
      endOffset,
    });
    capturedAbstractRangeIntrinsics = intrinsics;
  }
  Reflect.apply(intrinsics.startContainer, range, []);
  return intrinsics;
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

function setter(
  prototype: object | undefined,
  name: string,
): NativeSetter | undefined {
  let candidate: object | null | undefined = prototype;
  while (candidate !== undefined && candidate !== null) {
    const found = Object.getOwnPropertyDescriptor(candidate, name)?.set;
    if (typeof found === "function") return found as NativeSetter;
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
