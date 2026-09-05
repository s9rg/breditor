import {
  type AstPath,
  astPathKey,
  paragraphAstPath,
  rootAstPath,
  textRunAstPath,
} from "./ast_path.js";
import {
  type BaseDocumentProjection,
  type BaseParagraphProjection,
  isOwnedProjection,
} from "./projection.js";
import {
  type BaseProjectionUpdate,
  type FullProjectionReason,
  isOwnedProjectionUpdate,
  verifiedUpdatePlan,
} from "./projection_update.js";
import type { BrowserProjectionResult } from "./result.js";
import { projectionFailure, projectionSuccess } from "./result.js";

/** How a successful renderer call installed its result. */
export type ProjectionRenderMode = "full" | "incremental";

/** Why a successful update could not reuse its prior paragraph DOM. */
export type ProjectionFallbackReason = FullProjectionReason | "domDrift";

/**
 * Snapshot- and generation-bound DOM/AST mapping returned by the renderer.
 *
 * Mapping calls return `null` after this handle is superseded, released, or
 * invalidated by observed DOM drift.
 */
export interface RenderedProjection {
  /** Exact semantic projection represented by this generation. */
  readonly projection: BaseDocumentProjection;
  /** Monotonic generation within the owning renderer. */
  readonly rendererGeneration: bigint;
  /** Exact light-DOM host represented by this handle. */
  readonly host: HTMLElement;
  /** Whether this handle still owns an unchanged projection of its host. */
  readonly current: boolean;
  /**
   * Synchronously proves that the complete canonical DOM and private maps agree.
   *
   * Failure invalidates this handle. Selection mapping calls this immediately
   * before every read or write rather than waiting for `MutationObserver`.
   */
  validateCanonicalDom(): boolean;
  /** Returns the canonical DOM node for an AST path, or `null` when unavailable. */
  nodeForAstPath(path: AstPath): Node | null;
  /** Returns the snapshot-local AST path associated with an exact DOM node. */
  astPathForDomNode(node: Node): AstPath | null;
}

/** Metadata returned with a successfully installed projection generation. */
export interface ProjectionRenderOutcome {
  /** New current projection handle. */
  readonly rendered: RenderedProjection;
  /** Whether paragraph DOM identities were reused. */
  readonly mode: ProjectionRenderMode;
  /** Present only when a safe full-render fallback was selected. */
  readonly fallbackReason?: ProjectionFallbackReason;
}

interface ProjectionMaps {
  readonly astToDom: Map<string, Node>;
  readonly domToAst: WeakMap<Node, AstPath>;
}

interface PreparedDom extends ProjectionMaps {
  readonly paragraphs: readonly HTMLParagraphElement[];
  readonly refreshes: readonly ParagraphRefresh[];
}

interface ParagraphRefresh {
  readonly paragraph: HTMLParagraphElement;
  readonly children: readonly Node[];
}

interface HostOwnership {
  readonly rendererToken: symbol;
  readonly handle: RenderedProjectionHandle;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const RENDERED_HANDLES = new WeakSet<RenderedProjectionHandle>();
const HOST_OWNERS = new WeakMap<HTMLElement, HostOwnership>();

class RenderedProjectionHandle implements RenderedProjection {
  readonly projection: BaseDocumentProjection;
  readonly rendererGeneration: bigint;
  readonly host: HTMLElement;
  readonly #astToDom: Map<string, Node>;
  readonly #domToAst: WeakMap<Node, AstPath>;
  #active = true;
  #observer: MutationObserver | undefined;

  constructor(
    host: HTMLElement,
    projection: BaseDocumentProjection,
    rendererGeneration: bigint,
    maps: ProjectionMaps,
  ) {
    this.host = host;
    this.projection = projection;
    this.rendererGeneration = rendererGeneration;
    this.#astToDom = maps.astToDom;
    this.#domToAst = maps.domToAst;
    RENDERED_HANDLES.add(this);
    Object.freeze(this);
  }

  get current(): boolean {
    return this.#active;
  }

  validateCanonicalDom(): boolean {
    if (!this.#active) {
      return false;
    }
    try {
      const ownership = HOST_OWNERS.get(this.host);
      if (ownership?.handle !== this || !this.canonicalDomAndMapsMatch()) {
        if (ownership?.handle === this) {
          HOST_OWNERS.delete(this.host);
        }
        this.invalidate();
        return false;
      }
      return true;
    } catch {
      const ownership = HOST_OWNERS.get(this.host);
      if (ownership?.handle === this) {
        HOST_OWNERS.delete(this.host);
      }
      this.invalidate();
      return false;
    }
  }

  nodeForAstPath(path: AstPath): Node | null {
    if (!this.#active) {
      return null;
    }
    try {
      const key = astPathKey(path);
      return key === null ? null : (this.#astToDom.get(key) ?? null);
    } catch {
      return null;
    }
  }

  astPathForDomNode(node: Node): AstPath | null {
    if (!this.#active || typeof node !== "object" || node === null) {
      return null;
    }
    try {
      return this.#domToAst.get(node) ?? null;
    } catch {
      return null;
    }
  }

  rawNodeForParagraph(paragraphIndex: number): Node | undefined {
    return this.#astToDom.get(`root/${paragraphIndex}`);
  }

  private canonicalDomAndMapsMatch(): boolean {
    if (
      this.#astToDom.size !==
        1 +
          this.projection.paragraphs.length +
          this.projection.paragraphs.reduce((count, paragraph) => count + paragraph.runs.length, 0) ||
      this.#astToDom.get("root") !== this.host ||
      astPathKey(this.#domToAst.get(this.host) ?? Object.freeze([-1])) !== "root" ||
      this.host.childNodes.length !== this.projection.paragraphs.length
    ) {
      return false;
    }
    for (
      let paragraphIndex = 0;
      paragraphIndex < this.projection.paragraphs.length;
      paragraphIndex += 1
    ) {
      const projection = this.projection.paragraphs[paragraphIndex];
      const paragraph = this.host.childNodes[paragraphIndex];
      const paragraphKey = `root/${paragraphIndex}`;
      if (
        projection === undefined ||
        !isHtmlParagraph(paragraph) ||
        !paragraphDomMatches(paragraph, projection) ||
        this.#astToDom.get(paragraphKey) !== paragraph ||
        astPathKey(this.#domToAst.get(paragraph) ?? Object.freeze([-1])) !== paragraphKey
      ) {
        return false;
      }
      if (projection.runs.length === 0) {
        const placeholder = paragraph.childNodes[0];
        if (placeholder === undefined || this.#domToAst.get(placeholder) !== undefined) {
          return false;
        }
        continue;
      }
      for (let runIndex = 0; runIndex < projection.runs.length; runIndex += 1) {
        const run = projection.runs[runIndex];
        const child = paragraph.childNodes[runIndex];
        if (run === undefined || child === undefined) {
          return false;
        }
        const text = run.strong ? child.childNodes[0] : child;
        const textKey = `root/${paragraphIndex}/${runIndex}`;
        if (
          text === undefined ||
          this.#astToDom.get(textKey) !== text ||
          astPathKey(this.#domToAst.get(text) ?? Object.freeze([-1])) !== textKey ||
          (run.strong && this.#domToAst.get(child) !== undefined)
        ) {
          return false;
        }
      }
    }
    return true;
  }

  observe(rendererToken: symbol): void {
    let observer: MutationObserver | undefined;
    try {
      const Observer = this.host.ownerDocument.defaultView?.MutationObserver;
      if (Observer === undefined) {
        return;
      }
      observer = new Observer((records) => {
        const projectionChanged = records.some(
          (record) => record.type !== "attributes" || record.target !== this.host,
        );
        if (!projectionChanged) {
          return;
        }
        const ownership = HOST_OWNERS.get(this.host);
        if (ownership?.rendererToken === rendererToken && ownership.handle === this) {
          HOST_OWNERS.delete(this.host);
        }
        this.invalidate();
      });
      this.#observer = observer;
      observer.observe(this.host, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    } catch {
      try {
        observer?.disconnect();
      } catch {
        // Observation is an invalidation aid; update paths recheck DOM shape.
      }
      this.#observer = undefined;
    }
  }

  invalidate(): void {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    try {
      this.#observer?.disconnect();
    } catch {
      // The handle is invalid regardless of a hostile observer implementation.
    }
    this.#observer = undefined;
    this.#astToDom.clear();
  }
}

// A branded handle's methods participate in selection authority. Prevent
// application code from replacing their prototype implementations after a
// handle has entered the private ownership registries.
Object.freeze(RenderedProjectionHandle.prototype);

/** Deterministic renderer for the Breditor base-schema semantic projection. */
export class BreditorDomRenderer {
  readonly #rendererToken = Symbol("BreditorDomRenderer instance");
  #generation = 0n;

  /** Proves that this renderer owns one exact current canonical handle. */
  owns(rendered: unknown): rendered is RenderedProjection {
    if (!isOwnedRenderedProjection(rendered)) {
      return false;
    }
    try {
      const ownership = HOST_OWNERS.get(rendered.host);
      return (
        rendered.current &&
        ownership?.rendererToken === this.#rendererToken &&
        ownership.handle === rendered &&
        rendered.validateCanonicalDom()
      );
    } catch {
      return false;
    }
  }

  /**
   * Replaces a host's children with a complete safe DOM projection.
   *
   * The renderer creates only paragraphs, property-free `strong` wrappers,
   * empty-paragraph `br` placeholders, and text nodes. It never interprets
   * HTML or adds AST paths as DOM attributes.
   */
  render(
    host: HTMLElement,
    projection: BaseDocumentProjection,
  ): BrowserProjectionResult<ProjectionRenderOutcome> {
    if (!isUsableHost(host)) {
      return projectionFailure("renderer.invalid_host");
    }
    if (!isOwnedProjection(projection)) {
      return projectionFailure("projection.invalid_shape");
    }
    let prepared: PreparedDom;
    try {
      prepared = buildFullProjection(host, projection);
    } catch {
      return projectionFailure("renderer.dom_write_failed");
    }
    return this.install(host, projection, prepared, "full");
  }

  /**
   * Installs one exact base/result update against the current render handle.
   *
   * Stale/foreign handles and mismatched bases fail before DOM mutation.
   * Verified unaffected paragraphs retain identity. Broad impacts or detected
   * DOM drift are rebuilt through the same full safe projection path.
   */
  update(
    rendered: RenderedProjection,
    update: BaseProjectionUpdate,
  ): BrowserProjectionResult<ProjectionRenderOutcome> {
    if (!isOwnedProjectionUpdate(update)) {
      return projectionFailure("projection.invalid_update");
    }
    if (!isOwnedRenderedProjection(rendered)) {
      return projectionFailure("renderer.foreign_or_stale_render");
    }
    const ownership = HOST_OWNERS.get(rendered.host);
    if (
      !rendered.current ||
      ownership?.rendererToken !== this.#rendererToken ||
      ownership.handle !== rendered ||
      update.base !== rendered.projection
    ) {
      return projectionFailure("renderer.foreign_or_stale_render");
    }
    const plan = verifiedUpdatePlan(update);
    if (plan === undefined) {
      return projectionFailure("projection.invalid_update");
    }

    if (plan.kind === "full") {
      let prepared: PreparedDom;
      try {
        prepared = buildFullProjection(rendered.host, update.result);
      } catch {
        return projectionFailure("renderer.dom_write_failed");
      }
      return this.install(
        rendered.host,
        update.result,
        prepared,
        "full",
        plan.reason,
      );
    }

    let prepared: PreparedDom | null;
    try {
      prepared = buildIncrementalProjection(rendered, update.result, plan.paragraphs);
    } catch {
      prepared = null;
    }
    if (prepared === null) {
      let fallback: PreparedDom;
      try {
        fallback = buildFullProjection(rendered.host, update.result);
      } catch {
        return projectionFailure("renderer.dom_write_failed");
      }
      return this.install(rendered.host, update.result, fallback, "full", "domDrift");
    }
    return this.install(rendered.host, update.result, prepared, "incremental");
  }

  /** Invalidates a current handle without changing its host DOM. */
  release(rendered: RenderedProjection): boolean {
    if (!isOwnedRenderedProjection(rendered)) {
      return false;
    }
    const ownership = HOST_OWNERS.get(rendered.host);
    if (
      ownership?.rendererToken !== this.#rendererToken ||
      ownership.handle !== rendered ||
      !rendered.current
    ) {
      return false;
    }
    HOST_OWNERS.delete(rendered.host);
    rendered.invalidate();
    return true;
  }

  private install(
    host: HTMLElement,
    projection: BaseDocumentProjection,
    prepared: PreparedDom,
    mode: ProjectionRenderMode,
    fallbackReason?: ProjectionFallbackReason,
  ): BrowserProjectionResult<ProjectionRenderOutcome> {
    const prior = HOST_OWNERS.get(host)?.handle;
    const priorChildren = prepared.refreshes.map((refresh) => ({
      paragraph: refresh.paragraph,
      children: Array.from(refresh.paragraph.childNodes),
    }));
    let appliedRefreshes = 0;
    try {
      for (const refresh of prepared.refreshes) {
        refresh.paragraph.replaceChildren(...refresh.children);
        appliedRefreshes += 1;
      }
      if (!sameChildren(host, prepared.paragraphs)) {
        host.replaceChildren(...prepared.paragraphs);
      }
    } catch {
      for (let index = appliedRefreshes - 1; index >= 0; index -= 1) {
        const priorRefresh = priorChildren[index];
        try {
          priorRefresh?.paragraph.replaceChildren(...(priorRefresh.children ?? []));
        } catch {
          // The handle is invalidated below because DOM state is now uncertain.
        }
      }
      prior?.invalidate();
      HOST_OWNERS.delete(host);
      return projectionFailure("renderer.dom_write_failed");
    }

    prior?.invalidate();
    this.#generation += 1n;
    const handle = new RenderedProjectionHandle(
      host,
      projection,
      this.#generation,
      prepared,
    );
    HOST_OWNERS.set(host, { rendererToken: this.#rendererToken, handle });
    handle.observe(this.#rendererToken);
    const outcome: ProjectionRenderOutcome =
      fallbackReason === undefined
        ? Object.freeze({ rendered: handle, mode })
        : Object.freeze({ rendered: handle, mode, fallbackReason });
    return projectionSuccess(outcome);
  }
}

/** @internal */
export function isOwnedRenderedProjection(
  rendered: unknown,
): rendered is RenderedProjectionHandle {
  return (
    typeof rendered === "object" &&
    rendered !== null &&
    RENDERED_HANDLES.has(rendered as RenderedProjectionHandle)
  );
}

function isUsableHost(host: HTMLElement): boolean {
  try {
    return (
      typeof host === "object" &&
      host !== null &&
      host.nodeType === 1 &&
      host.namespaceURI === HTML_NAMESPACE &&
      host.ownerDocument !== null &&
      typeof host.ownerDocument.createElement === "function" &&
      typeof host.ownerDocument.createElementNS === "function" &&
      typeof host.replaceChildren === "function"
    );
  } catch {
    return false;
  }
}

function buildFullProjection(
  host: HTMLElement,
  projection: BaseDocumentProjection,
): PreparedDom {
  const maps = createMaps(host);
  const paragraphs = projection.paragraphs.map((paragraph, paragraphIndex) =>
    buildParagraph(host.ownerDocument, paragraph, paragraphIndex, maps),
  );
  return {
    ...maps,
    paragraphs: Object.freeze(paragraphs),
    refreshes: Object.freeze([]),
  };
}

function buildIncrementalProjection(
  rendered: RenderedProjectionHandle,
  result: BaseDocumentProjection,
  reuse: readonly Readonly<{
    oldIndex: number;
    newIndex: number;
    content: "preserve" | "refresh";
  }>[],
): PreparedDom | null {
  const reusable = new Map<
    number,
    { readonly node: HTMLParagraphElement; readonly content: "preserve" | "refresh" }
  >();
  for (const pair of reuse) {
    const node = rendered.rawNodeForParagraph(pair.oldIndex);
    const oldParagraph = rendered.projection.paragraphs[pair.oldIndex];
    if (
      !isHtmlParagraph(node) ||
      oldParagraph === undefined ||
      !paragraphDomMatches(node, oldParagraph) ||
      reusable.has(pair.newIndex)
    ) {
      return null;
    }
    reusable.set(pair.newIndex, { node, content: pair.content });
  }

  const maps = createMaps(rendered.host);
  const paragraphs: HTMLParagraphElement[] = [];
  const refreshes: ParagraphRefresh[] = [];
  for (let newIndex = 0; newIndex < result.paragraphs.length; newIndex += 1) {
    const paragraph = result.paragraphs[newIndex];
    if (paragraph === undefined) {
      return null;
    }
    const retained = reusable.get(newIndex);
    if (retained === undefined) {
      paragraphs.push(buildParagraph(rendered.host.ownerDocument, paragraph, newIndex, maps));
    } else {
      if (retained.content === "preserve") {
        if (!mapExistingParagraph(retained.node, paragraph, newIndex, maps)) {
          return null;
        }
      } else {
        const paragraphPath = paragraphAstPath(newIndex);
        mapNode(retained.node, paragraphPath, maps.astToDom, maps.domToAst, true);
        const children = buildParagraphChildren(
          rendered.host.ownerDocument,
          paragraph,
          newIndex,
          maps,
        );
        refreshes.push(Object.freeze({ paragraph: retained.node, children }));
      }
      paragraphs.push(retained.node);
    }
  }
  return {
    ...maps,
    paragraphs: Object.freeze(paragraphs),
    refreshes: Object.freeze(refreshes),
  };
}

function createMaps(host: HTMLElement): ProjectionMaps {
  const astToDom = new Map<string, Node>();
  const domToAst = new WeakMap<Node, AstPath>();
  mapNode(host, rootAstPath(), astToDom, domToAst, true);
  return { astToDom, domToAst };
}

function buildParagraph(
  document: Document,
  paragraph: BaseParagraphProjection,
  paragraphIndex: number,
  maps: ProjectionMaps,
): HTMLParagraphElement {
  const element = createHtmlElement(document, "p", "P");
  const paragraphPath = paragraphAstPath(paragraphIndex);
  mapNode(element, paragraphPath, maps.astToDom, maps.domToAst, true);
  element.append(...buildParagraphChildren(document, paragraph, paragraphIndex, maps));
  return element;
}

function buildParagraphChildren(
  document: Document,
  paragraph: BaseParagraphProjection,
  paragraphIndex: number,
  maps: ProjectionMaps,
): readonly Node[] {
  if (paragraph.runs.length === 0) {
    const placeholder = createHtmlElement(document, "br", "BR");
    return Object.freeze([placeholder]);
  }
  const children = paragraph.runs.map((run, runIndex): Node => {
    const path = textRunAstPath(paragraphIndex, runIndex);
    const text = document.createTextNode(run.text);
    mapNode(text, path, maps.astToDom, maps.domToAst, true);
    if (run.strong) {
      const strong = createHtmlElement(document, "strong", "STRONG");
      strong.append(text);
      return strong;
    }
    return text;
  });
  return Object.freeze(children);
}

function paragraphDomMatches(
  paragraphNode: HTMLParagraphElement,
  paragraph: BaseParagraphProjection,
): boolean {
  if (!isHtmlParagraph(paragraphNode) || paragraphNode.attributes.length !== 0) {
    return false;
  }
  if (paragraph.runs.length === 0) {
    const child = paragraphNode.childNodes[0];
    return (
      paragraphNode.childNodes.length === 1 &&
      isHtmlElementNamed(child, "BR") &&
      child.attributes.length === 0 &&
      child.childNodes.length === 0
    );
  }
  if (paragraphNode.childNodes.length !== paragraph.runs.length) {
    return false;
  }
  return paragraph.runs.every((run, runIndex) => {
    const child = paragraphNode.childNodes[runIndex];
    if (run.strong) {
      if (
        !isHtmlElementNamed(child, "STRONG") ||
        child.attributes.length !== 0 ||
        child.childNodes.length !== 1
      ) {
        return false;
      }
      const text = child.childNodes[0];
      return text?.nodeType === 3 && text.nodeValue === run.text;
    }
    return child?.nodeType === 3 && child.nodeValue === run.text;
  });
}

function mapExistingParagraph(
  paragraphNode: HTMLParagraphElement,
  paragraph: BaseParagraphProjection,
  paragraphIndex: number,
  maps: ProjectionMaps,
): boolean {
  if (!paragraphDomMatches(paragraphNode, paragraph)) {
    return false;
  }
  const paragraphPath = paragraphAstPath(paragraphIndex);
  mapNode(paragraphNode, paragraphPath, maps.astToDom, maps.domToAst, true);
  if (paragraph.runs.length === 0) {
    return true;
  }
  paragraph.runs.forEach((run, runIndex) => {
    const path = textRunAstPath(paragraphIndex, runIndex);
    const child = paragraphNode.childNodes[runIndex];
    if (child === undefined) {
      return;
    }
    if (run.strong) {
      const text = child.childNodes[0];
      if (text !== undefined) {
        mapNode(text, path, maps.astToDom, maps.domToAst, true);
      }
    } else {
      mapNode(child, path, maps.astToDom, maps.domToAst, true);
    }
  });
  return true;
}

function mapNode(
  node: Node,
  path: AstPath,
  astToDom: Map<string, Node>,
  domToAst: WeakMap<Node, AstPath>,
  canonical: boolean,
): void {
  const key = astPathKey(path);
  if (key === null) {
    throw new TypeError("Renderer constructed an invalid AST path.");
  }
  if (canonical) {
    astToDom.set(key, node);
  }
  domToAst.set(node, path);
}

function isHtmlParagraph(node: Node | undefined): node is HTMLParagraphElement {
  return isHtmlElementNamed(node, "P");
}

function isHtmlElementNamed(node: Node | undefined, tagName: string): node is HTMLElement {
  return (
    node !== undefined &&
    node.nodeType === 1 &&
    (node as Element).namespaceURI === HTML_NAMESPACE &&
    (node as Element).localName === tagName.toLowerCase()
  );
}

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  localName: K,
  expectedTagName: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElementNS(HTML_NAMESPACE, localName);
  if (!isHtmlElementNamed(element, expectedTagName)) {
    throw new TypeError("The host document did not create the requested HTML element.");
  }
  return element as HTMLElementTagNameMap[K];
}

function sameChildren(host: HTMLElement, paragraphs: readonly HTMLParagraphElement[]): boolean {
  if (host.childNodes.length !== paragraphs.length) {
    return false;
  }
  return paragraphs.every((paragraph, index) => host.childNodes[index] === paragraph);
}
