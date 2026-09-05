import { describe, expect, it } from "vitest";

import {
  MAX_CLIPBOARD_HTML_DEPTH,
  MAX_CLIPBOARD_HTML_NODES,
  MAX_CLIPBOARD_HTML_PARAGRAPHS,
  MAX_CLIPBOARD_HTML_SOURCE_UTF16,
  MAX_CLIPBOARD_HTML_SOURCE_UTF8,
  parseClipboardHtmlToPlainText,
} from "./clipboard_html.js";
import { serializeClipboardSelection } from "./clipboard_fragment.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection } from "./selection.js";

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
