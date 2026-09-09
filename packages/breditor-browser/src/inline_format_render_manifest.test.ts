import { describe, expect, it } from "vitest";

import {
  DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
  INLINE_FORMAT_RENDER_ELEMENTS,
  MAX_INLINE_FORMAT_RENDER_CLASSES_PER_RECIPE,
  MAX_INLINE_FORMAT_RENDER_CLASS_TOKEN_ASCII,
  MAX_INLINE_FORMAT_RENDER_FORMAT_KIND_ASCII,
  MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES,
  MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES_PER_RECIPE,
  MAX_INLINE_FORMAT_RENDER_RECIPES,
  createInlineFormatRenderManifest,
  isOwnedInlineFormatRenderManifest,
} from "./inline_format_render_manifest.js";

describe("inline-format render manifest", () => {
  it("defines the canonical frozen built-in strong recipe", () => {
    expect(DEFAULT_INLINE_FORMAT_RENDER_MANIFEST).toEqual({
      recipes: [
        {
          formatKind: "breditor/strong",
          element: "strong",
          classes: [],
          before: [],
          after: [],
        },
      ],
    });
    expect(
      isOwnedInlineFormatRenderManifest(
        DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
      ),
    ).toBe(true);
    expect(Object.isFrozen(DEFAULT_INLINE_FORMAT_RENDER_MANIFEST)).toBe(true);
    expect(
      Object.isFrozen(DEFAULT_INLINE_FORMAT_RENDER_MANIFEST.recipes),
    ).toBe(true);
    const recipe = DEFAULT_INLINE_FORMAT_RENDER_MANIFEST.recipes[0];
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(recipe?.classes)).toBe(true);
    expect(Object.isFrozen(recipe?.before)).toBe(true);
    expect(Object.isFrozen(recipe?.after)).toBe(true);
  });

  it("copies, canonicalizes, and freezes only the exact inert schema", () => {
    const source = {
      recipes: [
        {
          formatKind: "example/zeta",
          element: "span",
          classes: ["zeta", "alpha"],
          before: ["example/zulu", "example/beta"],
          after: ["example/theta", "example/delta"],
        },
        {
          formatKind: "example/alpha",
          element: "em",
        },
      ],
    };

    const manifest = createInlineFormatRenderManifest(source);
    source.recipes[0]!.formatKind = "example/changed";
    source.recipes[0]!.classes?.push("changed");

    expect(manifest).toEqual({
      recipes: [
        {
          formatKind: "example/alpha",
          element: "em",
          classes: [],
          before: [],
          after: [],
        },
        {
          formatKind: "example/zeta",
          element: "span",
          classes: ["alpha", "zeta"],
          before: ["example/beta", "example/zulu"],
          after: ["example/delta", "example/theta"],
        },
      ],
    });
    expect(isOwnedInlineFormatRenderManifest(manifest)).toBe(true);
    for (const recipe of manifest.recipes) {
      expect(Object.isFrozen(recipe)).toBe(true);
      expect(Object.isFrozen(recipe.classes)).toBe(true);
      expect(Object.isFrozen(recipe.before)).toBe(true);
      expect(Object.isFrozen(recipe.after)).toBe(true);
    }
  });

  it("owns the one exact canonical safe-link recipe", () => {
    const source = {
      recipes: [
        {
          formatKind: "example/link",
          element: "a",
          classes: ["breditor-link"],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: "example/href",
            openInNewWindowProperty: "example/open-in-new-window",
          },
        },
      ],
    };
    const manifest = createInlineFormatRenderManifest(source);
    source.recipes[0]!.attributes.hrefProperty = "example/changed";

    expect(manifest).toEqual({
      recipes: [
        {
          formatKind: "example/link",
          element: "a",
          classes: ["breditor-link"],
          before: [],
          after: [],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: "example/href",
            openInNewWindowProperty: "example/open-in-new-window",
          },
        },
      ],
    });
    expect(Object.isFrozen(manifest.recipes[0]?.attributes)).toBe(true);
  });

  it("admits only the closed safe inline element vocabulary", () => {
    for (const element of INLINE_FORMAT_RENDER_ELEMENTS) {
      expect(() =>
        createInlineFormatRenderManifest({
          recipes: [element === "a"
            ? {
              formatKind: "example/format",
              element,
              classes: ["breditor-link"],
              attributes: {
                kind: "safeLinkV1",
                hrefProperty: "example/href",
                openInNewWindowProperty: "example/open",
              },
            }
            : { formatKind: "example/format", element }],
        }),
      ).not.toThrow();
    }
    for (const element of ["b", "div", "img", "script", "STYLE", "x-widget"]) {
      expect(() =>
        createInlineFormatRenderManifest({
          recipes: [{ formatKind: "example/format", element }],
        }),
      ).toThrow(/element/u);
    }
  });

  it("keeps the security-bearing link element, class, and policy inseparable", () => {
    const attributes = {
      kind: "safeLinkV1",
      hrefProperty: "example/href",
      openInNewWindowProperty: "example/open",
    };
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: "example/link", element: "a" }],
      }),
    ).toThrow(/requires safeLinkV1/u);
    for (const classes of [
      [],
      ["custom-link"],
      ["breditor-link", "custom-link"],
    ]) {
      expect(() =>
        createInlineFormatRenderManifest({
          recipes: [
            {
              formatKind: "example/link",
              element: "a",
              classes,
              attributes,
            },
          ],
        }),
      ).toThrow(/canonical class/u);
    }
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/link",
            element: "span",
            attributes,
          },
        ],
      }),
    ).toThrow(/only on link/u);
  });

  it("rejects widened, aliased, or executable safe-link policies", () => {
    const recipe = (attributes: unknown): unknown => ({
      formatKind: "example/link",
      element: "a",
      classes: ["breditor-link"],
      attributes,
    });
    for (const attributes of [
      {
        kind: "generic",
        hrefProperty: "example/href",
        openInNewWindowProperty: "example/open",
      },
      {
        kind: "safeLinkV1",
        hrefProperty: "not-qualified",
        openInNewWindowProperty: "example/open",
      },
      {
        kind: "safeLinkV1",
        hrefProperty: "example/same",
        openInNewWindowProperty: "example/same",
      },
      {
        kind: "safeLinkV1",
        hrefProperty: "example/href",
        openInNewWindowProperty: "example/open",
        target: "_blank",
      },
    ]) {
      expect(() =>
        createInlineFormatRenderManifest({ recipes: [recipe(attributes)] }),
      ).toThrow();
    }

    let reads = 0;
    const attributes = {
      kind: "safeLinkV1",
      hrefProperty: "example/href",
    } as Record<string, unknown>;
    Object.defineProperty(attributes, "openInNewWindowProperty", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "example/open";
      },
    });
    expect(() =>
      createInlineFormatRenderManifest({ recipes: [recipe(attributes)] }),
    ).toThrow(/own data properties/u);
    expect(reads).toBe(0);
  });

  it("rejects unknown executable fields and symbols without reading them", () => {
    let getterReads = 0;
    const manifest = {
      recipes: [{ formatKind: "example/format", element: "span" }],
      render: () => document.createElement("span"),
    };
    Object.defineProperty(manifest, "hiddenFactory", {
      enumerable: false,
      get: () => {
        getterReads += 1;
        return () => undefined;
      },
    });
    expect(() => createInlineFormatRenderManifest(manifest)).toThrow(
      /exact shape/u,
    );

    const recipe = {
      formatKind: "example/format",
      element: "span",
      callback: () => undefined,
    };
    expect(() =>
      createInlineFormatRenderManifest({ recipes: [recipe] }),
    ).toThrow(/exact shape/u);

    const symbolManifest = {
      recipes: [{ formatKind: "example/format", element: "span" }],
      [Symbol("hidden")]: true,
    };
    expect(() => createInlineFormatRenderManifest(symbolManifest)).toThrow(
      /exact shape/u,
    );
    expect(getterReads).toBe(0);
  });

  it("rejects retained-field accessors without executing them", () => {
    let reads = 0;
    const recipe = { element: "span" } as Record<string, unknown>;
    Object.defineProperty(recipe, "formatKind", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "example/format";
      },
    });
    expect(() =>
      createInlineFormatRenderManifest({ recipes: [recipe] }),
    ).toThrow(/own data properties/u);

    const classes = ["format"];
    Object.defineProperty(classes, "0", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "format";
      },
    });
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: "example/format", element: "span", classes }],
      }),
    ).toThrow(/own data properties/u);
    expect(reads).toBe(0);
  });

  it("requires exact records and bounded dense own-data arrays", () => {
    const inherited = Object.assign(
      Object.create({ formatKind: "example/format" }) as Record<string, unknown>,
      { element: "span" },
    );
    expect(() =>
      createInlineFormatRenderManifest({ recipes: [inherited] }),
    ).toThrow(/exact shape/u);
    expect(() =>
      createInlineFormatRenderManifest({ recipes: new Array(1) }),
    ).toThrow(/dense exact array/u);

    const recipes = [{ formatKind: "example/format", element: "span" }];
    Object.defineProperty(recipes, "metadata", { value: true });
    expect(() => createInlineFormatRenderManifest({ recipes })).toThrow(
      /dense exact array/u,
    );
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            classes: undefined,
          },
        ],
      }),
    ).toThrow(/must be an array/u);
  });

  it("enforces qualified format identities and canonical ASCII classes", () => {
    for (const formatKind of ["invalid", "Example/format", "example/", "example/f$"]) {
      expect(() =>
        createInlineFormatRenderManifest({
          recipes: [{ formatKind, element: "span" }],
        }),
      ).toThrow(/kind/u);
    }
    for (const classToken of ["", "Upper", "two words", "-leading", "é"] as const) {
      expect(() =>
        createInlineFormatRenderManifest({
          recipes: [
            {
              formatKind: "example/format",
              element: "span",
              classes: [classToken],
            },
          ],
        }),
      ).toThrow(/classes/u);
    }
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            classes: ["duplicate", "duplicate"],
          },
        ],
      }),
    ).toThrow(/duplicate/u);
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "example/format", element: "span" },
          { formatKind: "example/format", element: "em" },
        ],
      }),
    ).toThrow(/duplicated/u);
  });

  it("accepts every exact bound and rejects each limit plus one", () => {
    const recipesAtLimit = Array.from(
      { length: MAX_INLINE_FORMAT_RENDER_RECIPES },
      (_, index) => ({
        formatKind: `example/f${String(index).padStart(3, "0")}`,
        element: "span",
      }),
    );
    expect(() =>
      createInlineFormatRenderManifest({ recipes: recipesAtLimit }),
    ).not.toThrow();
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          ...recipesAtLimit,
          { formatKind: "example/overflow", element: "span" },
        ],
      }),
    ).toThrow(/fixed bound/u);

    const classAtLimit = `a${"b".repeat(
      MAX_INLINE_FORMAT_RENDER_CLASS_TOKEN_ASCII - 1,
    )}`;
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            classes: Array.from(
              { length: MAX_INLINE_FORMAT_RENDER_CLASSES_PER_RECIPE },
              (_, index) => `class${index}`,
            ),
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            classes: Array.from(
              { length: MAX_INLINE_FORMAT_RENDER_CLASSES_PER_RECIPE + 1 },
              (_, index) => `class${index}`,
            ),
          },
        ],
      }),
    ).toThrow(/fixed bound/u);
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            classes: [classAtLimit],
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            classes: [`${classAtLimit}x`],
          },
        ],
      }),
    ).toThrow(/classes/u);

    const formatKindAtLimit = `a/${"b".repeat(
      MAX_INLINE_FORMAT_RENDER_FORMAT_KIND_ASCII - 2,
    )}`;
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: formatKindAtLimit, element: "span" }],
      }),
    ).not.toThrow();
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: `${formatKindAtLimit}b`, element: "span" }],
      }),
    ).toThrow(/kind/u);

    const referencesAtLimit = Array.from(
      { length: MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES_PER_RECIPE },
      (_, index) => `target/t${String(index).padStart(3, "0")}`,
    );
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            before: referencesAtLimit,
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            before: [...referencesAtLimit, "target/overflow"],
          },
        ],
      }),
    ).toThrow(/fixed bound/u);

    expect(MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES).toBe(4_096);
    const aggregateAtLimit = aggregateOrderRecipes(16, 256);
    expect(() =>
      createInlineFormatRenderManifest({ recipes: aggregateAtLimit }),
    ).not.toThrow();
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: aggregateOrderRecipes(17, 241),
      }),
    ).toThrow(/aggregate bound/u);
  });

  it("rejects duplicate and self ordering declarations before compilation", () => {
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            before: ["example/other", "example/other"],
          },
        ],
      }),
    ).toThrow(/duplicate/u);
    expect(() =>
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/format",
            element: "span",
            after: ["example/format"],
          },
        ],
      }),
    ).toThrow(/cannot order itself/u);
  });
});

function aggregateOrderRecipes(
  recipeCount: number,
  referencesPerRecipe: number,
): readonly unknown[] {
  return Array.from({ length: recipeCount }, (_, recipeIndex) => ({
    formatKind: `example/r${String(recipeIndex).padStart(3, "0")}`,
    element: "span",
    before: Array.from(
      { length: referencesPerRecipe },
      (_, referenceIndex) =>
        `target/t${String(recipeIndex).padStart(3, "0")}_${String(
          referenceIndex,
        ).padStart(3, "0")}`,
    ),
  }));
}
