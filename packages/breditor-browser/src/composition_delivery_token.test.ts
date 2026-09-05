import { beforeEach, describe, expect, it } from "vitest";

import * as compositionDeliveryModule from "./composition_delivery_token.js";
import {
  compositionDeliveryTokenMatchesOpeningBase,
  compositionDeliveryTokenMatchesSettlement,
  issueCompositionDeliveryToken,
  type CompositionDeliveryToken,
} from "./composition_delivery_token.js";
import {
  BreditorDomRenderer,
  type RenderedProjection,
} from "./dom_renderer.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection } from "./selection.js";

const MAX_U64 = 18_446_744_073_709_551_615n;

interface Fixture {
  readonly projection: BaseDocumentProjection;
  readonly renderer: BreditorDomRenderer;
  readonly rendered: RenderedProjection;
  readonly selection: BaseRangeSelection;
  readonly host: HTMLElement;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("composition delivery token", () => {
  it("binds one exact live base selection, render, epoch, session, and authority", () => {
    const fixture = createFixture("exact", "0");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 7n, MAX_U64, authority);

    expect(token).toMatchObject({
      projection: fixture.projection,
      rendered: fixture.rendered,
      selection: fixture.selection,
      host: fixture.host,
      snapshotLineage: "exact",
      snapshotRevision: "0",
      rendererGeneration: fixture.rendered.rendererGeneration,
      observationEpoch: 7n,
      sessionId: MAX_U64,
    });
    expect(openingMatches(token, fixture, 7n, MAX_U64, authority)).toBe(true);
    expect(settlementMatches(token, fixture, 7n, MAX_U64, authority)).toBe(true);
  });

  it("rejects foreign authority and stale epoch or session identity", () => {
    const fixture = createFixture("scalar-correlation", "4");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 12n, 9n, authority);

    expect(openingMatches(token, fixture, 12n, 9n, Symbol("foreign"))).toBe(false);
    expect(openingMatches(token, fixture, 11n, 9n, authority)).toBe(false);
    expect(settlementMatches(token, fixture, 12n, 8n, authority)).toBe(false);
    expect(settlementMatches(token, fixture, 12n, 0n, authority)).toBe(false);
    expect(settlementMatches(token, fixture, 12n, MAX_U64 + 1n, authority)).toBe(false);
  });

  it("rejects another projection or selection identity, including lookalikes", () => {
    const fixture = createFixture("identity", "3");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 0n, 1n, authority);
    const projectionLookalike = projection("identity", "3", "hello");
    const otherSelection = selection(fixture.projection, 1);
    const structuralSelection = {
      ...fixture.selection,
    } as unknown as BaseRangeSelection;

    expect(
      compositionDeliveryTokenMatchesOpeningBase(
        token,
        projectionLookalike,
        fixture.rendered,
        fixture.selection,
        0n,
        1n,
        authority,
      ),
    ).toBe(false);
    expect(
      compositionDeliveryTokenMatchesOpeningBase(
        token,
        fixture.projection,
        fixture.rendered,
        otherSelection,
        0n,
        1n,
        authority,
      ),
    ).toBe(false);
    expect(
      compositionDeliveryTokenMatchesSettlement(
        token,
        fixture.projection,
        fixture.rendered,
        structuralSelection,
        0n,
        1n,
        authority,
      ),
    ).toBe(false);
  });

  it("allows leased native text drift only for settlement matching", () => {
    const fixture = createFixture("leased-drift", "0");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 2n, 3n, authority);
    canonicalText(fixture.host).data = "native IME text";

    expect(settlementMatches(token, fixture, 2n, 3n, authority)).toBe(true);
    expect(openingMatches(token, fixture, 2n, 3n, authority)).toBe(false);
  });

  it("requires exact generation while settlement delegates non-current ownership to the renderer lease", () => {
    const fixture = createFixture("render-identity", "0");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 2n, 3n, authority);
    const replacement = renderValue(
      fixture.renderer.render(fixture.host, fixture.projection),
    ).rendered;
    const replacementFixture: Fixture = {
      ...fixture,
      rendered: replacement,
    };

    expect(replacement.rendererGeneration).not.toBe(token.rendererGeneration);
    expect(fixture.rendered.current).toBe(false);
    expect(openingMatches(token, fixture, 2n, 3n, authority)).toBe(false);
    expect(settlementMatches(token, fixture, 2n, 3n, authority)).toBe(true);
    expect(settlementMatches(token, replacementFixture, 2n, 3n, authority)).toBe(false);
  });

  it("rejects a disconnected host for opening and settlement", () => {
    const fixture = createFixture("disconnected", "0");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 0n, 1n, authority);
    fixture.host.remove();

    expect(openingMatches(token, fixture, 0n, 1n, authority)).toBe(false);
    expect(settlementMatches(token, fixture, 0n, 1n, authority)).toBe(false);
  });

  it("refuses issuance for mismatched selection, disconnected or noncanonical DOM, and invalid scalars", () => {
    const mismatch = createFixture("selection-mismatch", "0");
    const foreignProjection = projection("foreign", "0", "hello");
    const foreignSelection = selection(foreignProjection, 0);
    expect(() =>
      issueCompositionDeliveryToken(
        mismatch.projection,
        mismatch.rendered,
        foreignSelection,
        0n,
        1n,
        Symbol("adapter"),
      ),
    ).toThrow(TypeError);

    const detached = createFixture("detached", "0");
    detached.host.remove();
    expect(() => issue(detached, 0n, 1n, Symbol("adapter"))).toThrow(TypeError);

    const drifted = createFixture("drifted", "0");
    canonicalText(drifted.host).data = "tampered";
    expect(() => issue(drifted, 0n, 1n, Symbol("adapter"))).toThrow(TypeError);

    const scalars = createFixture("scalars", "0");
    expect(() => issue(scalars, -1n, 1n, Symbol("adapter"))).toThrow(TypeError);
    expect(() => issue(scalars, 0n, 0n, Symbol("adapter"))).toThrow(TypeError);
    expect(() => issue(scalars, 0n, MAX_U64 + 1n, Symbol("adapter"))).toThrow(TypeError);
  });

  it("is total for hostile values and rejects structural token lookalikes", () => {
    const fixture = createFixture("hostile", "0");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 0n, 1n, authority);
    const hostile = new Proxy({}, {
      get() {
        throw new Error("must not escape");
      },
    });
    const lookalike = { ...token } as unknown as CompositionDeliveryToken;

    for (const matcher of [
      compositionDeliveryTokenMatchesOpeningBase,
      compositionDeliveryTokenMatchesSettlement,
    ]) {
      expect(() =>
        matcher(
          hostile,
          fixture.projection,
          fixture.rendered,
          fixture.selection,
          0n,
          1n,
          authority,
        ),
      ).not.toThrow();
      expect(
        matcher(
          lookalike,
          fixture.projection,
          fixture.rendered,
          fixture.selection,
          0n,
          1n,
          authority,
        ),
      ).toBe(false);
      expect(
        matcher(token, hostile, hostile, hostile, hostile, hostile, hostile),
      ).toBe(false);
    }
  });

  it("exposes only a frozen opaque value and guards its hidden constructor", () => {
    const fixture = createFixture("opaque", "0");
    const authority = Symbol("composition-adapter");
    const token = issue(fixture, 0n, 1n, authority);

    expect(Object.isFrozen(token)).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(token))).toBe(true);
    expect(compositionDeliveryModule).not.toHaveProperty("CompositionDeliveryToken");

    const Constructor = Object.getPrototypeOf(token).constructor as new (
      ...args: unknown[]
    ) => unknown;
    expect(() =>
      new Constructor(
        fixture.projection,
        fixture.rendered,
        fixture.selection,
        0n,
        1n,
        authority,
      ),
    ).toThrow(TypeError);
  });
});

function issue(
  fixture: Fixture,
  observationEpoch: bigint,
  sessionId: bigint,
  authority: symbol,
): CompositionDeliveryToken {
  return issueCompositionDeliveryToken(
    fixture.projection,
    fixture.rendered,
    fixture.selection,
    observationEpoch,
    sessionId,
    authority,
  );
}

function openingMatches(
  token: unknown,
  fixture: Fixture,
  observationEpoch: unknown,
  sessionId: unknown,
  authority: unknown,
): token is CompositionDeliveryToken {
  return compositionDeliveryTokenMatchesOpeningBase(
    token,
    fixture.projection,
    fixture.rendered,
    fixture.selection,
    observationEpoch,
    sessionId,
    authority,
  );
}

function settlementMatches(
  token: unknown,
  fixture: Fixture,
  observationEpoch: unknown,
  sessionId: unknown,
  authority: unknown,
): token is CompositionDeliveryToken {
  return compositionDeliveryTokenMatchesSettlement(
    token,
    fixture.projection,
    fixture.rendered,
    fixture.selection,
    observationEpoch,
    sessionId,
    authority,
  );
}

function createFixture(lineage: string, revision: string): Fixture {
  const semantic = projection(lineage, revision, "hello");
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  document.body.append(host);
  const renderer = new BreditorDomRenderer();
  const rendered = renderValue(renderer.render(host, semantic)).rendered;
  return {
    projection: semantic,
    renderer,
    rendered,
    selection: selection(semantic, 2),
    host,
  };
}

function projection(
  lineage: string,
  revision: string,
  text: string,
): BaseDocumentProjection {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage, revision },
    paragraphs: [{ runs: [{ text, strong: false }] }],
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function selection(
  semantic: BaseDocumentProjection,
  offset: number,
): BaseRangeSelection {
  const result = BaseRangeSelection.create(semantic, {
    kind: "range",
    anchor: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: offset,
      affinity: "after",
    },
    focus: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: offset,
      affinity: "after",
    },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function canonicalText(host: HTMLElement): Text {
  const value = host.firstChild?.firstChild;
  if (!(value instanceof Text)) throw new Error("text fixture missing");
  return value;
}

function renderValue<T>(result: {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: Readonly<{ code: string }>;
}): T {
  if (!result.ok || result.value === undefined) {
    throw new Error(result.error?.code ?? "render failed");
  }
  return result.value;
}
