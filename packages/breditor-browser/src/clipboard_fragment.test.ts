import { describe, expect, it } from "vitest";

import {
  MAX_CLIPBOARD_FRAGMENT_HTML_UTF16,
  MAX_CLIPBOARD_FRAGMENT_HTML_UTF8,
  MAX_CLIPBOARD_FRAGMENT_FORMAT_WRAPPERS,
  MAX_CLIPBOARD_FRAGMENT_TEXT_UTF16,
  MAX_CLIPBOARD_FRAGMENT_TEXT_UTF8,
  serializeClipboardSelection,
} from "./clipboard_fragment.js";
import {
  BaseDocumentProjection,
  bindProjectionPresentation,
  createProfiledDocumentProjection,
} from "./projection.js";
import { BaseRangeSelection } from "./selection.js";
import {
  compileBrowserPresentation,
  type BrowserCompiledPresentation,
} from "./compiled_browser_presentation.js";
import {
  createInlineFormatRenderManifest,
  type InlineFormatRenderManifest,
} from "./inline_format_render_manifest.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

type Point =
  | Readonly<{
      kind: "text";
      textPath: readonly [number, number];
      utf16Offset: number;
      affinity: "before" | "after";
    }>
  | Readonly<{
      kind: "children";
      parentPath: readonly [number];
      childIndex: number;
      affinity: "before" | "after";
    }>;

describe("serializeClipboardSelection", () => {
  it("serializes only escaped base markup and preserves strong runs", () => {
    const projection = makeProjection([
      [
        { text: "plain<&>\"'", strong: false },
        { text: "bold & <tag>", strong: true },
      ],
    ]);
    const selection = makeSelection(
      projection,
      childrenPoint(0, 0, "after"),
      childrenPoint(0, 2, "before"),
    );

    const result = serializeClipboardSelection(selection);

    expect(result).toEqual({
      ok: true,
      value: {
        plainText: "plain<&>\"'bold & <tag>",
        html:
          "<p>plain&lt;&amp;&gt;&quot;&#39;<strong>bold &amp; &lt;tag&gt;</strong></p>",
      },
    });
    if (!result.ok) throw new Error("serialization fixture failed");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("normalizes backward ranges and retains partial and empty paragraphs", () => {
    const projection = makeProjection([
      [
        { text: "zero", strong: false },
        { text: "B", strong: true },
        { text: "tail", strong: false },
      ],
      [],
      [
        { text: "head", strong: true },
        { text: "end", strong: false },
      ],
    ]);
    const forward = makeSelection(
      projection,
      textPoint(0, 0, 2, "after"),
      textPoint(2, 1, 1, "before"),
    );
    const backward = makeSelection(
      projection,
      textPoint(2, 1, 1, "after"),
      textPoint(0, 0, 2, "before"),
    );
    const expected = {
      ok: true,
      value: {
        plainText: "roBtail\n\nheade",
        html:
          "<p>ro<strong>B</strong>tail</p><p><br></p><p><strong>head</strong>e</p>",
      },
    };

    expect(serializeClipboardSelection(forward)).toEqual(expected);
    expect(serializeClipboardSelection(backward)).toEqual(expected);
  });

  it("represents a paragraph-boundary-only selection instead of treating it as empty", () => {
    const projection = makeProjection([
      [{ text: "left", strong: false }],
      [{ text: "right", strong: false }],
    ]);
    const selection = makeSelection(
      projection,
      childrenPoint(0, 1, "after"),
      childrenPoint(1, 0, "before"),
    );

    expect(serializeClipboardSelection(selection)).toEqual({
      ok: true,
      value: {
        plainText: "\n",
        html: "<p><br></p><p><br></p>",
      },
    });
  });

  it("slices astral text only at previously validated scalar boundaries", () => {
    const projection = makeProjection([[{ text: "a😀z", strong: false }]]);
    const selection = makeSelection(
      projection,
      textPoint(0, 0, 1, "after"),
      textPoint(0, 0, 3, "before"),
    );

    expect(serializeClipboardSelection(selection)).toEqual({
      ok: true,
      value: { plainText: "😀", html: "<p>😀</p>" },
    });
    expect(
      BaseRangeSelection.create(projection, {
        kind: "range",
        anchor: textPoint(0, 0, 2, "after"),
        focus: textPoint(0, 0, 3, "before"),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_utf16_boundary" },
    });
  });

  it("preserves inline CR through an HTML character reference", () => {
    const projection = makeProjection([[{ text: "a\rb\nc", strong: false }]]);
    const selection = makeSelection(
      projection,
      childrenPoint(0, 0, "after"),
      childrenPoint(0, 1, "before"),
    );

    expect(serializeClipboardSelection(selection)).toEqual({
      ok: true,
      value: {
        plainText: "a\rb\nc",
        html: "<p>a&#13;b\nc</p>",
      },
    });
  });

  it("requires and serializes the exact profile presentation", () => {
    const fixture = createProfiledFixture(
      ["breditor/strong", "example/emphasis", "example/highlight"],
      [
        {
          formatKind: "example/highlight",
          element: "span",
          classes: ["highlight"],
          before: ["breditor/strong"],
        },
        {
          formatKind: "breditor/strong",
          element: "strong",
          before: ["example/emphasis"],
        },
        {
          formatKind: "example/emphasis",
          element: "em",
          classes: ["zeta", "emphasis"],
        },
      ],
      [
        [
          {
            text: "nested<&",
            formats: [
              "breditor/strong",
              "example/emphasis",
              "example/highlight",
            ],
          },
          { text: " plain", formats: [] },
        ],
      ],
    );
    const selection = makeSelection(
      fixture.projection,
      childrenPoint(0, 0, "after"),
      childrenPoint(0, 2, "before"),
    );
    const siblingPresentation = compileBrowserPresentation(
      fixture.generation,
      fixture.descriptor,
      fixture.manifest,
    );

    expect(serializeClipboardSelection(selection)).toMatchObject({
      ok: false,
      error: { code: "clipboard.fragment.invalid_selection" },
    });
    expect(
      serializeClipboardSelection(selection, siblingPresentation),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.fragment.invalid_selection" },
    });
    let forgedReads = 0;
    const forged = new Proxy({}, {
      get: () => {
        forgedReads += 1;
        throw new Error("must not inspect a forged presentation");
      },
    }) as BrowserCompiledPresentation;
    expect(serializeClipboardSelection(selection, forged)).toMatchObject({
      ok: false,
      error: { code: "clipboard.fragment.invalid_selection" },
    });
    expect(forgedReads).toBe(0);
    expect(
      serializeClipboardSelection(selection, fixture.presentation),
    ).toEqual({
      ok: true,
      value: {
        plainText: "nested<& plain",
        html:
          '<p><span class="highlight"><strong><em class="emphasis zeta">nested&lt;&amp;</em></strong></span> plain</p>',
      },
    });
  });

  it("serializes the full 32-format per-run bound in render order", () => {
    const formatKinds = Array.from(
      { length: 32 },
      (_, index) => `example/f${String(index).padStart(2, "0")}`,
    );
    const fixture = createProfiledFixture(
      formatKinds,
      formatKinds.map((formatKind, index) => ({
        formatKind,
        element: "span",
        classes: [`f${String(index).padStart(2, "0")}`],
      })),
      [[{ text: "x", formats: formatKinds }]],
    );
    const selection = makeSelection(
      fixture.projection,
      childrenPoint(0, 0, "after"),
      childrenPoint(0, 1, "before"),
    );

    const result = serializeClipboardSelection(selection, fixture.presentation);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("32-format serialization failed");
    expect(result.value.html).toBe(
      `<p>${formatKinds
        .map((_kind, index) =>
          `<span class="f${String(index).padStart(2, "0")}">`,
        )
        .join("")}x${"</span>".repeat(32)}</p>`,
    );
  });

  it(
    "fails closed when total wrapper amplification exceeds its fixed bound",
    { timeout: 10_000 },
    () => {
      const formatKinds = Array.from(
        { length: 32 },
        (_, index) => `example/f${String(index).padStart(2, "0")}`,
      );
      const runCount = 6_350;
      const runs = Array.from({ length: runCount }, (_, index) => ({
        text: "x",
        formats: index % 2 === 0 ? formatKinds : formatKinds.slice(0, -1),
      }));
      const wrapperCount = runs.reduce(
        (count, run) => count + run.formats.length,
        0,
      );
      expect(wrapperCount).toBe(MAX_CLIPBOARD_FRAGMENT_FORMAT_WRAPPERS + 25);
      const fixture = createProfiledFixture(
        formatKinds,
        formatKinds.map((formatKind, index) => ({
          formatKind,
          element: "span",
          classes: [`f${String(index).padStart(2, "0")}`],
        })),
        [runs],
      );
      const selection = makeSelection(
        fixture.projection,
        childrenPoint(0, 0, "after"),
        childrenPoint(0, runCount, "before"),
      );

      expect(
        serializeClipboardSelection(selection, fixture.presentation),
      ).toMatchObject({
        ok: false,
        error: { code: "clipboard.fragment.resource_limit" },
      });
    },
  );

  it("rejects every tokenizer-control and Unicode noncharacter scalar", () => {
    const forbidden = new Set<number>([0, 0x0b]);
    for (let codePoint = 0x01; codePoint <= 0x08; codePoint += 1) {
      forbidden.add(codePoint);
    }
    for (let codePoint = 0x0e; codePoint <= 0x1f; codePoint += 1) {
      forbidden.add(codePoint);
    }
    for (let codePoint = 0x7f; codePoint <= 0x9f; codePoint += 1) {
      forbidden.add(codePoint);
    }
    for (let codePoint = 0xfdd0; codePoint <= 0xfdef; codePoint += 1) {
      forbidden.add(codePoint);
    }
    for (let plane = 0; plane <= 0x10; plane += 1) {
      forbidden.add(plane * 0x1_0000 + 0xfffe);
      forbidden.add(plane * 0x1_0000 + 0xffff);
    }

    for (const codePoint of forbidden) {
      const projection = makeProjection([
        [{ text: `a${String.fromCodePoint(codePoint)}b`, strong: false }],
      ]);
      const selection = makeSelection(
        projection,
        childrenPoint(0, 0, "after"),
        childrenPoint(0, 1, "before"),
      );

      expect(serializeClipboardSelection(selection)).toEqual({
        ok: false,
        error: {
          code: "clipboard.fragment.html_unrepresentable",
          message: "The selection cannot be represented exactly in clipboard HTML.",
        },
      });
    }
  });

  it("rejects empty and foreign selections with payload-redacted errors", () => {
    const projection = makeProjection([[{ text: "secret", strong: false }]]);
    const collapsed = makeSelection(
      projection,
      textPoint(0, 0, 2, "after"),
      textPoint(0, 0, 2, "before"),
    );

    expect(serializeClipboardSelection(collapsed)).toMatchObject({
      ok: false,
      error: { code: "clipboard.fragment.empty_selection" },
    });
    expect(serializeClipboardSelection({ ...collapsed })).toMatchObject({
      ok: false,
      error: { code: "clipboard.fragment.invalid_selection" },
    });
    expect(JSON.stringify(serializeClipboardSelection(collapsed))).not.toContain("secret");
  });

  it(
    "bounds and coalesces worst-case escaping at the base-projection text ceiling",
    { timeout: 20_000 },
    () => {
      const oneMiB = "&".repeat(1024 * 1024);
      const runs = Array.from({ length: 8 }, (_, index) => ({
        text: oneMiB,
        strong: index % 2 === 1,
      }));
      const projection = makeProjection([runs]);
      const selection = makeSelection(
        projection,
        childrenPoint(0, 0, "after"),
        childrenPoint(0, runs.length, "before"),
      );

      const result = serializeClipboardSelection(selection);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("maximum serialization failed");
      expect(result.value.plainText.length).toBe(8 * 1024 * 1024);
      expect(result.value.html.length).toBe(5 * 8 * 1024 * 1024 + 7 + 4 * 17);
      expect(result.value.plainText.length).toBeLessThanOrEqual(
        MAX_CLIPBOARD_FRAGMENT_TEXT_UTF16,
      );
      expect(result.value.html.length).toBeLessThanOrEqual(
        MAX_CLIPBOARD_FRAGMENT_HTML_UTF16,
      );
      expect(MAX_CLIPBOARD_FRAGMENT_TEXT_UTF8).toBe(
        8 * 1024 * 1024 + 9_999,
      );
      expect(MAX_CLIPBOARD_FRAGMENT_HTML_UTF8).toBe(64 * 1024 * 1024);
    },
  );
});

function makeProjection(
  paragraphs: readonly (readonly Readonly<{ text: string; strong: boolean }>[])[],
) {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "clipboard-fragment-tests", revision: "0" },
    paragraphs: paragraphs.map((runs) => ({ runs })),
  });
  if (!result.ok) throw new Error(`projection fixture failed: ${result.error.code}`);
  return result.value;
}

function makeSelection(
  projection: BaseDocumentProjection,
  anchor: Point,
  focus: Point,
) {
  const result = BaseRangeSelection.create(projection, {
    kind: "range",
    anchor,
    focus,
  });
  if (!result.ok) throw new Error(`selection fixture failed: ${result.error.code}`);
  return result.value;
}

function textPoint(
  paragraphIndex: number,
  runIndex: number,
  utf16Offset: number,
  affinity: "before" | "after",
): Point {
  return Object.freeze({
    kind: "text",
    textPath: Object.freeze([paragraphIndex, runIndex]) as readonly [number, number],
    utf16Offset,
    affinity,
  });
}

function childrenPoint(
  paragraphIndex: number,
  childIndex: number,
  affinity: "before" | "after",
): Point {
  return Object.freeze({
    kind: "children",
    parentPath: Object.freeze([paragraphIndex]) as readonly [number],
    childIndex,
    affinity,
  });
}

const PROFILE_FINGERPRINT =
  "sha256:2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

class TestProfileGeneration implements WasmProfileGenerationView {
  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }

  free(): void {}
}

function createProfiledFixture(
  formatKinds: readonly string[],
  recipes: readonly unknown[],
  paragraphs: readonly (readonly Readonly<{
    text: string;
    formats: readonly string[];
  }>[])[],
): Readonly<{
  generation: WasmProfileGenerationView;
  descriptor: BrowserCompiledProfileDescriptor;
  manifest: InlineFormatRenderManifest;
  presentation: BrowserCompiledPresentation;
  projection: BaseDocumentProjection;
}> {
  const generation = new TestProfileGeneration();
  const descriptor = ownedProfileDescriptor(generation, formatKinds);
  const manifest = createInlineFormatRenderManifest({ recipes: [...recipes] });
  const presentation = compileBrowserPresentation(
    generation,
    descriptor,
    manifest,
  );
  const projection = createProfiledDocumentProjection(
    {
      schema: {
        name: descriptor.schema.name,
        version: descriptor.schema.version,
        fingerprint: descriptor.schema.fingerprint,
      },
      snapshot: { lineage: "clipboard-fragment-profile", revision: "0" },
      paragraphs: paragraphs.map((runs) => ({ runs })),
    },
    generation,
    descriptor,
  );
  if (!projection.ok) throw new Error("profiled projection fixture failed");
  if (!bindProjectionPresentation(projection.value, presentation)) {
    throw new Error("profiled presentation fixture failed");
  }
  return Object.freeze({
    generation,
    descriptor,
    manifest,
    presentation,
    projection: projection.value,
  });
}

function ownedProfileDescriptor(
  generation: WasmProfileGenerationView,
  formatKinds: readonly string[],
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: PROFILE_FINGERPRINT,
    formatCount: formatKinds.length,
    intentCount: 0,
    actionStateCount: 0,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    formatKind: (index) => formatKinds[index],
    formatRevision: (index) =>
      index >= 0 && index < formatKinds.length ? 1 : undefined,
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
  if (!result.ok) throw new Error("profile descriptor fixture was rejected");
  return result.descriptor;
}
