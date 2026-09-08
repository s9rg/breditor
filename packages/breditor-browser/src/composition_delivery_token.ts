import {
  isOwnedRenderedProjection,
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

declare const COMPOSITION_DELIVERY_TOKEN_BRAND: unique symbol;

const MAX_U64 = 18_446_744_073_709_551_615n;
const CONSTRUCTION_PERMIT = Object.freeze({});
const COMPOSITION_DELIVERY_TOKENS = new WeakSet<object>();
const COMPOSITION_DELIVERY_AUTHORITIES = new WeakMap<object, symbol>();

/**
 * Opaque capability for one exact browser composition lease base.
 *
 * Visible fields are immutable diagnostics, never sufficient authority. The
 * owning adapter must additionally match the hidden symbol and spend this
 * exact token identity before opening or settling the lease.
 */
export interface CompositionDeliveryToken {
  /** Exact semantic projection from which the composition starts. */
  readonly projection: BaseDocumentProjection;
  /** Exact current canonical DOM projection for the leased host. */
  readonly rendered: RenderedProjection;
  /** Exact semantic start range captured against `projection`. */
  readonly selection: BaseRangeSelection;
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

class OwnedCompositionDeliveryToken implements CompositionDeliveryToken {
  declare readonly [COMPOSITION_DELIVERY_TOKEN_BRAND]: true;
  readonly projection: BaseDocumentProjection;
  readonly rendered: RenderedProjection;
  readonly selection: BaseRangeSelection;
  readonly host: HTMLElement;
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly rendererGeneration: bigint;
  readonly observationEpoch: bigint;
  readonly sessionId: bigint;

  constructor(
    projection: BaseDocumentProjection,
    rendered: RenderedProjection,
    selection: BaseRangeSelection,
    observationEpoch: bigint,
    sessionId: bigint,
    authority: symbol,
    permit: object,
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
    COMPOSITION_DELIVERY_TOKENS.add(this);
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
  if (
    !isOwnedProjection(projection) ||
    !isOwnedRenderedProjection(rendered) ||
    rendered.projection !== projection ||
    !isOwnedBaseRangeSelection(selection) ||
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
    ) && renderHostIsConnected(rendered)
  );
}

function compositionDeliveryTokenMatchesExactBase(
  token: unknown,
  projection: unknown,
  rendered: unknown,
  selection: unknown,
  observationEpoch: unknown,
  sessionId: unknown,
  authority: unknown,
): token is CompositionDeliveryToken {
  try {
    return (
      isIssuedCompositionDeliveryToken(token) &&
      isOwnedProjection(projection) &&
      isOwnedRenderedProjection(rendered) &&
      isOwnedBaseRangeSelection(selection) &&
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
): value is CompositionDeliveryToken {
  return (
    typeof value === "object" &&
    value !== null &&
    COMPOSITION_DELIVERY_TOKENS.has(value)
  );
}

function renderIsLiveAndCanonical(rendered: unknown): rendered is RenderedProjection {
  try {
    return (
      isOwnedRenderedProjection(rendered) &&
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

function renderHostIsConnected(rendered: unknown): rendered is RenderedProjection {
  try {
    return (
      isOwnedRenderedProjection(rendered) &&
      nativeHtmlHostFacts(rendered.host)?.isConnected === true
    );
  } catch {
    return false;
  }
}

function isNonzeroU64(value: unknown): value is bigint {
  return typeof value === "bigint" && value > 0n && value <= MAX_U64;
}
