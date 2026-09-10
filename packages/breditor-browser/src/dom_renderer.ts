import {
  type AstPath,
  astPathKey,
  paragraphAstPath,
  rootAstPath,
  textRunAstPath,
} from "./ast_path.js";
import {
  bindProjectionPresentation,
  type BaseDocumentProjection,
  type BaseParagraphProjection,
  type BaseTextRunProjection,
  isOwnedProjection,
  projectionPresentation,
} from "./projection.js";
import {
  browserPresentationRecipesForFormatDetails,
  isOwnedBrowserCompiledPresentation,
  type BrowserCompiledPresentation,
  type BrowserResolvedInlineFormatRenderRecipe,
} from "./compiled_browser_presentation.js";
import type { InlineFormatRenderRecipe } from "./inline_format_render_manifest.js";
import {
  nativeAttributeNames,
  nativeChildNodes,
  nativeDocumentDefaultView,
  nativeElementLocalName,
  nativeGetAttribute,
  nativeHtmlHostFacts,
  nativeNodeType,
  nativeNodeValue,
  nativeOwnerDocument,
  nativeParentElement,
  nativeParentNode,
  nativeRemoveElement,
  nativeReplaceChildren,
  nativeSetAttribute,
} from "./html_host.js";
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

/** Maximum host, paragraph, text, placeholder, and wrapper nodes in one render. */
export const MAX_RENDERED_PROJECTION_DOM_NODES = 262_144;

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

/**
 * Opaque proof that one renderer intentionally yielded its canonical DOM to
 * the browser for an active native composition.
 *
 * @internal
 */
export interface DomCompositionLease {
  readonly __domCompositionLeaseBrand: never;
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

interface DomCompositionLeaseRecord {
  readonly rendererToken: symbol;
  readonly handle: RenderedProjectionHandle;
  active: boolean;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const RENDERED_HANDLES = new WeakSet<RenderedProjectionHandle>();
const HOST_OWNERS = new WeakMap<HTMLElement, HostOwnership>();
const DOM_COMPOSITION_LEASES = new WeakMap<object, DomCompositionLeaseRecord>();
const ACTIVE_HOST_OPERATIONS = new WeakSet<HTMLElement>();

type RenderedProjectionState = "canonical" | "composition" | "inactive";

class RenderedProjectionHandle implements RenderedProjection {
  readonly projection: BaseDocumentProjection;
  readonly rendererGeneration: bigint;
  readonly host: HTMLElement;
  readonly #astToDom: Map<string, Node>;
  readonly #domToAst: WeakMap<Node, AstPath>;
  readonly #presentation: BrowserCompiledPresentation | undefined;
  #state: RenderedProjectionState = "canonical";
  #observer: MutationObserver | undefined;

  constructor(
    host: HTMLElement,
    projection: BaseDocumentProjection,
    rendererGeneration: bigint,
    maps: ProjectionMaps,
    presentation: BrowserCompiledPresentation | undefined,
  ) {
    this.host = host;
    this.projection = projection;
    this.rendererGeneration = rendererGeneration;
    this.#astToDom = maps.astToDom;
    this.#domToAst = maps.domToAst;
    this.#presentation = presentation;
    RENDERED_HANDLES.add(this);
    Object.freeze(this);
  }

  get current(): boolean {
    return this.#state === "canonical";
  }

  get active(): boolean {
    return this.#state !== "inactive";
  }

  get compositionLeased(): boolean {
    return this.#state === "composition";
  }

  validateCanonicalDom(): boolean {
    if (this.#state !== "canonical") {
      return false;
    }
    try {
      const ownership = HOST_OWNERS.get(this.host);
      if (ownership?.handle !== this || !this.#canonicalDomAndMapsMatch()) {
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
    if (this.#state !== "canonical") {
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
    if (this.#state !== "canonical" || typeof node !== "object" || node === null) {
      return null;
    }
    try {
      return this.#domToAst.get(node) ?? null;
    } catch {
      return null;
    }
  }

  rawNodeForParagraph(paragraphIndex: number): Node | undefined {
    if (this.#state !== "canonical") {
      return undefined;
    }
    return this.#astToDom.get(`root/${paragraphIndex}`);
  }

  canonicalDomMatches(): boolean {
    if (this.#state !== "canonical") return false;
    try {
      return this.#canonicalDomAndMapsMatch();
    } catch {
      return false;
    }
  }

  beginCompositionLease(): boolean {
    if (this.#state !== "canonical") {
      return false;
    }
    try {
      this.#observer?.takeRecords();
      this.#observer?.disconnect();
      this.#observer = undefined;
      if (!this.#canonicalDomAndMapsMatch()) {
        this.invalidate();
        return false;
      }
      this.#state = "composition";
      return true;
    } catch {
      this.invalidate();
      return false;
    }
  }

  #canonicalDomAndMapsMatch(): boolean {
    const hostChildren = nativeChildNodes(this.host);
    if (
      this.#astToDom.size !==
        1 +
          this.projection.paragraphs.length +
          this.projection.paragraphs.reduce((count, paragraph) => count + paragraph.runs.length, 0) ||
      this.#astToDom.get("root") !== this.host ||
      astPathKey(this.#domToAst.get(this.host) ?? Object.freeze([-1])) !== "root" ||
      hostChildren.length !== this.projection.paragraphs.length
    ) {
      return false;
    }
    for (
      let paragraphIndex = 0;
      paragraphIndex < this.projection.paragraphs.length;
      paragraphIndex += 1
    ) {
      const projection = this.projection.paragraphs[paragraphIndex];
      const paragraph = hostChildren[paragraphIndex];
      const paragraphKey = `root/${paragraphIndex}`;
      if (
        projection === undefined ||
        !isHtmlParagraph(paragraph) ||
        !paragraphDomMatches(paragraph, projection, this.#presentation) ||
        this.#astToDom.get(paragraphKey) !== paragraph ||
        astPathKey(this.#domToAst.get(paragraph) ?? Object.freeze([-1])) !== paragraphKey
      ) {
        return false;
      }
      const paragraphChildren = nativeChildNodes(paragraph);
      if (projection.runs.length === 0) {
        const placeholder = paragraphChildren[0];
        if (placeholder === undefined || this.#domToAst.get(placeholder) !== undefined) {
          return false;
        }
        continue;
      }
      for (let runIndex = 0; runIndex < projection.runs.length; runIndex += 1) {
        const run = projection.runs[runIndex];
        const child = paragraphChildren[runIndex];
        if (run === undefined || child === undefined) {
          return false;
        }
        const text = textNodeForRunDom(child, run, this.#presentation);
        const textKey = `root/${paragraphIndex}/${runIndex}`;
        if (
          text === undefined ||
          this.#astToDom.get(textKey) !== text ||
          astPathKey(this.#domToAst.get(text) ?? Object.freeze([-1])) !== textKey ||
          !wrappersAreUnmapped(child, text, this.#domToAst)
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
      const ownerDocument = nativeOwnerDocument(this.host);
      const defaultView = ownerDocument === null
        ? null
        : nativeDocumentDefaultView(ownerDocument);
      const Observer = defaultView?.MutationObserver;
      if (Observer === undefined) {
        return;
      }
      observer = new Observer((records) => {
        if (this.#state !== "canonical") {
          return;
        }
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
    if (this.#state === "inactive") {
      return;
    }
    this.#state = "inactive";
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
  readonly #presentation: BrowserCompiledPresentation | undefined;
  #generation = 0n;

  /**
   * Creates a renderer for either legacy base projections or one exact checked
   * compiled-profile presentation. A renderer never switches presentation.
   */
  constructor(presentation?: BrowserCompiledPresentation) {
    if (
      presentation !== undefined &&
      !isOwnedBrowserCompiledPresentation(presentation)
    ) {
      throw new TypeError("browser renderer presentation is invalid");
    }
    this.#presentation = presentation;
  }

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
   * Suspends canonical-DOM observation for one exact native composition.
   *
   * The returned capability is opaque, renderer-local, and single-use. While
   * it is live the public render handle is deliberately non-current and its
   * AST/DOM mapping cannot be read.
   *
   * @internal
   */
  beginCompositionDomLease(rendered: RenderedProjection): DomCompositionLease | null {
    if (
      !isOwnedRenderedProjection(rendered) ||
      ACTIVE_HOST_OPERATIONS.has(rendered.host) ||
      !this.owns(rendered)
    ) {
      return null;
    }
    const ownership = HOST_OWNERS.get(rendered.host);
    if (
      ownership?.rendererToken !== this.#rendererToken ||
      ownership.handle !== rendered ||
      !rendered.beginCompositionLease()
    ) {
      if (!rendered.active && HOST_OWNERS.get(rendered.host)?.handle === rendered) {
        HOST_OWNERS.delete(rendered.host);
      }
      return null;
    }
    const lease = Object.freeze({}) as DomCompositionLease;
    DOM_COMPOSITION_LEASES.set(lease, {
      rendererToken: this.#rendererToken,
      handle: rendered,
      active: true,
    });
    return lease;
  }

  /** Proves exact, uninterrupted ownership of a live composition lease. @internal */
  ownsCompositionDomLease(
    lease: unknown,
    rendered: RenderedProjection,
  ): lease is DomCompositionLease {
    if (
      typeof lease !== "object" ||
      lease === null ||
      !isOwnedRenderedProjection(rendered)
    ) {
      return false;
    }
    try {
      const record = DOM_COMPOSITION_LEASES.get(lease);
      const ownership = HOST_OWNERS.get(rendered.host);
      return (
        record?.active === true &&
        record.rendererToken === this.#rendererToken &&
        record.handle === rendered &&
        rendered.compositionLeased &&
        ownership?.rendererToken === this.#rendererToken &&
        ownership.handle === rendered
      );
    } catch {
      return false;
    }
  }

  /**
   * Consumes a composition lease and replaces provisional native DOM with a
   * complete canonical projection generation.
   *
   * @internal
   */
  restoreCompositionDomLease(
    lease: DomCompositionLease,
    projection: BaseDocumentProjection,
  ): BrowserProjectionResult<ProjectionRenderOutcome> {
    const record = this.#liveCompositionLeaseRecord(lease);
    if (record === null) {
      return projectionFailure("renderer.foreign_or_stale_render");
    }
    const host = record.handle.host;
    if (!beginHostOperation(host)) {
      return projectionFailure("renderer.dom_write_failed");
    }
    try {
      const installGuard = this.#snapshotInstallGuard(host);
      if (installGuard === null) {
        return projectionFailure("renderer.dom_write_failed");
      }
      if (!isOwnedProjection(projection)) {
        return projectionFailure("projection.invalid_shape");
      }
      if (!this.#bindProjectionPresentation(projection)) {
        return projectionFailure("projection.invalid_shape");
      }
      if (!renderFitsDomBudget(projection)) {
        return projectionFailure("projection.resource_limit");
      }

      // Build the replacement tree while the lease is still recoverable. This
      // work is detached from the host, so constructor failures must not strand
      // the yielded handle in an unowned composition state.
      let prepared: PreparedDom;
      try {
        prepared = buildFullProjection(host, projection, this.#presentation);
      } catch {
        if (!installGuard()) {
          this.#invalidateCompositionLeaseRecord(record);
        }
        return projectionFailure("renderer.dom_write_failed");
      }

      // Detached DOM constructors are application-replaceable and may reenter.
      // Re-prove the exact lease and the pre-build host sequence immediately
      // before spending it.
      if (
        this.#liveCompositionLeaseRecord(lease) !== record ||
        !installGuard()
      ) {
        this.#invalidateCompositionLeaseRecord(record);
        return projectionFailure("renderer.dom_write_failed");
      }

      let installed: BrowserProjectionResult<ProjectionRenderOutcome>;
      try {
        installed = this.#install(
          host,
          projection,
          prepared,
          "full",
          undefined,
          () =>
            this.#liveCompositionLeaseRecord(lease) === record &&
            installGuard(),
        );
      } catch {
        this.#invalidateCompositionLeaseRecord(record);
        return projectionFailure("renderer.dom_write_failed");
      }
      record.active = false;
      if (!installed.ok) {
        this.#invalidateCompositionLeaseRecord(record);
      }
      return installed;
    } finally {
      endHostOperation(host);
    }
  }

  /** Invalidates and releases one exact composition lease. @internal */
  discardCompositionDomLease(lease: DomCompositionLease): boolean {
    const record = this.#liveCompositionLeaseRecord(lease);
    if (record === null || ACTIVE_HOST_OPERATIONS.has(record.handle.host)) {
      return false;
    }
    this.#invalidateCompositionLeaseRecord(record);
    return true;
  }

  /**
   * Replaces a host's children with a complete safe DOM projection.
   *
   * The renderer creates only paragraphs, manifest-admitted inert inline
   * wrappers, empty-paragraph `br` placeholders, and text nodes. Dynamic
   * attributes come only from closed browser-owned policies such as
   * `safeLinkV1` and `safeTextColorV1`; arbitrary CSS is never interpreted.
   * The renderer never interprets HTML or exposes AST paths as DOM attributes.
   */
  render(
    host: HTMLElement,
    projection: BaseDocumentProjection,
  ): BrowserProjectionResult<ProjectionRenderOutcome> {
    if (typeof host !== "object" || host === null) {
      return projectionFailure("renderer.invalid_host");
    }
    if (!beginHostOperation(host)) {
      return projectionFailure("renderer.dom_write_failed");
    }
    try {
      const installGuard = this.#snapshotInstallGuard(host);
      if (installGuard === null) {
        return projectionFailure("renderer.dom_write_failed");
      }
      if (!isUsableHost(host)) {
        return projectionFailure("renderer.invalid_host");
      }
      if (!isOwnedProjection(projection)) {
        return projectionFailure("projection.invalid_shape");
      }
      if (!this.#bindProjectionPresentation(projection)) {
        return projectionFailure("projection.invalid_shape");
      }
      if (!renderFitsDomBudget(projection)) {
        return projectionFailure("projection.resource_limit");
      }
      let prepared: PreparedDom;
      try {
        prepared = buildFullProjection(host, projection, this.#presentation);
      } catch {
        return projectionFailure("renderer.dom_write_failed");
      }
      return this.#install(
        host,
        projection,
        prepared,
        "full",
        undefined,
        installGuard,
      );
    } finally {
      endHostOperation(host);
    }
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
    const host = rendered.host;
    if (!beginHostOperation(host)) {
      return projectionFailure("renderer.dom_write_failed");
    }
    try {
      const ownership = HOST_OWNERS.get(host);
      if (
        !rendered.current ||
        ownership?.rendererToken !== this.#rendererToken ||
        ownership.handle !== rendered ||
        update.base !== rendered.projection
      ) {
        return projectionFailure("renderer.foreign_or_stale_render");
      }
      const installGuard = this.#snapshotInstallGuard(host);
      if (installGuard === null) {
        return projectionFailure("renderer.dom_write_failed");
      }
      const plan = verifiedUpdatePlan(update);
      if (plan === undefined) {
        return projectionFailure("projection.invalid_update");
      }
      if (!this.#bindProjectionPresentation(update.result)) {
        return projectionFailure("projection.invalid_update");
      }
      if (!renderFitsDomBudget(update.result)) {
        return projectionFailure("projection.resource_limit");
      }

      if (plan.kind === "full") {
        let prepared: PreparedDom;
        try {
          prepared = buildFullProjection(host, update.result, this.#presentation);
        } catch {
          return projectionFailure("renderer.dom_write_failed");
        }
        return this.#install(
          host,
          update.result,
          prepared,
          "full",
          plan.reason,
          installGuard,
        );
      }

      let prepared: PreparedDom | null;
      try {
        prepared = buildIncrementalProjection(
          rendered,
          update.result,
          plan.paragraphs,
          this.#presentation,
        );
      } catch {
        prepared = null;
      }
      if (prepared === null) {
        let fallback: PreparedDom;
        try {
          fallback = buildFullProjection(host, update.result, this.#presentation);
        } catch {
          return projectionFailure("renderer.dom_write_failed");
        }
        return this.#install(
          host,
          update.result,
          fallback,
          "full",
          "domDrift",
          installGuard,
        );
      }
      return this.#install(
        host,
        update.result,
        prepared,
        "incremental",
        undefined,
        installGuard,
      );
    } finally {
      endHostOperation(host);
    }
  }

  /** Invalidates a current handle without changing its host DOM. */
  release(rendered: RenderedProjection): boolean {
    if (!isOwnedRenderedProjection(rendered)) {
      return false;
    }
    if (ACTIVE_HOST_OPERATIONS.has(rendered.host)) {
      return false;
    }
    const ownership = HOST_OWNERS.get(rendered.host);
    if (
      ownership?.rendererToken !== this.#rendererToken ||
      ownership.handle !== rendered ||
      !rendered.active
    ) {
      return false;
    }
    HOST_OWNERS.delete(rendered.host);
    rendered.invalidate();
    return true;
  }

  #bindProjectionPresentation(projection: BaseDocumentProjection): boolean {
    const associated = projectionPresentation(projection);
    if (this.#presentation === undefined) {
      return associated === undefined && projection.schema.fingerprint === undefined;
    }
    return bindProjectionPresentation(projection, this.#presentation);
  }

  #liveCompositionLeaseRecord(
    lease: unknown,
  ): DomCompositionLeaseRecord | null {
    if (typeof lease !== "object" || lease === null) {
      return null;
    }
    const record = DOM_COMPOSITION_LEASES.get(lease);
    if (record === undefined || !this.ownsCompositionDomLease(lease, record.handle)) {
      return null;
    }
    return record;
  }

  #invalidateCompositionLeaseRecord(record: DomCompositionLeaseRecord): void {
    record.active = false;
    const ownership = HOST_OWNERS.get(record.handle.host);
    if (
      ownership?.rendererToken === this.#rendererToken &&
      ownership.handle === record.handle
    ) {
      HOST_OWNERS.delete(record.handle.host);
    }
    record.handle.invalidate();
  }

  #snapshotInstallGuard(
    host: HTMLElement,
  ): (() => boolean) | null {
    try {
      // Establish the application-owned baseline before consulting any
      // replaceable host or document property. Reentrant getters can then only
      // invalidate this transaction; their DOM cannot become its baseline.
      const children = nativeChildNodes(host);
      // Deliberately probe the replaceable public view only after the native
      // baseline exists. Its value is never trusted, while any synchronous
      // getter side effect is caught by the returned native sequence proof.
      void host.childNodes;
      const ownership = HOST_OWNERS.get(host);
      const requiredCanonical = ownership?.handle.canonicalDomMatches() === true
        ? ownership.handle
        : undefined;
      return () =>
        HOST_OWNERS.get(host) === ownership &&
        sameNodeSequence(host, children) &&
        (requiredCanonical === undefined || requiredCanonical.canonicalDomMatches());
    } catch {
      return null;
    }
  }

  #install(
    host: HTMLElement,
    projection: BaseDocumentProjection,
    prepared: PreparedDom,
    mode: ProjectionRenderMode,
    fallbackReason?: ProjectionFallbackReason,
    installGuard?: () => boolean,
  ): BrowserProjectionResult<ProjectionRenderOutcome> {
    const prior = HOST_OWNERS.get(host)?.handle;
    let priorHostChildren: readonly ChildNode[];
    let priorChildren: Array<{
      readonly paragraph: HTMLParagraphElement;
      readonly children: readonly ChildNode[];
    }>;
    try {
      priorHostChildren = nativeChildNodes(host);
      priorChildren = prepared.refreshes.map((refresh) => ({
        paragraph: refresh.paragraph,
        children: nativeChildNodes(refresh.paragraph),
      }));
    } catch {
      prior?.invalidate();
      if (HOST_OWNERS.get(host)?.handle === prior) {
        HOST_OWNERS.delete(host);
      }
      return projectionFailure("renderer.dom_write_failed");
    }
    if (installGuard !== undefined && !installGuard()) {
      prior?.invalidate();
      if (HOST_OWNERS.get(host)?.handle === prior) {
        HOST_OWNERS.delete(host);
      }
      return projectionFailure("renderer.dom_write_failed");
    }
    let appliedRefreshes = 0;
    try {
      for (const refresh of prepared.refreshes) {
        appliedRefreshes += 1;
        refresh.paragraph.replaceChildren(...refresh.children);
      }
      if (
        prepared.refreshes.length !== 0 &&
        !sameNodeSequence(host, priorHostChildren)
      ) {
        throw new TypeError("A paragraph refresh changed the host topology.");
      }
      if (!sameChildren(host, prepared.paragraphs)) {
        host.replaceChildren(...prepared.paragraphs);
      }
    } catch {
      rollbackInstalledProjection(
        host,
        prepared,
        priorHostChildren,
        priorChildren,
        appliedRefreshes,
      );
      prior?.invalidate();
      if (HOST_OWNERS.get(host)?.handle === prior) {
        HOST_OWNERS.delete(host);
      }
      return projectionFailure("renderer.dom_write_failed");
    }

    prior?.invalidate();
    let handle: RenderedProjectionHandle | undefined;
    try {
      this.#generation += 1n;
      handle = new RenderedProjectionHandle(
        host,
        projection,
        this.#generation,
        prepared,
        this.#presentation,
      );
      HOST_OWNERS.set(host, { rendererToken: this.#rendererToken, handle });
      handle.observe(this.#rendererToken);
      if (!handle.validateCanonicalDom()) {
        if (HOST_OWNERS.get(host)?.handle === handle) {
          HOST_OWNERS.delete(host);
        }
        handle.invalidate();
        rollbackInstalledProjection(
          host,
          prepared,
          priorHostChildren,
          priorChildren,
          appliedRefreshes,
        );
        return projectionFailure("renderer.dom_write_failed");
      }
      const outcome: ProjectionRenderOutcome =
        fallbackReason === undefined
          ? Object.freeze({ rendered: handle, mode })
          : Object.freeze({ rendered: handle, mode, fallbackReason });
      return projectionSuccess(outcome);
    } catch {
      if (handle !== undefined && HOST_OWNERS.get(host)?.handle === handle) {
        HOST_OWNERS.delete(host);
      }
      handle?.invalidate();
      rollbackInstalledProjection(
        host,
        prepared,
        priorHostChildren,
        priorChildren,
        appliedRefreshes,
      );
      return projectionFailure("renderer.dom_write_failed");
    }
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
    const facts = nativeHtmlHostFacts(host);
    return (
      facts !== undefined &&
      typeof facts.ownerDocument.createElement === "function" &&
      typeof facts.ownerDocument.createElementNS === "function" &&
      typeof host.replaceChildren === "function"
    );
  } catch {
    return false;
  }
}

function beginHostOperation(host: HTMLElement): boolean {
  if (ACTIVE_HOST_OPERATIONS.has(host)) return false;
  ACTIVE_HOST_OPERATIONS.add(host);
  return true;
}

function endHostOperation(host: HTMLElement): void {
  ACTIVE_HOST_OPERATIONS.delete(host);
}

function buildFullProjection(
  host: HTMLElement,
  projection: BaseDocumentProjection,
  presentation: BrowserCompiledPresentation | undefined,
): PreparedDom {
  const ownerDocument = nativeOwnerDocument(host);
  if (ownerDocument === null) {
    throw new TypeError("The render host has no owner document.");
  }
  const maps = createMaps(host);
  const paragraphs = projection.paragraphs.map((paragraph, paragraphIndex) =>
    buildParagraph(ownerDocument, paragraph, paragraphIndex, maps, presentation),
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
  presentation: BrowserCompiledPresentation | undefined,
): PreparedDom | null {
  const ownerDocument = nativeOwnerDocument(rendered.host);
  if (ownerDocument === null) return null;
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
      !paragraphDomMatches(node, oldParagraph, presentation) ||
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
      paragraphs.push(
        buildParagraph(
          ownerDocument,
          paragraph,
          newIndex,
          maps,
          presentation,
        ),
      );
    } else {
      if (retained.content === "preserve") {
        if (!mapExistingParagraph(
          retained.node,
          paragraph,
          newIndex,
          maps,
          presentation,
        )) {
          return null;
        }
      } else {
        const paragraphPath = paragraphAstPath(newIndex);
        mapNode(retained.node, paragraphPath, maps.astToDom, maps.domToAst, true);
        const children = buildParagraphChildren(
          ownerDocument,
          paragraph,
          newIndex,
          maps,
          presentation,
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
  presentation: BrowserCompiledPresentation | undefined,
): HTMLParagraphElement {
  const element = createHtmlElement(document, "p", "P");
  const paragraphPath = paragraphAstPath(paragraphIndex);
  mapNode(element, paragraphPath, maps.astToDom, maps.domToAst, true);
  element.append(
    ...buildParagraphChildren(
      document,
      paragraph,
      paragraphIndex,
      maps,
      presentation,
    ),
  );
  return element;
}

function buildParagraphChildren(
  document: Document,
  paragraph: BaseParagraphProjection,
  paragraphIndex: number,
  maps: ProjectionMaps,
  presentation: BrowserCompiledPresentation | undefined,
): readonly Node[] {
  if (paragraph.runs.length === 0) {
    const placeholder = createHtmlElement(document, "br", "BR");
    return Object.freeze([placeholder]);
  }
  const children = paragraph.runs.map((run, runIndex): Node => {
    const path = textRunAstPath(paragraphIndex, runIndex);
    const text = createTextNode(document, run.text);
    mapNode(text, path, maps.astToDom, maps.domToAst, true);
    const recipes = recipesForRun(run, presentation);
    let child: Node = text;
    for (let recipeIndex = recipes.length - 1; recipeIndex >= 0; recipeIndex -= 1) {
      const resolved = recipes[recipeIndex];
      if (resolved === undefined) throw new TypeError("render recipe is unavailable");
      const wrapper = createRecipeElement(document, resolved);
      wrapper.append(child);
      child = wrapper;
    }
    return child;
  });
  return Object.freeze(children);
}

function paragraphDomMatches(
  paragraphNode: HTMLParagraphElement,
  paragraph: BaseParagraphProjection,
  presentation: BrowserCompiledPresentation | undefined,
): boolean {
  if (
    !isHtmlParagraph(paragraphNode) ||
    nativeAttributeNames(paragraphNode).length !== 0
  ) {
    return false;
  }
  const children = nativeChildNodes(paragraphNode);
  if (paragraph.runs.length === 0) {
    const child = children[0];
    return (
      children.length === 1 &&
      isHtmlElementNamed(child, "BR") &&
      nativeAttributeNames(child).length === 0 &&
      nativeChildNodes(child).length === 0
    );
  }
  if (children.length !== paragraph.runs.length) {
    return false;
  }
  return paragraph.runs.every((run, runIndex) => {
    const child = children[runIndex];
    return child !== undefined && runDomMatches(child, run, presentation);
  });
}

function mapExistingParagraph(
  paragraphNode: HTMLParagraphElement,
  paragraph: BaseParagraphProjection,
  paragraphIndex: number,
  maps: ProjectionMaps,
  presentation: BrowserCompiledPresentation | undefined,
): boolean {
  if (!paragraphDomMatches(paragraphNode, paragraph, presentation)) {
    return false;
  }
  const paragraphPath = paragraphAstPath(paragraphIndex);
  mapNode(paragraphNode, paragraphPath, maps.astToDom, maps.domToAst, true);
  if (paragraph.runs.length === 0) {
    return true;
  }
  const children = nativeChildNodes(paragraphNode);
  paragraph.runs.forEach((run, runIndex) => {
    const path = textRunAstPath(paragraphIndex, runIndex);
    const child = children[runIndex];
    if (child === undefined) {
      return;
    }
    const text = textNodeForRunDom(child, run, presentation);
    if (text !== undefined) {
      mapNode(text, path, maps.astToDom, maps.domToAst, true);
    }
  });
  return true;
}

const LEGACY_STRONG_RECIPE: InlineFormatRenderRecipe = Object.freeze({
  formatKind: "breditor/strong",
  element: "strong",
  classes: Object.freeze([]),
  before: Object.freeze([]),
  after: Object.freeze([]),
});
const EMPTY_RENDER_ATTRIBUTES = Object.freeze([]);
const LEGACY_STRONG_RESOLVED_RECIPE: BrowserResolvedInlineFormatRenderRecipe =
  Object.freeze({
    recipe: LEGACY_STRONG_RECIPE,
    attributes: EMPTY_RENDER_ATTRIBUTES,
  });
const LEGACY_STRONG_RESOLVED_RECIPES = Object.freeze([
  LEGACY_STRONG_RESOLVED_RECIPE,
]);
const EMPTY_RESOLVED_RECIPES: readonly BrowserResolvedInlineFormatRenderRecipe[] =
  Object.freeze([]);

function recipesForRun(
  run: BaseTextRunProjection,
  presentation: BrowserCompiledPresentation | undefined,
): readonly BrowserResolvedInlineFormatRenderRecipe[] {
  if (presentation === undefined) {
    if (run.formats.length === 0) return EMPTY_RESOLVED_RECIPES;
    if (run.formats.length === 1 && run.formats[0] === "breditor/strong") {
      return LEGACY_STRONG_RESOLVED_RECIPES;
    }
    throw new TypeError("legacy renderer received an unsupported format");
  }
  const recipes = browserPresentationRecipesForFormatDetails(
    presentation,
    run.formatDetails,
  );
  if (recipes === undefined) {
    throw new TypeError("profile renderer is missing a format recipe");
  }
  return recipes;
}

function createRecipeElement(
  document: Document,
  resolved: BrowserResolvedInlineFormatRenderRecipe,
): HTMLElement {
  const { recipe } = resolved;
  const element = document.createElementNS(HTML_NAMESPACE, recipe.element);
  if (
    !isFreshHtmlElement(document, element, recipe.element.toUpperCase())
  ) {
    throw new TypeError("The host document did not create the requested HTML element.");
  }
  if (recipe.classes.length !== 0) {
    nativeSetAttribute(element, "class", recipe.classes.join(" "));
  }
  for (const attribute of resolved.attributes) {
    nativeSetAttribute(element, attribute.name, attribute.value);
  }
  if (!recipeElementMatches(element, resolved)) {
    throw new TypeError("The host document did not retain the requested render recipe.");
  }
  return element;
}

function runDomMatches(
  outer: Node,
  run: BaseTextRunProjection,
  presentation: BrowserCompiledPresentation | undefined,
): boolean {
  let recipes: readonly BrowserResolvedInlineFormatRenderRecipe[];
  try {
    recipes = recipesForRun(run, presentation);
  } catch {
    return false;
  }
  let current: Node = outer;
  for (const recipe of recipes) {
    const children = nativeChildNodes(current);
    if (
      !recipeElementMatches(current, recipe) ||
      children.length !== 1 ||
      children[0] === undefined
    ) {
      return false;
    }
    current = children[0];
  }
  return nativeNodeType(current) === 3 && nativeNodeValue(current) === run.text;
}

function textNodeForRunDom(
  outer: Node,
  run: BaseTextRunProjection,
  presentation: BrowserCompiledPresentation | undefined,
): Text | undefined {
  let recipes: readonly BrowserResolvedInlineFormatRenderRecipe[];
  try {
    recipes = recipesForRun(run, presentation);
  } catch {
    return undefined;
  }
  let current: Node = outer;
  for (const recipe of recipes) {
    const children = nativeChildNodes(current);
    if (
      !recipeElementMatches(current, recipe) ||
      children.length !== 1 ||
      children[0] === undefined
    ) {
      return undefined;
    }
    current = children[0];
  }
  return nativeNodeType(current) === 3 && nativeNodeValue(current) === run.text
    ? (current as Text)
    : undefined;
}

function recipeElementMatches(
  node: Node,
  resolved: BrowserResolvedInlineFormatRenderRecipe,
): node is HTMLElement {
  const { recipe } = resolved;
  if (!isHtmlElementNamed(node, recipe.element.toUpperCase())) return false;
  const attributeNames = nativeAttributeNames(node);
  const expectedNames = recipe.classes.length === 0
    ? resolved.attributes.map(({ name }) => name)
    : ["class", ...resolved.attributes.map(({ name }) => name)];
  if (
    attributeNames.length !== expectedNames.length ||
    attributeNames.some((name, index) => name !== expectedNames[index])
  ) {
    return false;
  }
  if (
    recipe.classes.length !== 0 &&
    nativeGetAttribute(node, "class") !== recipe.classes.join(" ")
  ) {
    return false;
  }
  return resolved.attributes.every(
    ({ name, value }) => nativeGetAttribute(node, name) === value,
  );
}

function wrappersAreUnmapped(
  outer: Node,
  text: Node | undefined,
  domToAst: WeakMap<Node, AstPath>,
): boolean {
  if (text === undefined) return false;
  let current: Node | null = outer;
  while (current !== text) {
    if (domToAst.get(current) !== undefined) return false;
    current = nativeChildNodes(current)[0] ?? null;
    if (current === null) return false;
  }
  return true;
}

function renderFitsDomBudget(projection: BaseDocumentProjection): boolean {
  let nodes = 1 + projection.paragraphs.length;
  for (const paragraph of projection.paragraphs) {
    if (paragraph.runs.length === 0) {
      nodes += 1;
    } else {
      for (const run of paragraph.runs) {
        nodes += 1 + run.formats.length;
        if (nodes > MAX_RENDERED_PROJECTION_DOM_NODES) return false;
      }
    }
  }
  return nodes <= MAX_RENDERED_PROJECTION_DOM_NODES;
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
  if (node === undefined) return false;
  const facts = nativeHtmlHostFacts(node);
  return facts !== undefined &&
    nativeElementLocalName(facts.element) === tagName.toLowerCase();
}

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  localName: K,
  expectedTagName: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElementNS(HTML_NAMESPACE, localName);
  if (!isFreshHtmlElement(document, element, expectedTagName)) {
    throw new TypeError("The host document did not create the requested HTML element.");
  }
  return element as HTMLElementTagNameMap[K];
}

function createTextNode(document: Document, text: string): Text {
  const node = document.createTextNode(text);
  if (
    nativeNodeType(node) !== 3 ||
    nativeOwnerDocument(node) !== document ||
    nativeParentNode(node) !== null ||
    nativeNodeValue(node) !== text ||
    nativeChildNodes(node).length !== 0
  ) {
    throw new TypeError("The host document did not create the requested text node.");
  }
  return node;
}

function isFreshHtmlElement(
  document: Document,
  node: Node | undefined,
  tagName: string,
): node is HTMLElement {
  return isHtmlElementNamed(node, tagName) &&
    nativeOwnerDocument(node) === document &&
    nativeParentNode(node) === null &&
    nativeAttributeNames(node).length === 0 &&
    nativeChildNodes(node).length === 0;
}

function sameChildren(host: HTMLElement, paragraphs: readonly HTMLParagraphElement[]): boolean {
  const children = nativeChildNodes(host);
  if (children.length !== paragraphs.length) {
    return false;
  }
  return paragraphs.every((paragraph, index) => children[index] === paragraph);
}

function sameNodeSequence(
  host: HTMLElement,
  children: readonly ChildNode[],
): boolean {
  const current = nativeChildNodes(host);
  if (current.length !== children.length) return false;
  return children.every((child, index) => current[index] === child);
}

function rollbackInstalledProjection(
  host: HTMLElement,
  prepared: PreparedDom,
  priorHostChildren: readonly ChildNode[],
  priorParagraphChildren: readonly Readonly<{
    readonly paragraph: HTMLParagraphElement;
    readonly children: readonly ChildNode[];
  }>[],
  appliedRefreshes: number,
): void {
  for (let index = appliedRefreshes - 1; index >= 0; index -= 1) {
    const prior = priorParagraphChildren[index];
    try {
      if (prior !== undefined) {
        nativeReplaceChildren(prior.paragraph, ...prior.children);
      }
    } catch {
      // Exact new-node removal below remains independent.
    }
  }
  const priorNodes = new Set(priorHostChildren);
  for (const paragraph of prepared.paragraphs) {
    if (priorNodes.has(paragraph)) continue;
    try {
      if (nativeParentElement(paragraph) === host) {
        nativeRemoveElement(paragraph);
      }
    } catch {
      // Never broaden rollback beyond one exact prepared paragraph identity.
    }
  }
}
