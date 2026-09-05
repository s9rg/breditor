import { describe, expect, it } from "vitest";

import {
  MAX_CLIPBOARD_FRAGMENT_HTML_UTF16,
  MAX_CLIPBOARD_FRAGMENT_HTML_UTF8,
  MAX_CLIPBOARD_FRAGMENT_TEXT_UTF16,
  MAX_CLIPBOARD_FRAGMENT_TEXT_UTF8,
  serializeClipboardSelection,
} from "./clipboard_fragment.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection } from "./selection.js";

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
