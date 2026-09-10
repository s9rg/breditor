import { describe, expect, it } from "vitest";

import {
  MAX_CLIPBOARD_HTML_DEPTH,
  MAX_CLIPBOARD_HTML_FORMATS_PER_RUN,
  MAX_CLIPBOARD_HTML_NODES,
  MAX_CLIPBOARD_HTML_PARAGRAPHS,
  MAX_CLIPBOARD_HTML_SOURCE_UTF16,
  MAX_CLIPBOARD_HTML_SOURCE_UTF8,
  parseClipboardHtmlToPlainText,
} from "./clipboard_html.js";
import { serializeClipboardSelection } from "./clipboard_fragment.js";
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
import { createInlineFormatRenderManifest } from "./inline_format_render_manifest.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

describe("parseClipboardHtmlToPlainText", () => {
  it("admits the closed paragraph/strong vocabulary and exact fragment markers", () => {
    const result = parseClipboardHtmlToPlainText(
      "<!--StartFragment--><p>a<strong>b</strong>c</p><p><br></p><p><b>d&amp;e</b></p><!--EndFragment-->",
    );

    expect(result).toEqual({ ok: true, value: "abc\n\nd&e" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("round-trips the copy serializer's escaped markup and preserves inline CR", () => {
    const projectionResult = BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "clipboard-html-roundtrip", revision: "0" },
      paragraphs: [
        {
          runs: [
            { text: "a\rb<&", strong: false },
            { text: "bold", strong: true },
          ],
        },
        { runs: [] },
      ],
    });
    if (!projectionResult.ok) throw new Error("projection fixture failed");
    const selectionResult = BaseRangeSelection.create(projectionResult.value, {
      kind: "range",
      anchor: {
        kind: "children",
        parentPath: [0],
        childIndex: 0,
        affinity: "after",
      },
      focus: {
        kind: "children",
        parentPath: [1],
        childIndex: 0,
        affinity: "before",
      },
    });
    if (!selectionResult.ok) throw new Error("selection fixture failed");
    const serialized = serializeClipboardSelection(selectionResult.value);
    if (!serialized.ok) throw new Error("serialization fixture failed");

    expect(serialized.value.html).toContain("a&#13;b&lt;&amp;");
    expect(parseClipboardHtmlToPlainText(serialized.value.html)).toEqual({
      ok: true,
      value: serialized.value.plainText,
    });
  });

  it("round-trips exact profiled copy markup while discarding every format", () => {
    const { generation, descriptor, presentation } = profiledPresentation();
    const projectionResult = createProfiledDocumentProjection(
      {
        schema: {
          name: descriptor.schema.name,
          version: descriptor.schema.version,
          fingerprint: descriptor.schema.fingerprint,
        },
        snapshot: { lineage: "clipboard-profile-roundtrip", revision: "0" },
        paragraphs: [
          {
            runs: [
              {
                text: "nested<&",
                formatDetails: [
                  { kind: "breditor/strong", properties: [] },
                  { kind: "example/emphasis", properties: [] },
                  { kind: "example/highlight", properties: [] },
                ],
              },
              { text: " plain", formatDetails: [] },
            ],
          },
          { runs: [] },
        ],
      },
      generation,
      descriptor,
    );
    if (!projectionResult.ok) throw new Error("profiled projection fixture failed");
    expect(bindProjectionPresentation(projectionResult.value, presentation)).toBe(true);
    const selectionResult = BaseRangeSelection.create(projectionResult.value, {
      kind: "range",
      anchor: {
        kind: "children",
        parentPath: [0],
        childIndex: 0,
        affinity: "after",
      },
      focus: {
        kind: "children",
        parentPath: [1],
        childIndex: 0,
        affinity: "before",
      },
    });
    if (!selectionResult.ok) throw new Error("profiled selection fixture failed");
    const serialized = serializeClipboardSelection(
      selectionResult.value,
      presentation,
    );
    if (!serialized.ok) throw new Error("profiled serialization fixture failed");

    expect(serialized.value.html).toBe(
      '<p><span class="highlight"><strong><em class="emphasis">nested&lt;&amp;</em></strong></span> plain</p><p><br></p>',
    );
    expect(
      parseClipboardHtmlToPlainText(serialized.value.html, presentation),
    ).toEqual({ ok: true, value: serialized.value.plainText });
    expect(parseClipboardHtmlToPlainText(serialized.value.html)).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.unsupported_structure" },
    });
  });

  it("round-trips canonical safe links and coalesces equal inert projections", () => {
    const { generation, descriptor, presentation } = presentationFor(
      [SAFE_LINK_FORMAT],
      [{
        formatKind: "example/link",
        element: "a",
        classes: ["breditor-link"],
        attributes: {
          kind: "safeLinkV1",
          hrefProperty: "example/href",
          openInNewWindowProperty: "example/open-in-new-window",
        },
      }],
    );
    const link = (href: string, openInNewWindow: boolean) => ({
      kind: "example/link",
      properties: [
        { name: "example/href", value: href },
        { name: "example/open-in-new-window", value: openInNewWindow },
      ],
    });
    const projected = createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "clipboard-safe-link", revision: "0" },
      paragraphs: [{ runs: [
        {
          text: "safe-one",
          formatDetails: [link(
            "HTTPS://Example.TEST:443/a/../path?q=one&b=two",
            true,
          )],
        },
        {
          text: "safe-two",
          formatDetails: [link("https://other.test/", false)],
        },
        {
          text: "unsafe-one",
          formatDetails: [link("javascript:alert(1)", true)],
        },
        {
          text: "unsafe-two",
          formatDetails: [link("data:text/plain,two", false)],
        },
      ] }],
    }, generation, descriptor);
    if (!projected.ok) throw new Error("safe-link projection fixture failed");
    expect(bindProjectionPresentation(projected.value, presentation)).toBe(true);
    const selected = BaseRangeSelection.create(projected.value, {
      kind: "range",
      anchor: {
        kind: "children",
        parentPath: [0],
        childIndex: 0,
        affinity: "after",
      },
      focus: {
        kind: "children",
        parentPath: [0],
        childIndex: 4,
        affinity: "before",
      },
    });
    if (!selected.ok) throw new Error("safe-link selection fixture failed");

    const serialized = serializeClipboardSelection(
      selected.value,
      presentation,
    );

    expect(serialized).toMatchObject({ ok: true });
    if (!serialized.ok) throw new Error("safe-link serialization failed");
    expect(serialized.value.html).toBe(
      '<p><a class="breditor-link" href="https://example.test/path?q=one&amp;b=two" rel="noopener noreferrer" target="_blank">safe-one</a><a class="breditor-link" href="https://other.test/">safe-two</a><a class="breditor-link">unsafe-oneunsafe-two</a></p>',
    );
    expect(
      parseClipboardHtmlToPlainText(serialized.value.html, presentation),
    ).toEqual({ ok: true, value: serialized.value.plainText });

    expect(
      parseClipboardHtmlToPlainText(
        '<p><a class="breditor-link">inert</a></p>',
        presentation,
      ),
    ).toEqual({ ok: true, value: "inert" });
    expect(
      parseClipboardHtmlToPlainText(
        '<p><a class="breditor-link" href="https://example.test/" rel="noopener noreferrer" target="_blank">safe</a></p>',
        presentation,
      ),
    ).toEqual({ ok: true, value: "safe" });

    for (const html of [
      '<p><a class="breditor-link" href="javascript:alert(1)">x</a></p>',
      '<p><a class="breditor-link" href="https://user@example.test/">x</a></p>',
      '<p><a class="breditor-link" href="https://EXAMPLE.test">x</a></p>',
      '<p><a class="breditor-link" href="https://example.test/" target="_blank">x</a></p>',
      '<p><a class="breditor-link" target="_blank" rel="noopener noreferrer" href="https://example.test/">x</a></p>',
      '<p><a class="breditor-link" href="https://example.test/" download>x</a></p>',
    ]) {
      expect(parseClipboardHtmlToPlainText(html, presentation)).toMatchObject({
        ok: false,
        error: { code: "clipboard.html.unsupported_structure" },
      });
    }
  });

  it.each([
    '<p><span class="missing">x</span></p>',
    '<p><span class="highlight extra">x</span></p>',
    '<p><span class="highlight" title="x">x</span></p>',
    '<p><span>x</span></p>',
    '<p><em class="emphasis"><span class="highlight">x</span></em></p>',
    '<p><span class="highlight"><span class="highlight">x</span></span></p>',
    '<p><span class="highlight">x</span><span class="highlight">y</span></p>',
    "<p><b>x</b></p>",
  ])("rejects a noncanonical profiled wrapper chain: %s", (source) => {
    const { presentation } = profiledPresentation();
    expect(parseClipboardHtmlToPlainText(source, presentation)).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.unsupported_structure" },
    });
  });

  it("accepts 32 canonical wrappers and rejects wrapper amplification plus one", () => {
    const formatKinds = Array.from(
      { length: MAX_CLIPBOARD_HTML_FORMATS_PER_RUN + 1 },
      (_, index) => `example/f${String(index).padStart(2, "0")}`,
    );
    const { presentation } = presentationFor(
      formatKinds,
      formatKinds.map((formatKind, index) => ({
        formatKind,
        element: "span",
        classes: [`f${String(index).padStart(2, "0")}`],
      })),
    );
    const nested = (count: number): string => {
      const openings = formatKinds
        .slice(0, count)
        .map((_kind, index) =>
          `<span class="f${String(index).padStart(2, "0")}">`,
        )
        .join("");
      return `<p>${openings}x${"</span>".repeat(count)}</p>`;
    };

    expect(
      parseClipboardHtmlToPlainText(
        nested(MAX_CLIPBOARD_HTML_FORMATS_PER_RUN),
        presentation,
      ),
    ).toEqual({ ok: true, value: "x" });
    expect(
      parseClipboardHtmlToPlainText(
        nested(MAX_CLIPBOARD_HTML_FORMATS_PER_RUN + 1),
        presentation,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
  });

  it("rejects a forged presentation without inspecting its fields", () => {
    let reads = 0;
    const presentation = new Proxy({}, {
      get: () => {
        reads += 1;
        throw new Error("must not inspect forged presentation");
      },
    }) as BrowserCompiledPresentation;
    expect(
      parseClipboardHtmlToPlainText("<p>secret</p>", presentation),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.invalid_source" },
    });
    expect(reads).toBe(0);
  });

  it("normalizes literal source CR but preserves the serializer's numeric CR", () => {
    expect(parseClipboardHtmlToPlainText("<p>a\rb</p>")).toEqual({
      ok: true,
      value: "a\nb",
    });
    expect(parseClipboardHtmlToPlainText("<p>a&#13;b</p>")).toEqual({
      ok: true,
      value: "a\rb",
    });
    expect(parseClipboardHtmlToPlainText("<p>&#1;</p>")).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.invalid_source" },
    });
    expect(parseClipboardHtmlToPlainText("<p>&#x80;</p>")).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.invalid_source" },
    });
  });

  it("retains structural leading, trailing, and consecutive empty paragraphs", () => {
    expect(
      parseClipboardHtmlToPlainText(
        "<p><br></p><p></p><p>x</p><p><br></p>",
      ),
    ).toEqual({ ok: true, value: "\n\nx\n" });
    expect(parseClipboardHtmlToPlainText("<p><br></p>")).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.empty" },
    });
    expect(parseClipboardHtmlToPlainText("<p></p><p></p>")).toEqual({
      ok: true,
      value: "\n",
    });
  });

  it("applies an allowlist to the repaired tree instead of claiming a source grammar", () => {
    expect(parseClipboardHtmlToPlainText("<p><strong>x</p>")).toEqual({
      ok: true,
      value: "x",
    });
    expect(parseClipboardHtmlToPlainText("<p>x<strong>y</strong>z</p>")).toEqual({
      ok: true,
      value: "xyz",
    });
    expect(parseClipboardHtmlToPlainText("<!doctype html><p>x</p>")).toEqual({
      ok: true,
      value: "x",
    });
    expect(
      parseClipboardHtmlToPlainText(
        "<html evil=x><body onload=x><p>x</p></body></html>",
      ),
    ).toEqual({ ok: true, value: "x" });
  });

  it.each([
    "<p class=x>text</p>",
    "<p><strong title=x>text</strong></p>",
    "<p><a href=https://example.test>text</a></p>",
    "<p><script>alert(1)</script></p>",
    "<p><style>p{color:red}</style></p>",
    "<p><img src=x></p>",
    "<svg><text>text</text></svg>",
    "<math><mi>x</mi></math>",
    "<div><p>text</p></div>",
    "text",
    " \n<p>text</p>",
    "<p><br>text</p>",
    "<p><br><br></p>",
    "<p><strong><strong>x</strong></strong></p>",
    "<p><strong></strong></p>",
    "<p><b>x</b><strong>y</strong></p>",
    "<p>x<!--hidden-->y</p>",
    "<!--other--><p>x</p>",
    "<!--StartFragment--><p>x</p>",
    "<p>x</p><!--EndFragment-->",
    "<!--EndFragment--><p>x</p><!--StartFragment-->",
  ])("rejects unsupported or noncanonical structure: %s", (source) => {
    const result = parseClipboardHtmlToPlainText(source);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.unsupported_structure" },
    });
    expect(JSON.stringify(result)).not.toContain(source);
  });

  it("rejects parser errors, lone surrogates, and non-string sources without throwing", () => {
    const cases: unknown[] = [
      "<p>\u0000</p>",
      "<p>\ud800</p>",
      "",
      null,
      {},
    ];
    for (const source of cases) {
      expect(() => parseClipboardHtmlToPlainText(source)).not.toThrow();
      expect(parseClipboardHtmlToPlainText(source)).toMatchObject({
        ok: false,
        error: { code: "clipboard.html.invalid_source" },
      });
    }
  });

  it("enforces raw UTF-16 and UTF-8 ceilings before parsing", () => {
    expect(
      parseClipboardHtmlToPlainText(
        "x".repeat(MAX_CLIPBOARD_HTML_SOURCE_UTF16 + 1),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
    expect(
      parseClipboardHtmlToPlainText(
        "é".repeat(Math.floor(MAX_CLIPBOARD_HTML_SOURCE_UTF8 / 2) + 1),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
  });

  it("enforces decoded action text and normalized paragraph ceilings", () => {
    expect(parseClipboardHtmlToPlainText(`<p>${"x".repeat(65_536)}</p>`)).toEqual({
      ok: true,
      value: "x".repeat(65_536),
    });
    expect(
      parseClipboardHtmlToPlainText(`<p>${"x".repeat(65_537)}</p>`),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
    expect(
      parseClipboardHtmlToPlainText(`<p>${"😀".repeat(16_385)}</p>`),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
    expect(
      parseClipboardHtmlToPlainText(`<p>${"\n".repeat(10_000)}</p>`),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
    expect(
      parseClipboardHtmlToPlainText(`<p>${"&#13;".repeat(10_000)}</p>`),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
    expect(MAX_CLIPBOARD_HTML_PARAGRAPHS).toBe(10_000);
    expect(
      parseClipboardHtmlToPlainText("<p></p>".repeat(MAX_CLIPBOARD_HTML_PARAGRAPHS)),
    ).toEqual({
      ok: true,
      value: "\n".repeat(MAX_CLIPBOARD_HTML_PARAGRAPHS - 1),
    });
    expect(
      parseClipboardHtmlToPlainText(
        "<p></p>".repeat(MAX_CLIPBOARD_HTML_PARAGRAPHS + 1),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
  });

  it("bounds parsed nodes independently of raw input size", () => {
    const repeats = Math.ceil(MAX_CLIPBOARD_HTML_NODES / 3);
    const source = `<p>${"<b>x</b>y".repeat(repeats)}</p>`;

    expect(source.length).toBeLessThan(MAX_CLIPBOARD_HTML_SOURCE_UTF16);
    expect(repeats * 2).toBeLessThan(65_536);
    expect(parseClipboardHtmlToPlainText(source)).toMatchObject({
      ok: false,
      error: { code: "clipboard.html.resource_limit" },
    });
    expect(MAX_CLIPBOARD_HTML_DEPTH).toBe(3);
  });

  it(
    "aborts deeply nested input during construction instead of materializing it",
    { timeout: 5_000 },
    () => {
      const source = "<div>".repeat(90_000);
      const started = performance.now();

      expect(source.length).toBeLessThan(MAX_CLIPBOARD_HTML_SOURCE_UTF16);
      expect(parseClipboardHtmlToPlainText(source)).toMatchObject({
        ok: false,
        error: { code: "clipboard.html.resource_limit" },
      });
      expect(performance.now() - started).toBeLessThan(2_000);
    },
  );

  it(
    "aborts a wide transient tree at its construction budget",
    { timeout: 5_000 },
    () => {
      const source = `<p>${"<b>x</b>y".repeat(200_000)}</p>`;
      const started = performance.now();

      expect(source.length).toBeLessThan(MAX_CLIPBOARD_HTML_SOURCE_UTF16);
      expect(parseClipboardHtmlToPlainText(source)).toMatchObject({
        ok: false,
        error: { code: "clipboard.html.resource_limit" },
      });
      expect(performance.now() - started).toBeLessThan(2_000);
    },
  );
});

const PROFILE_FINGERPRINT =
  "sha256:1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

class TestProfileGeneration implements WasmProfileGenerationView {
  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }

  free(): void {}
}

function profiledPresentation(): Readonly<{
  generation: WasmProfileGenerationView;
  descriptor: BrowserCompiledProfileDescriptor;
  presentation: BrowserCompiledPresentation;
}> {
  return presentationFor(
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
        classes: ["emphasis"],
      },
    ],
  );
}

function presentationFor(
  formatKinds: readonly ProfileFormatFixture[],
  recipes: readonly unknown[],
): Readonly<{
  generation: WasmProfileGenerationView;
  descriptor: BrowserCompiledProfileDescriptor;
  presentation: BrowserCompiledPresentation;
}> {
  const generation = new TestProfileGeneration();
  const descriptor = ownedProfileDescriptor(generation, formatKinds);
  const manifest = createInlineFormatRenderManifest({ recipes: [...recipes] });
  return Object.freeze({
    generation,
    descriptor,
    presentation: compileBrowserPresentation(generation, descriptor, manifest),
  });
}

function ownedProfileDescriptor(
  generation: WasmProfileGenerationView,
  formatKinds: readonly ProfileFormatFixture[],
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const normalized = formatKinds.map((format) => typeof format === "string"
    ? { kind: format, properties: [] }
    : format);
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: PROFILE_FINGERPRINT,
    formatCount: formatKinds.length,
    intentCount: 0,
    actionStateCount: 0,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    formatKind: (index) => normalized[index]?.kind,
    formatRevision: (index) =>
      index >= 0 && index < formatKinds.length ? 1 : undefined,
    formatPropertyCount: (index) => normalized[index]?.properties.length,
    formatPropertyName: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.name,
    formatPropertyPresence: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.presence,
    formatPropertyValueType: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.valueType.kind,
    formatPropertyIntegerMinimum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.minimum : undefined;
    },
    formatPropertyIntegerMaximum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.maximum : undefined;
    },
    formatPropertyStringMinimumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.minimumUtf8Bytes : undefined;
    },
    formatPropertyStringMaximumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.maximumUtf8Bytes : undefined;
    },
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
    inlineFormatSetFormatKind: absent,
    inlineFormatSetIntentId: absent,
    inlineFormatSetActionStateId: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!result.ok) throw new Error("profile descriptor fixture was rejected");
  return result.descriptor;
}

type ProfilePropertyFixture = Readonly<{
  name: string;
  presence: "required" | "optional";
  valueType:
    | Readonly<{ kind: "boolean" }>
    | Readonly<{ kind: "integer"; minimum?: number; maximum?: number }>
    | Readonly<{
      kind: "string";
      minimumUtf8Bytes: number;
      maximumUtf8Bytes: number;
    }>;
}>;

type ProfileFormatFixture = string | Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}>;

const SAFE_LINK_FORMAT: Exclude<ProfileFormatFixture, string> = Object.freeze({
  kind: "example/link",
  properties: Object.freeze([
    Object.freeze({
      name: "example/href",
      presence: "required" as const,
      valueType: Object.freeze({
        kind: "string" as const,
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 2_048,
      }),
    }),
    Object.freeze({
      name: "example/open-in-new-window",
      presence: "required" as const,
      valueType: Object.freeze({ kind: "boolean" as const }),
    }),
  ]),
});
