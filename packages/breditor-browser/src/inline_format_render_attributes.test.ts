import { describe, expect, it } from "vitest";

import type { InlineFormatPropertyProjection } from "./projection.js";
import type { BrowserProfileFormatDescriptor } from "./wasm_profile_descriptor.js";
import {
  MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES,
  createInlineFormatRenderAttributePolicy,
  inlineFormatRenderAttributePolicyMatchesFormatDescriptor,
  inlineFormatRenderAttributesAreCanonicalSafeLinkV1,
  resolveInlineFormatRenderAttributes,
} from "./inline_format_render_attributes.js";

const POLICY = createInlineFormatRenderAttributePolicy({
  kind: "safeLinkV1",
  hrefProperty: "example/href",
  openInNewWindowProperty: "example/open-in-new-window",
});

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
