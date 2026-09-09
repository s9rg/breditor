import { describe, expect, it } from "vitest";

import {
  browserPresentationMatchesProfile,
  browserPresentationOwnsIdentity,
  browserPresentationRecipeForFormat,
  compileBrowserPresentation,
  isOwnedBrowserCompiledPresentation,
  isOwnedBrowserPresentationIdentity,
} from "./compiled_browser_presentation.js";
import {
  DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
  createInlineFormatRenderManifest,
  type InlineFormatRenderManifest,
} from "./inline_format_render_manifest.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

const FINGERPRINT =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

class Generation implements WasmProfileGenerationView {
  #live = true;

  constructor(readonly token: object = Object.freeze({})) {}

  matches(other: WasmProfileGenerationView): boolean {
    return this.#live &&
      other instanceof Generation &&
      other.#live &&
      other.token === this.token;
  }

  free(): void {
    this.#live = false;
  }

  clone(): Generation {
    return new Generation(this.token);
  }
}

describe("compiled browser presentation", () => {
  it("binds the default recipe to the base strong format", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, ["breditor/strong"]);

    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
    );

    expect(presentation.profileDescriptor).toBe(descriptor);
    expect(presentation.manifest).toBe(DEFAULT_INLINE_FORMAT_RENDER_MANIFEST);
    expect(presentation.recipesOuterToInner.map(({ formatKind }) => formatKind))
      .toEqual(["breditor/strong"]);
    expect(isOwnedBrowserCompiledPresentation(presentation)).toBe(true);
    expect(isOwnedBrowserPresentationIdentity(presentation.identity)).toBe(true);
    expect(browserPresentationOwnsIdentity(presentation, presentation.identity))
      .toBe(true);
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.recipesOuterToInner)).toBe(true);
    expect(Object.isFrozen(presentation.identity)).toBe(true);
    expect(Object.getPrototypeOf(presentation.identity)).toBeNull();
    expect(Reflect.ownKeys(presentation.identity)).toEqual([]);
  });

  it("uses graph order with lexical zero-indegree tie-breaking", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, [
      "example/alpha",
      "example/beta",
      "example/delta",
      "example/gamma",
    ]);
    const manifest = createInlineFormatRenderManifest({
      recipes: [
        {
          formatKind: "example/gamma",
          element: "mark",
          after: ["example/beta"],
        },
        {
          formatKind: "example/delta",
          element: "strong",
          before: ["example/beta"],
        },
        {
          formatKind: "example/beta",
          element: "em",
        },
        {
          formatKind: "example/alpha",
          element: "span",
          classes: ["alpha"],
        },
      ],
    });

    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      manifest,
    );

    expect(presentation.recipesOuterToInner.map(({ formatKind }) => formatKind))
      .toEqual([
        "example/alpha",
        "example/delta",
        "example/beta",
        "example/gamma",
      ]);
    expect(
      browserPresentationRecipeForFormat(presentation, "example/alpha"),
    ).toBe(manifest.recipes[0]);
    expect(
      browserPresentationRecipeForFormat(presentation, "example/missing"),
    ).toBeUndefined();
  });

  it("is independent of manifest and edge-array registration order", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, [
      "example/alpha",
      "example/beta",
      "example/delta",
    ]);
    const first = createInlineFormatRenderManifest({
      recipes: [
        {
          formatKind: "example/delta",
          element: "mark",
          after: ["example/alpha", "example/beta"],
        },
        { formatKind: "example/beta", element: "em" },
        {
          formatKind: "example/alpha",
          element: "span",
          classes: ["zeta", "alpha"],
        },
      ],
    });
    const second = createInlineFormatRenderManifest({
      recipes: [
        {
          formatKind: "example/alpha",
          element: "span",
          classes: ["alpha", "zeta"],
        },
        { formatKind: "example/beta", element: "em" },
        {
          formatKind: "example/delta",
          element: "mark",
          after: ["example/beta", "example/alpha"],
        },
      ],
    });

    const left = compileBrowserPresentation(generation, descriptor, first);
    const right = compileBrowserPresentation(generation, descriptor, second);

    expect(first).toEqual(second);
    expect(left.recipesOuterToInner.map(({ formatKind }) => formatKind)).toEqual(
      right.recipesOuterToInner.map(({ formatKind }) => formatKind),
    );
    expect(left.identity).not.toBe(right.identity);
  });

  it("requires exact profile coverage", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, [
      "example/alpha",
      "example/beta",
    ]);
    const missing = renderManifest([
      { formatKind: "example/alpha", element: "span", classes: ["alpha"] },
    ]);
    const extra = renderManifest([
      { formatKind: "example/alpha", element: "span", classes: ["alpha"] },
      { formatKind: "example/extra", element: "em" },
    ]);

    expect(() =>
      compileBrowserPresentation(generation, descriptor, missing),
    ).toThrow(/coverage/u);
    expect(() =>
      compileBrowserPresentation(generation, descriptor, extra),
    ).toThrow(/coverage/u);
  });

  it("requires the descriptor's exact opaque generation correlation", () => {
    const sourceGeneration = new Generation();
    const descriptor = ownedDescriptor(sourceGeneration, ["example/alpha"]);
    const manifest = renderManifest([
      { formatKind: "example/alpha", element: "span", classes: ["alpha"] },
    ]);
    const matchingClone = sourceGeneration.clone();

    expect(() =>
      compileBrowserPresentation(matchingClone, descriptor, manifest),
    ).not.toThrow();
    expect(() =>
      compileBrowserPresentation(new Generation(), descriptor, manifest),
    ).toThrow(/does not match the generation/u);

    sourceGeneration.free();
    expect(() =>
      compileBrowserPresentation(matchingClone, descriptor, manifest),
    ).toThrow(/does not match the generation/u);
  });

  it("requires unique canonical element-and-class DOM signatures", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, [
      "example/alpha",
      "example/beta",
    ]);
    const collision = renderManifest([
      {
        formatKind: "example/alpha",
        element: "span",
        classes: ["mark", "primary"],
      },
      {
        formatKind: "example/beta",
        element: "span",
        classes: ["primary", "mark"],
      },
    ]);
    expect(() =>
      compileBrowserPresentation(generation, descriptor, collision),
    ).toThrow(/DOM signature/u);

    const distinct = renderManifest([
      {
        formatKind: "example/alpha",
        element: "span",
        classes: ["alpha"],
      },
      {
        formatKind: "example/beta",
        element: "span",
        classes: ["beta"],
      },
    ]);
    expect(() =>
      compileBrowserPresentation(generation, descriptor, distinct),
    ).not.toThrow();
  });

  it("rejects absent targets, duplicate semantic edges, and cycles", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, [
      "example/alpha",
      "example/beta",
    ]);
    const absent = renderManifest([
      {
        formatKind: "example/alpha",
        element: "span",
        classes: ["alpha"],
        before: ["example/missing"],
      },
      { formatKind: "example/beta", element: "em" },
    ]);
    const duplicate = renderManifest([
      {
        formatKind: "example/alpha",
        element: "span",
        classes: ["alpha"],
        before: ["example/beta"],
      },
      {
        formatKind: "example/beta",
        element: "em",
        after: ["example/alpha"],
      },
    ]);
    const cycle = renderManifest([
      {
        formatKind: "example/alpha",
        element: "span",
        classes: ["alpha"],
        before: ["example/beta"],
      },
      {
        formatKind: "example/beta",
        element: "em",
        before: ["example/alpha"],
      },
    ]);

    expect(() =>
      compileBrowserPresentation(generation, descriptor, absent),
    ).toThrow(/target is absent/u);
    expect(() =>
      compileBrowserPresentation(generation, descriptor, duplicate),
    ).toThrow(/relationship is duplicated/u);
    expect(() =>
      compileBrowserPresentation(generation, descriptor, cycle),
    ).toThrow(/cycle/u);
  });

  it("rejects unowned declarations and a dead generation", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, ["example/alpha"]);
    const manifest = renderManifest([
      { formatKind: "example/alpha", element: "span", classes: ["alpha"] },
    ]);
    const rawManifest = {
      recipes: manifest.recipes,
    } as InlineFormatRenderManifest;
    const clonedDescriptor = {
      ...descriptor,
    } as BrowserCompiledProfileDescriptor;

    expect(() =>
      compileBrowserPresentation(generation, descriptor, rawManifest),
    ).toThrow(/manifest is not owned/u);
    expect(() =>
      compileBrowserPresentation(generation, clonedDescriptor, manifest),
    ).toThrow(/descriptor is not owned/u);
    generation.free();
    expect(() =>
      compileBrowserPresentation(generation, descriptor, manifest),
    ).toThrow(/generation is invalid/u);
  });

  it("matches the exact descriptor and opaque profile generation", () => {
    const generation = new Generation();
    const descriptor = ownedDescriptor(generation, ["example/alpha"]);
    const manifest = renderManifest([
      { formatKind: "example/alpha", element: "span", classes: ["alpha"] },
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      manifest,
    );
    const matchingClone = generation.clone();
    const otherGeneration = new Generation();
    const equivalentDescriptor = ownedDescriptor(generation, ["example/alpha"]);

    expect(
      browserPresentationMatchesProfile(
        presentation,
        matchingClone,
        descriptor,
      ),
    ).toBe(true);
    expect(
      browserPresentationMatchesProfile(
        presentation,
        otherGeneration,
        descriptor,
      ),
    ).toBe(false);
    expect(
      browserPresentationMatchesProfile(
        presentation,
        generation,
        equivalentDescriptor,
      ),
    ).toBe(false);
    expect(browserPresentationOwnsIdentity(presentation, Object.freeze({})))
      .toBe(false);
    generation.free();
    expect(
      browserPresentationMatchesProfile(
        presentation,
        matchingClone,
        descriptor,
      ),
    ).toBe(false);
  });
});

function renderManifest(recipes: readonly unknown[]): InlineFormatRenderManifest {
  return createInlineFormatRenderManifest({ recipes: [...recipes] });
}

function ownedDescriptor(
  generation: WasmProfileGenerationView,
  formatKinds: readonly string[],
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: FINGERPRINT,
    formatCount: formatKinds.length,
    intentCount: 0,
    actionStateCount: 0,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    formatKind: (index) => formatKinds[index],
    formatRevision: (index) =>
      index >= 0 && index < formatKinds.length ? 1 : undefined,
    formatPropertyCount: (index) =>
      index >= 0 && index < formatKinds.length ? 0 : undefined,
    formatPropertyName: absent,
    formatPropertyPresence: absent,
    formatPropertyValueType: absent,
    formatPropertyIntegerMinimum: absent,
    formatPropertyIntegerMaximum: absent,
    formatPropertyStringMinimumUtf8Bytes: absent,
    formatPropertyStringMaximumUtf8Bytes: absent,
    intentId: absent,
    intentInputKind: absent,
    intentInputContractName: absent,
    intentInputContractVersion: absent,
    intentActivationContract: absent,
    intentValueContractName: absent,
    intentValueContractVersion: absent,
    actionStateId: absent,
    actionStateSourceKind: absent,
    actionStateSourceActionId: absent,
    actionStateSourceIntentId: absent,
    actionStateHistoryDirection: absent,
    actionStateActivationContract: absent,
    actionStateValueContractName: absent,
    actionStateValueContractVersion: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!result.ok) throw new Error("test descriptor was rejected");
  return result.descriptor;
}
