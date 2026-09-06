import { describe, expect, it } from "vitest";

import { BaseDocumentProjection } from "./projection.js";
import {
  MAX_BROWSER_PLAIN_TEXT_UTF8_BYTES,
  projectPlainText,
} from "./projection_plain_text.js";

describe("semantic plain-text export", () => {
  it("joins paragraphs with LF, preserves empties, strips strong, and adds no synthetic final LF", () => {
    const projection = ownedProjection([
      { runs: [{ text: "A", strong: false }, { text: "💡", strong: true }] },
      { runs: [] },
      { runs: [{ text: "最後", strong: false }] },
      { runs: [] },
    ]);

    const result = projectPlainText(projection);

    expect(result).toEqual({
      ok: true,
      content: {
        text: "A💡\n\n最後\n",
        utf8Bytes: new TextEncoder().encode("A💡\n\n最後\n").byteLength,
        snapshot: { lineage: "plain-text-tests", revision: "9" },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.content)).toBe(true);
    expect(result.ok && Object.isFrozen(result.content.snapshot)).toBe(true);
  });

  it("represents one or several empty paragraphs without inventing document text", () => {
    expect(projectPlainText(ownedProjection([{ runs: [] }]))).toMatchObject({
      ok: true,
      content: { text: "", utf8Bytes: 0 },
    });
    expect(
      projectPlainText(ownedProjection([{ runs: [] }, { runs: [] }, { runs: [] }])),
    ).toMatchObject({ ok: true, content: { text: "\n\n", utf8Bytes: 2 } });
  });

  it("rejects foreign lookalikes and remains bounded by the projection contract", () => {
    const lookalike = {
      snapshot: { lineage: "plain-text-tests", revision: "9" },
      paragraphs: [{ runs: [{ text: "private", strong: false }] }],
    };
    expect(projectPlainText(lookalike as never)).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "plain_text.invalid_projection",
        message: "The semantic projection cannot be exported as plain text.",
      },
    });
    expect(MAX_BROWSER_PLAIN_TEXT_UTF8_BYTES).toBe(8 * 1024 * 1024 + 9_999);
  });
});

function ownedProjection(
  paragraphs: readonly Readonly<{
    runs: readonly Readonly<{ text: string; strong: boolean }>[];
  }>[],
): BaseDocumentProjection {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "plain-text-tests", revision: "9" },
    paragraphs,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
