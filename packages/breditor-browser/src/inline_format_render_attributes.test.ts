import { describe, expect, it } from "vitest";

import type { InlineFormatPropertyProjection } from "./projection.js";
import type { BrowserProfileFormatDescriptor } from "./wasm_profile_descriptor.js";
import {
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_CLASS,
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_KIND,
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_REVISION,
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM,
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MINIMUM,
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_PROPERTY_NAME,
  INLINE_FORMAT_SAFE_INTEGER_TOKEN_V1_ATTRIBUTE,
  MAX_INLINE_FORMAT_SAFE_INTEGER_TOKEN_ASCII,
  MAX_INLINE_FORMAT_SAFE_INTEGER_TOKEN_ENTRIES,
  MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES,
  createInlineFormatRenderAttributePolicy,
  inlineFormatRenderAttributePolicyMatchesFormatDescriptor,
  inlineFormatRenderAttributesAreCanonicalForPolicy,
  inlineFormatRenderAttributesAreCanonicalSafeIntegerTokenV1,
  inlineFormatRenderAttributesAreCanonicalSafeLinkV1,
  inlineFormatRenderAttributesAreCanonicalSafeTextColorV1,
  resolveInlineFormatRenderAttributes,
} from "./inline_format_render_attributes.js";

const POLICY = createInlineFormatRenderAttributePolicy({
  kind: "safeLinkV1",
  hrefProperty: "example/href",
  openInNewWindowProperty: "example/open-in-new-window",
});

const TEXT_COLOR_POLICY = createInlineFormatRenderAttributePolicy({
  kind: "safeTextColorV1",
});

const INTEGER_TOKEN_POLICY = (() => {
  const policy = createInlineFormatRenderAttributePolicy({
    kind: "safeIntegerTokenV1",
    propertyName: "example/size",
    tokens: [
      { value: 1, token: "small" },
      { value: 2, token: "medium" },
      { value: 3, token: "large" },
    ],
  });
  if (policy.kind !== "safeIntegerTokenV1") {
    throw new Error("integer-token policy construction returned the wrong kind");
  }
  return policy;
})();

describe("inline-format render attributes", () => {
  it("copies and freezes only the exact safe-link policy", () => {
    const source = {
      kind: "safeLinkV1",
      hrefProperty: "example/href",
      openInNewWindowProperty: "example/open-in-new-window",
    };
    const policy = createInlineFormatRenderAttributePolicy(source);
    source.hrefProperty = "example/changed";
    expect(policy).toEqual({
      kind: "safeLinkV1",
      hrefProperty: "example/href",
      openInNewWindowProperty: "example/open-in-new-window",
    });
    expect(Object.isFrozen(policy)).toBe(true);

    for (const invalid of [
      null,
      [],
      {
        kind: "safeLinkV2",
        hrefProperty: "example/href",
        openInNewWindowProperty: "example/open",
      },
      {
        kind: "safeLinkV1",
        hrefProperty: "example/same",
        openInNewWindowProperty: "example/same",
      },
      {
        kind: "safeLinkV1",
        hrefProperty: "href",
        openInNewWindowProperty: "example/open",
      },
      {
        kind: "safeLinkV1",
        hrefProperty: "example/href",
        openInNewWindowProperty: "example/open",
        rel: "noopener",
      },
    ]) {
      expect(() => createInlineFormatRenderAttributePolicy(invalid)).toThrow();
    }
  });

  it("requires the exact closed two-property format descriptor", () => {
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        POLICY,
        linkDescriptor(),
      ),
    ).toBe(true);

    const cases: readonly BrowserProfileFormatDescriptor[] = [
      linkDescriptor({ hrefPresence: "optional" }),
      linkDescriptor({ hrefMinimum: 0 }),
      linkDescriptor({ hrefMinimum: 2 }),
      linkDescriptor({ hrefMaximum: 2_047 }),
      linkDescriptor({ hrefMaximum: 2_049 }),
      linkDescriptor({ hrefKind: "boolean" }),
      linkDescriptor({ openPresence: "optional" }),
      linkDescriptor({ openKind: "string" }),
      linkDescriptor({ openName: "example/other" }),
      linkDescriptor({ extraProperty: true }),
    ];
    for (const descriptor of cases) {
      expect(
        inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
          POLICY,
          descriptor,
        ),
      ).toBe(false);
    }
  });

  it("emits canonical same-window and protected new-window links", () => {
    const canonical = "https://example.com/b?q=one#fragment";
    const sameWindow = resolveInlineFormatRenderAttributes(
      POLICY,
      projectedProperties(
        "HTTPS://Example.COM:443/a/../b?q=one#fragment",
        false,
      ),
    );
    expect(sameWindow).toEqual([{ name: "href", value: canonical }]);

    const newWindow = resolveInlineFormatRenderAttributes(
      POLICY,
      projectedProperties("https://example.com/b?q=one#fragment", true),
    );
    expect(newWindow).toEqual([
      { name: "href", value: canonical },
      { name: "rel", value: "noopener noreferrer" },
      { name: "target", value: "_blank" },
    ]);
    expect(Object.isFrozen(newWindow)).toBe(true);
    for (const attribute of newWindow) expect(Object.isFrozen(attribute)).toBe(true);

    const prefix = "https://example.test/";
    const atLimit = `${prefix}${"x".repeat(
      MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES - prefix.length,
    )}`;
    expect(
      resolveInlineFormatRenderAttributes(
        POLICY,
        projectedProperties(atLimit, false),
      ),
    ).toEqual([{ name: "href", value: atLimit }]);

    for (const href of [
      "http://example.test/",
      "HTTPS://Example.COM:443/path@segment?q=user@example.test#@fragment",
      "https://[::1]/path",
      "https://xn--xample-9ua.test/path",
      "https://example.test/caf%C3%A9/é?q=%E2%9C%93#résumé",
    ]) {
      expect(
        resolveInlineFormatRenderAttributes(
          POLICY,
          projectedProperties(href, false),
        ),
      ).toEqual([{ name: "href", value: new URL(href).href }]);
    }
  });

  it("keeps URL decisions behind captured brand-checked getters", () => {
    const owner = urlDescriptorOwner("protocol");
    if (owner === null) throw new Error("URL protocol getter is unavailable");
    const original = Object.getOwnPropertyDescriptor(owner, "protocol");
    expect(original).toBeDefined();
    try {
      Object.defineProperty(owner, "protocol", {
        configurable: true,
        get: () => "javascript:",
      });
      expect(
        resolveInlineFormatRenderAttributes(
          POLICY,
          projectedProperties("https://example.test/path", false),
        ),
      ).toEqual([{ name: "href", value: "https://example.test/path" }]);
    } finally {
      if (original !== undefined) {
        Object.defineProperty(owner, "protocol", original);
      }
    }
  });

  it("fails closed for unsafe, malformed, or amplified stored href values", () => {
    expect(MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES).toBe(2_048);
    const unsafe = [
      "",
      "/relative",
      "//example.test/path",
      "https:example.test/path",
      "mailto:user@example.test",
      "javascript:alert(1)",
      "data:text/plain,hello",
      "https://@example.test/",
      "https://user@example.test/",
      "https://user:secret@example.test/",
      "http:///example.test/",
      "https:///example.test/",
      "https:////example.test/",
      "https:////@evil.com",
      "https:////:@evil.com",
      "https://?host=example.test",
      "https://#example.test",
      "https:\\example.test/path",
      "https://example.test\\path",
      "https://example.test\\@evil.test/path",
      "https://example test/",
      " https://example.test/",
      "https://example.test/a b",
      "https://example.test/?q=a b",
      "https://example.test/#a b",
      "https://example.test/ ",
      "https://example.test/a\tb",
      "https://example.test/a\nb",
      "https://example.test/\u00a0",
      "https://exa\u200bmple.test/",
      "https://exa\ufeffmple.test/",
      "https://ex%61mple.test/",
      "https://éxample.test/",
      "https://exa\u00admple.test/",
      "https://exa\u034fmple.test/",
      "https://exa\u2060mple.test/",
      "https://exa\ufe00mple.test/",
      "https://example.test/\ud800",
      `https://example.test/${"x".repeat(2_048)}`,
      `https://example.test/${"é".repeat(1_000)}`,
    ];
    for (const href of unsafe) {
      expect(
        resolveInlineFormatRenderAttributes(
          POLICY,
          projectedProperties(href, true),
        ),
      ).toEqual([]);
    }
  });

  it("fails closed for missing, duplicated, accessor, or ill-typed values", () => {
    expect(resolveInlineFormatRenderAttributes(POLICY, [])).toEqual([]);
    expect(
      resolveInlineFormatRenderAttributes(POLICY, [
        projectedProperty("example/href", "https://example.test/"),
      ]),
    ).toEqual([]);
    expect(
      resolveInlineFormatRenderAttributes(POLICY, [
        projectedProperty("example/href", "https://example.test/"),
        projectedProperty("example/href", "https://other.test/"),
        projectedProperty("example/open-in-new-window", true),
      ]),
    ).toEqual([]);
    expect(
      resolveInlineFormatRenderAttributes(POLICY, [
        projectedProperty("example/href", 7),
        projectedProperty("example/open-in-new-window", true),
      ]),
    ).toEqual([]);
    expect(
      resolveInlineFormatRenderAttributes(POLICY, [
        projectedProperty("example/href", "https://example.test/"),
        projectedProperty("example/open-in-new-window", "true"),
      ]),
    ).toEqual([]);
    expect(
      resolveInlineFormatRenderAttributes(POLICY, [
        ...projectedProperties("https://example.test/", true),
        projectedProperty("example/title", "discarded"),
      ]),
    ).toEqual([]);

    let reads = 0;
    const accessor = { name: "example/href" } as Record<string, unknown>;
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "https://example.test/";
      },
    });
    expect(
      resolveInlineFormatRenderAttributes(POLICY, [
        accessor as unknown as InlineFormatPropertyProjection,
        projectedProperty("example/open-in-new-window", true),
      ]),
    ).toEqual([]);
    expect(reads).toBe(0);
  });

  it("recognizes only exact ordered canonical safe-link outputs", () => {
    const href = { name: "href", value: "https://example.test/" } as const;
    expect(inlineFormatRenderAttributesAreCanonicalSafeLinkV1([])).toBe(true);
    expect(inlineFormatRenderAttributesAreCanonicalSafeLinkV1([href])).toBe(true);
    expect(
      inlineFormatRenderAttributesAreCanonicalSafeLinkV1([
        href,
        { name: "rel", value: "noopener noreferrer" },
        { name: "target", value: "_blank" },
      ]),
    ).toBe(true);

    for (const invalid of [
      [{ name: "href", value: "https://EXAMPLE.test" }],
      [{ name: "href", value: "https://user@example.test/" }],
      [{ name: "href", value: "javascript:alert(1)" }],
      [href, { name: "target", value: "_blank" }],
      [
        href,
        { name: "target", value: "_blank" },
        { name: "rel", value: "noopener noreferrer" },
      ],
      [
        href,
        { name: "rel", value: "noreferrer" },
        { name: "target", value: "_blank" },
      ],
      [
        href,
        { name: "rel", value: "noopener noreferrer" },
        { name: "target", value: "named-window" },
      ],
      [{ name: "class", value: "breditor-link" }],
      [{ ...href, hidden: true }],
    ]) {
      expect(inlineFormatRenderAttributesAreCanonicalSafeLinkV1(invalid)).toBe(
        false,
      );
    }

    const widened: unknown[] = [];
    Object.defineProperty(widened, "hidden", { value: true });
    expect(inlineFormatRenderAttributesAreCanonicalSafeLinkV1(widened)).toBe(
      false,
    );
  });

  it("owns only the zero-configuration safe text-color policy", () => {
    const source = { kind: "safeTextColorV1" } as const;
    const policy = createInlineFormatRenderAttributePolicy(source);
    expect(policy).toEqual({ kind: "safeTextColorV1" });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_KIND).toBe(
      "example/text-color",
    );
    expect(INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_REVISION).toBe(1);
    expect(INLINE_FORMAT_SAFE_TEXT_COLOR_V1_PROPERTY_NAME).toBe("example/rgb24");
    expect(INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MINIMUM).toBe(0);
    expect(INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM).toBe(0xff_ffff);
    expect(INLINE_FORMAT_SAFE_TEXT_COLOR_V1_CLASS).toBe("breditor-text-color");

    for (const invalid of [
      { kind: "safeTextColorV2" },
      { kind: "safeTextColorV1", rgb24Property: "example/rgb24" },
      { kind: "safeTextColorV1", style: "color:red" },
      { kind: "safeTextColorV1", [Symbol("hidden")]: true },
    ]) {
      expect(() => createInlineFormatRenderAttributePolicy(invalid)).toThrow();
    }

    let reads = 0;
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "kind", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "safeTextColorV1";
      },
    });
    expect(() => createInlineFormatRenderAttributePolicy(accessor)).toThrow();
    expect(reads).toBe(0);

    const privateMessage = "private-policy-trap-value";
    const hostile = new Proxy(Object.create(null) as Record<string, unknown>, {
      getOwnPropertyDescriptor() {
        throw new Error(privateMessage);
      },
    });
    let failure: unknown;
    try {
      createInlineFormatRenderAttributePolicy(hostile);
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(String(failure)).not.toContain(privateMessage);
  });

  it("requires the literal text-color format revision and RGB24 property contract", () => {
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        TEXT_COLOR_POLICY,
        textColorDescriptor(),
      ),
    ).toBe(true);

    for (const descriptor of [
      textColorDescriptor({ kind: "example/other" }),
      textColorDescriptor({ revision: 2 }),
      textColorDescriptor({ propertyName: "example/color" }),
      textColorDescriptor({ presence: "optional" }),
      textColorDescriptor({ valueKind: "boolean" }),
      textColorDescriptor({ minimum: -1 }),
      textColorDescriptor({ minimum: 1 }),
      textColorDescriptor({ maximum: 0xff_fffe }),
      textColorDescriptor({ maximum: 0x1_00_0000 }),
      textColorDescriptor({ extraProperty: true }),
    ]) {
      expect(
        inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
          TEXT_COLOR_POLICY,
          descriptor,
        ),
      ).toBe(false);
    }

    const widenedFormat = {
      ...textColorDescriptor(),
      rendererHint: "trusted",
    } as BrowserProfileFormatDescriptor;
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        TEXT_COLOR_POLICY,
        widenedFormat,
      ),
    ).toBe(false);

    const forgedPolicy = {
      kind: "safeTextColorV1",
      property: "example/rgb24",
    } as unknown as typeof TEXT_COLOR_POLICY;
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        forgedPolicy,
        textColorDescriptor(),
      ),
    ).toBe(false);
  });

  it("derives only canonical lowercase zero-padded RGB24 style text", () => {
    const cases = [
      [0, "color:#000000"],
      [1, "color:#000001"],
      [0x12_ab_ef, "color:#12abef"],
      [0xa0_b1_c2, "color:#a0b1c2"],
      [0xff_ffff, "color:#ffffff"],
    ] as const;
    for (const [rgb24, style] of cases) {
      const attributes = resolveInlineFormatRenderAttributes(
        TEXT_COLOR_POLICY,
        [projectedProperty("example/rgb24", rgb24)],
      );
      expect(attributes).toEqual([{ name: "style", value: style }]);
      expect(Object.isFrozen(attributes)).toBe(true);
      expect(Object.isFrozen(attributes[0])).toBe(true);
    }

    const originalToString = Number.prototype.toString;
    try {
      Number.prototype.toString = () => {
        throw new Error("number formatting must not be delegated");
      };
      expect(
        resolveInlineFormatRenderAttributes(TEXT_COLOR_POLICY, [
          projectedProperty("example/rgb24", 0xab_cdef),
        ]),
      ).toEqual([{ name: "style", value: "color:#abcdef" }]);
    } finally {
      Number.prototype.toString = originalToString;
    }
  });

  it("fails text-color resolution closed for every non-RGB24 projection shape", () => {
    const invalidValues: readonly unknown[] = [
      -1,
      -0,
      0x1_00_0000,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "16711680",
      "#ff0000",
      "red",
      "0; background:url(javascript:alert(1))",
      true,
      null,
    ];
    for (const value of invalidValues) {
      expect(
        resolveInlineFormatRenderAttributes(TEXT_COLOR_POLICY, [
          { name: "example/rgb24", value } as InlineFormatPropertyProjection,
        ]),
      ).toEqual([]);
    }

    for (const properties of [
      [],
      [projectedProperty("example/color", 0xff_0000)],
      [
        projectedProperty("example/rgb24", 0xff_0000),
        projectedProperty("example/rgb24", 0x00_ff00),
      ],
      [
        projectedProperty("example/rgb24", 0xff_0000),
        projectedProperty("example/ignored", 0),
      ],
    ]) {
      expect(
        resolveInlineFormatRenderAttributes(TEXT_COLOR_POLICY, properties),
      ).toEqual([]);
    }

    const widened = [projectedProperty("example/rgb24", 0xff_0000)];
    Object.defineProperty(widened, "hidden", { value: "color:red" });
    expect(resolveInlineFormatRenderAttributes(TEXT_COLOR_POLICY, widened)).toEqual(
      [],
    );
    expect(
      resolveInlineFormatRenderAttributes(TEXT_COLOR_POLICY, [{
        name: "example/rgb24",
        value: 0xff_0000,
        css: "background:url(javascript:alert(1))",
      } as unknown as InlineFormatPropertyProjection]),
    ).toEqual([]);
  });

  it("admits only the one canonical text-color style attribute", () => {
    const canonical = [{ name: "style", value: "color:#00a1ff" }] as const;
    expect(
      inlineFormatRenderAttributesAreCanonicalSafeTextColorV1(canonical),
    ).toBe(true);
    expect(
      inlineFormatRenderAttributesAreCanonicalForPolicy(
        TEXT_COLOR_POLICY,
        canonical,
      ),
    ).toBe(true);

    for (const invalid of [
      [],
      [{ name: "style", value: "color:#00A1FF" }],
      [{ name: "style", value: "color: #00a1ff" }],
      [{ name: "style", value: "color:#00a1ff;" }],
      [{ name: "style", value: "color:#0af" }],
      [{ name: "style", value: "color:rgb(0,161,255)" }],
      [{ name: "style", value: "background:#00a1ff" }],
      [{ name: "style", value: "color:#00a1ff;background:url(x)" }],
      [{ name: "onclick", value: "alert(1)" }],
      [
        { name: "style", value: "color:#00a1ff" },
        { name: "title", value: "extra" },
      ],
      [{ name: "style", value: "color:#00a1ff", hidden: true }],
    ]) {
      expect(
        inlineFormatRenderAttributesAreCanonicalSafeTextColorV1(invalid),
      ).toBe(false);
    }

    const widened = [...canonical] as unknown[];
    Object.defineProperty(widened, "hidden", { value: true });
    expect(
      inlineFormatRenderAttributesAreCanonicalSafeTextColorV1(widened),
    ).toBe(false);
    expect(
      inlineFormatRenderAttributesAreCanonicalForPolicy(POLICY, canonical),
    ).toBe(false);

    let reads = 0;
    const accessor = { name: "style" } as Record<string, unknown>;
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "color:#00a1ff";
      },
    });
    expect(
      inlineFormatRenderAttributesAreCanonicalSafeTextColorV1([accessor]),
    ).toBe(false);
    expect(reads).toBe(0);
  });

  it("snapshots an exact bounded contiguous safe integer-token policy", () => {
    const source = {
      kind: "safeIntegerTokenV1" as const,
      propertyName: "example/size",
      tokens: [
        { value: -2, token: "size_xs" },
        { value: -1, token: "size-sm" },
        { value: 0, token: "size-md" },
      ],
    };
    const policy = createInlineFormatRenderAttributePolicy(source);
    source.propertyName = "example/changed";
    source.tokens[0]!.token = "changed";
    source.tokens.push({ value: 1, token: "size-lg" });

    expect(policy).toEqual({
      kind: "safeIntegerTokenV1",
      propertyName: "example/size",
      tokens: [
        { value: -2, token: "size_xs" },
        { value: -1, token: "size-sm" },
        { value: 0, token: "size-md" },
      ],
    });
    expect(MAX_INLINE_FORMAT_SAFE_INTEGER_TOKEN_ENTRIES).toBe(32);
    expect(MAX_INLINE_FORMAT_SAFE_INTEGER_TOKEN_ASCII).toBe(64);
    expect(INLINE_FORMAT_SAFE_INTEGER_TOKEN_V1_ATTRIBUTE).toBe(
      "data-breditor-integer-token",
    );
    expect(Object.isFrozen(policy)).toBe(true);
    if (policy.kind !== "safeIntegerTokenV1") {
      throw new Error("integer-token policy fixture failed");
    }
    expect(Object.isFrozen(policy.tokens)).toBe(true);
    for (const entry of policy.tokens) expect(Object.isFrozen(entry)).toBe(true);
  });

  it("rejects malformed, sparse, widened, and hostile integer-token declarations", () => {
    const declaration = (tokens: unknown, extra: object = {}): unknown => ({
      kind: "safeIntegerTokenV1",
      propertyName: "example/size",
      tokens,
      ...extra,
    });
    const tooMany = Array.from(
      { length: MAX_INLINE_FORMAT_SAFE_INTEGER_TOKEN_ENTRIES + 1 },
      (_, index) => ({ value: index, token: `size-${index}` }),
    );
    const sparse = new Array(2);
    sparse[0] = { value: 1, token: "one" };
    const widened = [{ value: 1, token: "one" }];
    Object.defineProperty(widened, "hidden", { value: true });
    for (const invalid of [
      declaration([]),
      declaration(tooMany),
      declaration(sparse),
      declaration(widened),
      declaration([{ value: -0, token: "zero" }]),
      declaration([{ value: 1.5, token: "fraction" }]),
      declaration([{ value: Number.MAX_SAFE_INTEGER + 1, token: "unsafe" }]),
      declaration([{ value: 1, token: "one" }, { value: 3, token: "three" }]),
      declaration([{ value: 2, token: "two" }, { value: 1, token: "one" }]),
      declaration([{ value: 1, token: "same" }, { value: 2, token: "same" }]),
      declaration([{ value: 1, token: "Upper" }]),
      declaration([{ value: 1, token: "1-first" }]),
      declaration([{ value: 1, token: "bad.token" }]),
      declaration([{ value: 1, token: `a${"x".repeat(64)}` }]),
      declaration([{ value: 1, token: "one", css: "font-size:999px" }]),
      declaration([{ value: 1, token: "one" }], { css: "font-size:999px" }),
      {
        kind: "safeIntegerTokenV1",
        propertyName: "not-qualified",
        tokens: [{ value: 1, token: "one" }],
      },
    ]) {
      expect(() => createInlineFormatRenderAttributePolicy(invalid)).toThrow();
    }

    let reads = 0;
    const accessor = { value: 1 } as Record<string, unknown>;
    Object.defineProperty(accessor, "token", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "one";
      },
    });
    expect(() =>
      createInlineFormatRenderAttributePolicy(declaration([accessor]))
    ).toThrow(/own data properties/u);
    expect(reads).toBe(0);

    const privateMessage = "private-integer-token-trap";
    const hostileTokens = new Proxy([{ value: 1, token: "one" }], {
      ownKeys() {
        throw new Error(privateMessage);
      },
    });
    let failure: unknown;
    try {
      createInlineFormatRenderAttributePolicy(declaration(hostileTokens));
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(String(failure)).not.toContain(privateMessage);
  });

  it("matches only the exhaustive one-property integer descriptor", () => {
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        INTEGER_TOKEN_POLICY,
        integerTokenDescriptor(),
      ),
    ).toBe(true);
    // The generic policy is structurally reusable across schema-owned format
    // revisions; the render recipe and compiled profile bind the format kind.
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        INTEGER_TOKEN_POLICY,
        integerTokenDescriptor({ revision: 2 }),
      ),
    ).toBe(true);

    for (const descriptor of [
      integerTokenDescriptor({ kind: 42 }),
      integerTokenDescriptor({ kind: "invalid" }),
      integerTokenDescriptor({ revision: "1" }),
      integerTokenDescriptor({ revision: 0 }),
      integerTokenDescriptor({ revision: -0 }),
      integerTokenDescriptor({ revision: 1.5 }),
      integerTokenDescriptor({ revision: 0x1_0000_0000 }),
      integerTokenDescriptor({ propertyName: "example/other" }),
      integerTokenDescriptor({ presence: "optional" }),
      integerTokenDescriptor({ valueKind: "boolean" }),
      integerTokenDescriptor({ minimum: null }),
      integerTokenDescriptor({ maximum: null }),
      integerTokenDescriptor({ minimum: 0 }),
      integerTokenDescriptor({ minimum: 2 }),
      integerTokenDescriptor({ maximum: 2 }),
      integerTokenDescriptor({ maximum: 4 }),
      integerTokenDescriptor({ extraProperty: true }),
    ]) {
      expect(
        inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
          INTEGER_TOKEN_POLICY,
          descriptor,
        ),
      ).toBe(false);
    }

    const widened = {
      ...integerTokenDescriptor(),
      rendererHint: "integer-token",
    } as BrowserProfileFormatDescriptor;
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        INTEGER_TOKEN_POLICY,
        widened,
      ),
    ).toBe(false);

    const hostile = new Proxy(integerTokenDescriptor(), {
      ownKeys() {
        throw new Error("private-descriptor-trap");
      },
    });
    expect(
      inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
        INTEGER_TOKEN_POLICY,
        hostile,
      ),
    ).toBe(false);
  });

  it("resolves and inversely admits only declared inert integer tokens", () => {
    const attributes = resolveInlineFormatRenderAttributes(
      INTEGER_TOKEN_POLICY,
      [projectedProperty("example/size", 2)],
    );
    expect(attributes).toEqual([{
      name: "data-breditor-integer-token",
      value: "medium",
    }]);
    expect(Object.isFrozen(attributes)).toBe(true);
    expect(Object.isFrozen(attributes[0])).toBe(true);
    expect(
      inlineFormatRenderAttributesAreCanonicalSafeIntegerTokenV1(
        INTEGER_TOKEN_POLICY,
        attributes,
      ),
    ).toBe(true);
    expect(
      inlineFormatRenderAttributesAreCanonicalForPolicy(
        INTEGER_TOKEN_POLICY,
        attributes,
      ),
    ).toBe(true);

    for (const properties of [
      [],
      [projectedProperty("example/other", 2)],
      [projectedProperty("example/size", 0)],
      [projectedProperty("example/size", 4)],
      [projectedProperty("example/size", -0)],
      [projectedProperty("example/size", 2.5)],
      [projectedProperty("example/size", "2")],
      [projectedProperty("example/size", 2), projectedProperty("example/size", 2)],
      [projectedProperty("example/size", 2), projectedProperty("example/other", 1)],
    ]) {
      expect(
        resolveInlineFormatRenderAttributes(
          INTEGER_TOKEN_POLICY,
          properties as readonly InlineFormatPropertyProjection[],
        ),
      ).toEqual([]);
    }

    for (const invalid of [
      [],
      [{ name: "data-breditor-integer-token", value: "unknown" }],
      [{ name: "data-breditor-integer-token", value: "Medium" }],
      [{ name: "class", value: "medium" }],
      [{ name: "style", value: "font-size:medium" }],
      [{ name: "data-breditor-integer-token", value: "medium", extra: true }],
      [
        { name: "data-breditor-integer-token", value: "medium" },
        { name: "title", value: "extra" },
      ],
    ]) {
      expect(
        inlineFormatRenderAttributesAreCanonicalSafeIntegerTokenV1(
          INTEGER_TOKEN_POLICY,
          invalid,
        ),
      ).toBe(false);
      expect(
        inlineFormatRenderAttributesAreCanonicalForPolicy(
          INTEGER_TOKEN_POLICY,
          invalid,
        ),
      ).toBe(false);
    }
  });
});

interface DescriptorOverrides {
  readonly hrefPresence?: "required" | "optional";
  readonly hrefMinimum?: number;
  readonly hrefMaximum?: number;
  readonly hrefKind?: "string" | "boolean";
  readonly openPresence?: "required" | "optional";
  readonly openKind?: "boolean" | "string";
  readonly openName?: string;
  readonly extraProperty?: boolean;
}

function linkDescriptor(
  overrides: DescriptorOverrides = {},
): BrowserProfileFormatDescriptor {
  const hrefValueType = overrides.hrefKind === "boolean"
    ? ({ kind: "boolean" } as const)
    : ({
      kind: "string",
      minimumUtf8Bytes: overrides.hrefMinimum ?? 1,
      maximumUtf8Bytes: overrides.hrefMaximum ?? 2_048,
    } as const);
  const openValueType = overrides.openKind === "string"
    ? ({ kind: "string", minimumUtf8Bytes: 0, maximumUtf8Bytes: 8 } as const)
    : ({ kind: "boolean" } as const);
  const properties = [
    {
      name: "example/href",
      presence: overrides.hrefPresence ?? "required",
      valueType: hrefValueType,
    },
    {
      name: overrides.openName ?? "example/open-in-new-window",
      presence: overrides.openPresence ?? "required",
      valueType: openValueType,
    },
  ];
  if (overrides.extraProperty === true) {
    properties.push({
      name: "example/title",
      presence: "optional",
      valueType: { kind: "string", minimumUtf8Bytes: 0, maximumUtf8Bytes: 32 },
    });
  }
  return {
    kind: "example/link",
    revision: 1,
    properties,
  } as BrowserProfileFormatDescriptor;
}

interface TextColorDescriptorOverrides {
  readonly kind?: string;
  readonly revision?: number;
  readonly propertyName?: string;
  readonly presence?: "required" | "optional";
  readonly valueKind?: "integer" | "boolean";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly extraProperty?: boolean;
}

function textColorDescriptor(
  overrides: TextColorDescriptorOverrides = {},
): BrowserProfileFormatDescriptor {
  const valueType = overrides.valueKind === "boolean"
    ? { kind: "boolean" as const }
    : {
      kind: "integer" as const,
      minimum: overrides.minimum ?? 0,
      maximum: overrides.maximum ?? 0xff_ffff,
    };
  const properties: BrowserProfileFormatDescriptor["properties"][number][] = [
    {
      name: overrides.propertyName ?? "example/rgb24",
      presence: overrides.presence ?? "required",
      valueType,
    },
  ];
  if (overrides.extraProperty === true) {
    properties.push({
      name: "example/extra",
      presence: "optional",
      valueType: { kind: "boolean" },
    });
  }
  return {
    kind: overrides.kind ?? "example/text-color",
    revision: overrides.revision ?? 1,
    properties,
  };
}

interface IntegerTokenDescriptorOverrides {
  readonly kind?: unknown;
  readonly revision?: unknown;
  readonly propertyName?: string;
  readonly presence?: "required" | "optional";
  readonly valueKind?: "integer" | "boolean";
  readonly minimum?: number | null;
  readonly maximum?: number | null;
  readonly extraProperty?: boolean;
}

function integerTokenDescriptor(
  overrides: IntegerTokenDescriptorOverrides = {},
): BrowserProfileFormatDescriptor {
  const valueType = overrides.valueKind === "boolean"
    ? { kind: "boolean" as const }
    : {
      kind: "integer" as const,
      minimum: overrides.minimum === undefined ? 1 : overrides.minimum,
      maximum: overrides.maximum === undefined ? 3 : overrides.maximum,
    };
  const properties: BrowserProfileFormatDescriptor["properties"][number][] = [
    {
      name: overrides.propertyName ?? "example/size",
      presence: overrides.presence ?? "required",
      valueType,
    },
  ];
  if (overrides.extraProperty === true) {
    properties.push({
      name: "example/extra",
      presence: "optional",
      valueType: { kind: "boolean" },
    });
  }
  return {
    kind: overrides.kind === undefined
      ? "example/text-size"
      : overrides.kind as string,
    revision: overrides.revision === undefined
      ? 1
      : overrides.revision as number,
    properties,
  };
}

function projectedProperties(
  href: string,
  openInNewWindow: boolean,
): readonly InlineFormatPropertyProjection[] {
  return [
    projectedProperty("example/href", href),
    projectedProperty("example/open-in-new-window", openInNewWindow),
  ];
}

function projectedProperty(
  name: string,
  value: string | boolean | number,
): InlineFormatPropertyProjection {
  return { name, value };
}

function urlDescriptorOwner(name: string): object | null {
  let current: object | null = URL.prototype;
  for (let depth = 0; depth < 4 && current !== null; depth += 1) {
    if (Object.getOwnPropertyDescriptor(current, name) !== undefined) {
      return current;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return null;
}
