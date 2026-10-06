import { isOwnedNestedListRenderedProjection } from "./dom_renderer.js";
import { isOwnedNestedListProjection, type NestedListDocumentProjection } from "./nested_list_projection.js";
import { isOwnedNestedListRangeSelection, type NestedListRangeSelection } from "./nested_list_selection.js";
import {
  isOwnedRenderedProjection,
  isOwnedFlatListRenderedProjection,
  type RenderedProjection,
} from "./dom_renderer.js";
import { nativeHtmlHostFacts } from "./html_host.js";
import {
  isOwnedProjection,
  type BaseDocumentProjection,
} from "./projection.js";
import {
  isOwnedBaseRangeSelection,
  type BaseRangeSelection,
} from "./selection.js";

import { isOwnedFlatListProjection, type FlatListDocumentProjection } from "./flat_list_projection.js";
import { isOwnedFlatListRangeSelection, type FlatListRangeSelection } from "./flat_list_selection.js";

type CompositionProjection = BaseDocumentProjection | FlatListDocumentProjection | NestedListDocumentProjection;
type CompositionSelection<P extends CompositionProjection> = P extends NestedListDocumentProjection ? NestedListRangeSelection : P extends FlatListDocumentProjection ? FlatListRangeSelection : BaseRangeSelection;
/** Explicit list composition capability; legacy matchers reject it. @internal */
export type FlatListCompositionDeliveryToken = CompositionDeliveryToken<FlatListDocumentProjection>;

/** Explicit recursive composition capability. @internal */
export type NestedListCompositionDeliveryToken = CompositionDeliveryToken<NestedListDocumentProjection>;

declare const COMPOSITION_DELIVERY_TOKEN_BRAND: unique symbol;

const MAX_U64 = 18_446_744_073_709_551_615n;
const CONSTRUCTION_PERMIT = Object.freeze({});
const COMPOSITION_DELIVERY_TOKENS = new WeakMap<object, boolean | "nested">();
const COMPOSITION_DELIVERY_AUTHORITIES = new WeakMap<object, symbol>();

/**
 * Opaque capability for one exact browser composition lease base.
 *
 * Visible fields are immutable diagnostics, never sufficient authority. The
 * owning adapter must additionally match the hidden symbol and spend this
 * exact token identity before opening or settling the lease.
 */
export interface CompositionDeliveryToken<P extends CompositionProjection = BaseDocumentProjection> {
  /** Exact semantic projection from which the composition starts. */
  readonly projection: P;
  /** Exact current canonical DOM projection for the leased host. */
  readonly rendered: RenderedProjection<P>;
  /** Exact semantic start range captured against `projection`. */
  readonly selection: CompositionSelection<P>;
  /** Exact connected light-DOM host represented by `rendered`. */
  readonly host: HTMLElement;
  /** Copied snapshot diagnostics for fail-closed correlation. */
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  /** Renderer generation captured at issuance. */
  readonly rendererGeneration: bigint;
  /** Adapter observation epoch captured at issuance. */
  readonly observationEpoch: bigint;
  /** Nonzero controller-local `u64` composition session identity. */
  readonly sessionId: bigint;
  /** Prevents structural construction outside this module. */
  readonly [COMPOSITION_DELIVERY_TOKEN_BRAND]: true;
}

class OwnedCompositionDeliveryToken<P extends CompositionProjection> implements CompositionDeliveryToken<P> {
  declare readonly [COMPOSITION_DELIVERY_TOKEN_BRAND]: true;
  readonly projection: P;
  readonly rendered: RenderedProjection<P>;
  readonly selection: CompositionSelection<P>;
  readonly host: HTMLElement;
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly rendererGeneration: bigint;
  readonly observationEpoch: bigint;
  readonly sessionId: bigint;

  constructor(
    projection: P,
    rendered: RenderedProjection<P>,
    selection: CompositionSelection<P>,
    observationEpoch: bigint,
    sessionId: bigint,
    authority: symbol,
    permit: object,
    flatLists: boolean | "nested",
  ) {
    if (permit !== CONSTRUCTION_PERMIT) {
      throw new TypeError("composition delivery tokens have no public constructor");
    }
    this.projection = projection;
    this.rendered = rendered;
    this.selection = selection;
    this.host = rendered.host;
    this.snapshotLineage = projection.snapshot.lineage;
    this.snapshotRevision = projection.snapshot.revision;
    this.rendererGeneration = rendered.rendererGeneration;
    this.observationEpoch = observationEpoch;
    this.sessionId = sessionId;
    COMPOSITION_DELIVERY_TOKENS.set(this, flatLists);
    COMPOSITION_DELIVERY_AUTHORITIES.set(this, authority);
    Object.freeze(this);
  }
}

Object.freeze(OwnedCompositionDeliveryToken.prototype);

/**
 * Issues one exact composition lease capability.
 *
 * @internal
 */
export function issueCompositionDeliveryToken(
  projection: BaseDocumentProjection,
  rendered: RenderedProjection,
  selection: BaseRangeSelection,
  observationEpoch: bigint,
  sessionId: bigint,
  authority: symbol,
): CompositionDeliveryToken {
  return issueToken(projection, rendered, selection, observationEpoch, sessionId, authority, false);
}

/** Issues an exact list-mode lease base; does not open or spend the lease. @internal */
export function issueFlatListCompositionDeliveryToken(projection: FlatListDocumentProjection,
  rendered: RenderedProjection<FlatListDocumentProjection>, selection: FlatListRangeSelection,
  observationEpoch: bigint, sessionId: bigint, authority: symbol): FlatListCompositionDeliveryToken {
  return issueToken(projection, rendered, selection, observationEpoch, sessionId, authority, true);
}

/** Issues a nested composition capability against one exact canonical base. @internal */
export function issueNestedListCompositionDeliveryToken(projection: NestedListDocumentProjection,
  rendered: RenderedProjection<NestedListDocumentProjection>, selection: NestedListRangeSelection,
  observationEpoch: bigint, sessionId: bigint, authority: symbol): NestedListCompositionDeliveryToken {
  return issueToken(projection, rendered, selection, observationEpoch, sessionId, authority, "nested");
}

function issueToken<P extends CompositionProjection>(projection: P, rendered: RenderedProjection<P>,
  selection: CompositionSelection<P>, observationEpoch: bigint, sessionId: bigint, authority: symbol,
  flatLists: boolean | "nested"): CompositionDeliveryToken<P> {
  if (
    !(flatLists === "nested" ? isOwnedNestedListProjection(projection) : flatLists ? isOwnedFlatListProjection(projection) : isOwnedProjection(projection)) ||
    !(flatLists === "nested" ? isOwnedNestedListRenderedProjection(rendered) : flatLists ? isOwnedFlatListRenderedProjection(rendered) : isOwnedRenderedProjection(rendered)) ||
    rendered.projection !== projection ||
    !(flatLists === "nested" ? isOwnedNestedListRangeSelection(selection) : flatLists ? isOwnedFlatListRangeSelection(selection) : isOwnedBaseRangeSelection(selection)) ||
    selection.projection !== projection ||
    typeof observationEpoch !== "bigint" ||
    observationEpoch < 0n ||
    !isNonzeroU64(sessionId) ||
    typeof authority !== "symbol" ||
    !renderIsLiveAndCanonical(rendered)
  ) {
    throw new TypeError("composition delivery token base is invalid");
  }
  return new OwnedCompositionDeliveryToken(
    projection,
    rendered,
    selection,
    observationEpoch,
    sessionId,
    authority,
    CONSTRUCTION_PERMIT,
    flatLists,
  );
}

/**
 * Proves the exact live canonical base required to open a DOM lease.
 *
 * This check is total for hostile JavaScript values. It does not spend the
 * token; the owning adapter must enforce one-use identity when a lease opens.
 *
 * @internal
 */
export function compositionDeliveryTokenMatchesOpeningBase(
  token: unknown,
  projection: unknown,
  rendered: unknown,
  selection: unknown,
  observationEpoch: unknown,
  sessionId: unknown,
  authority: unknown,
): token is CompositionDeliveryToken {
  return (
    compositionDeliveryTokenMatchesExactBase(
      token,
      projection,
      rendered,
      selection,
      observationEpoch,
      sessionId,
      authority,
      false,
    ) && renderIsLiveAndCanonical(rendered)
  );
}

/**
 * Proves the exact connected base required to settle an open DOM lease.
 *
 * Native IME mutation makes the leased DOM deliberately noncanonical, so this
 * matcher checks host connectivity without consulting `current` or calling
 * `validateCanonicalDom`. The renderer's separate opaque composition lease
 * proves uninterrupted ownership. This check is total and does not spend the
 * token.
 *
 * @internal
 */
export function compositionDeliveryTokenMatchesSettlement(
  token: unknown,
  projection: unknown,
  rendered: unknown,
  selection: unknown,
  observationEpoch: unknown,
  sessionId: unknown,
  authority: unknown,
): token is CompositionDeliveryToken {
  return (
    compositionDeliveryTokenMatchesExactBase(
      token,
      projection,
      rendered,
      selection,
      observationEpoch,
      sessionId,
      authority,
      false,
    ) && renderHostIsConnected(rendered)
  );
}

/** List-mode canonical opening proof. @internal */
export function flatListCompositionDeliveryTokenMatchesOpeningBase(token: unknown, projection: unknown,
  rendered: unknown, selection: unknown, observationEpoch: unknown, sessionId: unknown, authority: unknown
): token is FlatListCompositionDeliveryToken {
  return compositionDeliveryTokenMatchesExactBase(token, projection, rendered, selection, observationEpoch,
    sessionId, authority, true) && renderIsLiveAndCanonical(rendered);
}

/** List-mode settlement proof; renderer lease must separately prove uninterrupted ownership. @internal */
export function flatListCompositionDeliveryTokenMatchesSettlement(token: unknown, projection: unknown,
  rendered: unknown, selection: unknown, observationEpoch: unknown, sessionId: unknown, authority: unknown
): token is FlatListCompositionDeliveryToken {
  return compositionDeliveryTokenMatchesExactBase(token, projection, rendered, selection, observationEpoch,
    sessionId, authority, true) && renderHostIsConnected(rendered);
}

/** List-mode canonical opening proof. @internal */
export function nestedListCompositionDeliveryTokenMatchesOpeningBase(token: unknown, projection: unknown,
  rendered: unknown, selection: unknown, observationEpoch: unknown, sessionId: unknown, authority: unknown
): token is NestedListCompositionDeliveryToken {
  return compositionDeliveryTokenMatchesExactBase(token, projection, rendered, selection, observationEpoch,
    sessionId, authority, "nested") && renderIsLiveAndCanonical(rendered);
}

/** List-mode settlement proof; renderer lease must separately prove uninterrupted ownership. @internal */
export function nestedListCompositionDeliveryTokenMatchesSettlement(token: unknown, projection: unknown,
  rendered: unknown, selection: unknown, observationEpoch: unknown, sessionId: unknown, authority: unknown
): token is NestedListCompositionDeliveryToken {
  return compositionDeliveryTokenMatchesExactBase(token, projection, rendered, selection, observationEpoch,
    sessionId, authority, "nested") && renderHostIsConnected(rendered);
}

function compositionDeliveryTokenMatchesExactBase(
  token: unknown,
  projection: unknown,
  rendered: unknown,
  selection: unknown,
  observationEpoch: unknown,
  sessionId: unknown,
  authority: unknown,
  flatLists: boolean | "nested",
): token is CompositionDeliveryToken<CompositionProjection> {
  try {
    return (
      isIssuedCompositionDeliveryToken(token, flatLists) &&
      (isOwnedNestedListProjection(projection) || isOwnedFlatListProjection(projection) || isOwnedProjection(projection)) &&
      (isOwnedNestedListRenderedProjection(rendered) || isOwnedFlatListRenderedProjection(rendered) || isOwnedRenderedProjection(rendered)) &&
      (isOwnedNestedListRangeSelection(selection) || isOwnedFlatListRangeSelection(selection) || isOwnedBaseRangeSelection(selection)) &&
      typeof observationEpoch === "bigint" &&
      observationEpoch >= 0n &&
      isNonzeroU64(sessionId) &&
      typeof authority === "symbol" &&
      COMPOSITION_DELIVERY_AUTHORITIES.get(token) === authority &&
      token.projection === projection &&
      token.rendered === rendered &&
      token.selection === selection &&
      token.host === rendered.host &&
      rendered.projection === projection &&
      selection.projection === projection &&
      token.rendererGeneration === rendered.rendererGeneration &&
      token.snapshotLineage === projection.snapshot.lineage &&
      token.snapshotRevision === projection.snapshot.revision &&
      token.observationEpoch === observationEpoch &&
      token.sessionId === sessionId
    );
  } catch {
    return false;
  }
}

function isIssuedCompositionDeliveryToken(
  value: unknown,
  flatLists: boolean | "nested",
): value is CompositionDeliveryToken<CompositionProjection> {
  return (
    typeof value === "object" &&
    value !== null &&
    COMPOSITION_DELIVERY_TOKENS.get(value) === flatLists
  );
}

function renderIsLiveAndCanonical(rendered: unknown): rendered is RenderedProjection<CompositionProjection> {
  try {
    return (
      (isOwnedNestedListRenderedProjection(rendered) || isOwnedRenderedProjection(rendered) || isOwnedFlatListRenderedProjection(rendered)) &&
      rendered.current &&
      nativeHtmlHostFacts(rendered.host)?.isConnected === true &&
      rendered.validateCanonicalDom() === true &&
      rendered.current &&
      nativeHtmlHostFacts(rendered.host)?.isConnected === true
    );
  } catch {
    return false;
  }
}

function renderHostIsConnected(rendered: unknown): rendered is RenderedProjection<CompositionProjection> {
  try {
    return (
      (isOwnedNestedListRenderedProjection(rendered) || isOwnedRenderedProjection(rendered) || isOwnedFlatListRenderedProjection(rendered)) &&
      nativeHtmlHostFacts(rendered.host)?.isConnected === true
    );
  } catch {
    return false;
  }
}

function isNonzeroU64(value: unknown): value is bigint {
  return typeof value === "bigint" && value > 0n && value <= MAX_U64;
}
