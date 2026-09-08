import { describe, expect, it } from "vitest";

import {
  BaseDocumentProjection,
  BaseProjectionUpdate,
  type BrowserProjectionResult,
} from "./advanced.js";

function valueOf<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function projection(
  revision: string,
  paragraphs: readonly (readonly Readonly<{ text: string; strong: boolean }>[])[],
) {
  return BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "projection-tests", revision },
    paragraphs: paragraphs.map((runs) => ({ runs })),
  });
}

describe("BaseDocumentProjection", () => {
  it("owns and deeply freezes a canonical base-schema projection", () => {
    const inputRuns = [{ text: "plain", strong: false }, { text: "bold", strong: true }];
    const result = projection("0", [inputRuns, []]);
    const value = valueOf(result);

    inputRuns[0] = { text: "changed", strong: false };
    expect(value.paragraphs[0]?.runs[0]?.text).toBe("plain");
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.snapshot)).toBe(true);
    expect(Object.isFrozen(value.paragraphs)).toBe(true);
    expect(Object.isFrozen(value.paragraphs[0]?.runs)).toBe(true);
    expect(Object.isFrozen(value.paragraphs[0]?.runs[0])).toBe(true);
  });

  it.each([
    ["empty document", []],
    ["empty text leaf", [[{ text: "", strong: false }]]],
    [
      "adjacent equivalent formats",
      [[{ text: "a", strong: false }, { text: "b", strong: false }]],
    ],
    ["lone surrogate", [[{ text: "\ud800", strong: false }]]],
  ])("rejects %s", (_name, paragraphs) => {
    expect(projection("0", paragraphs).ok).toBe(false);
  });

  it.each(["", "01", "-1", "18446744073709551616"])(
    "rejects invalid revision %s",
    (revision) => {
      const result = projection(revision, [[]]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("projection.invalid_snapshot");
      }
    },
  );

  it("rejects extra record fields and accessor-backed inputs", () => {
    const extra = BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "strict", revision: "0" },
      paragraphs: [{ runs: [] }],
      extra: true,
    });
    expect(extra.ok).toBe(false);

    const accessor = {
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "strict", revision: "0" },
      get paragraphs() {
        return [{ runs: [] }];
      },
    };
    expect(BaseDocumentProjection.create(accessor).ok).toBe(false);
  });

  it("rejects sparse, accessor-backed, and extended boundary arrays", () => {
    const sparseParagraphs = new Array<unknown>(1);
    expect(BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "strict-arrays", revision: "0" },
      paragraphs: sparseParagraphs,
    }).ok).toBe(false);

    const accessorRuns: unknown[] = [{ runs: [] }];
    Object.defineProperty(accessorRuns, "0", {
      configurable: true,
      enumerable: true,
      get: () => ({ runs: [] }),
    });
    expect(BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "strict-arrays", revision: "0" },
      paragraphs: accessorRuns,
    }).ok).toBe(false);

    const extendedRuns: unknown[] = [];
    Object.defineProperty(extendedRuns, "hidden", { value: true });
    expect(BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "strict-arrays", revision: "0" },
      paragraphs: [{ runs: extendedRuns }],
    }).ok).toBe(false);
  });

  it("rejects oversized revision and text before expensive semantic scans", () => {
    const oversizedRevision = projection("1".repeat(21), [[]]);
    expect(oversizedRevision.ok).toBe(false);
    if (!oversizedRevision.ok) {
      expect(oversizedRevision.error.code).toBe("projection.invalid_snapshot");
    }

    const originalCharCodeAt = String.prototype.charCodeAt;
    try {
      String.prototype.charCodeAt = function (): number {
        throw new Error("oversized text was scanned");
      };
      const oversizedText = projection("0", [
        [{ text: "x".repeat(1024 * 1024 + 1), strong: false }],
      ]);
      expect(oversizedText.ok).toBe(false);
      if (!oversizedText.ok) {
        expect(oversizedText.error.code).toBe("projection.resource_limit");
      }
    } finally {
      String.prototype.charCodeAt = originalCharCodeAt;
    }
  });
});

describe("BaseProjectionUpdate", () => {
  it("requires an exact successor revision", () => {
    const base = valueOf(projection("4", [[]]));
    for (const revision of ["3", "4", "6"]) {
      const result = valueOf(projection(revision, [[]]));
      const update = BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } });
      expect(update.ok).toBe(false);
    }
  });

  it("rejects successor overflow", () => {
    const base = valueOf(projection("18446744073709551615", [[]]));
    const result = valueOf(projection("0", [[]]));
    const update = BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } });
    expect(update.ok).toBe(false);
  });

  it("rejects a narrow impact when an unnamed paragraph changed", () => {
    const base = valueOf(
      projection("0", [
        [{ text: "a", strong: false }],
        [{ text: "b", strong: false }],
      ]),
    );
    const result = valueOf(
      projection("1", [
        [{ text: "changed", strong: false }],
        [{ text: "also changed", strong: false }],
      ]),
    );
    const update = BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    });
    expect(update.ok).toBe(false);
  });

  it("rejects a root splice whose retained suffix is not exact", () => {
    const base = valueOf(
      projection("8", [
        [{ text: "a", strong: false }],
        [{ text: "b", strong: false }],
      ]),
    );
    const result = valueOf(
      projection("9", [
        [{ text: "inserted", strong: false }],
        [{ text: "changed suffix", strong: false }],
      ]),
    );
    const update = BaseProjectionUpdate.create({
      base,
      result,
      impact: {
        kind: "rootSplice",
        oldRange: { start: 0, end: 1 },
        newRange: { start: 0, end: 1 },
      },
    });
    expect(update.ok).toBe(false);
  });
});
