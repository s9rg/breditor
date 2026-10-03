import initialize, { BreditorEngine } from "@breditor/wasm";

/** Fixed counterpart of the four-paragraph history fixture after both bold
 * operations. No editor, adapters, history operations or selection calls. */
const text = (value: string, strong = false) => ({ kind: "text", text: value,
  formats: strong ? [{ type: "breditor/strong", properties: {} }] : [] });
const paragraph = (...children: ReturnType<typeof text>[]) => ({ kind: "element",
  type: "breditor/paragraph", entityId: null, properties: {}, children });
const documentJson = JSON.stringify({ format: "breditor/document", formatVersion: 1,
  schema: { name: "breditor/base", version: 1 }, root: { kind: "element", type: "breditor/document",
    entityId: null, properties: {}, children: [paragraph(text("Left", true), text("🙂")), paragraph(),
      paragraph(text("Right", true), text(" e\u0301 & <tag>")), paragraph(text("尾"))] } });
const expectedText = [undefined, undefined, "Left", "🙂", undefined, undefined,
  "Right", " e\u0301 & <tag>", undefined, "尾", undefined];
const expectedCount = [undefined, undefined, 1, 0, undefined, undefined, 1, 0, undefined, 0, undefined];

/** Read every node plus one out-of-range index, retaining or renewing the
 * snapshot each round. A mismatch stops immediately; no failed read is retried.
 * Task yields are fixed, not conditional on results. */
export async function probeProjectionCounts(rounds: number, lifetime: "retained" | "renewed", comparison: "strict" | "same-value" | "decimal" = "strict") {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 10_000 ||
      (lifetime !== "retained" && lifetime !== "renewed") ||
      (comparison !== "strict" && comparison !== "same-value" && comparison !== "decimal")) throw new Error("invalid projection count request");
  await initialize();
  const factory = BreditorEngine.fromDocumentJson("projection-count-probe", documentJson, 8);
  const engine = factory.takeEngine();
  factory.free();
  if (!engine) throw new Error("projection count fixture rejected");
  const observation = engine.observation();
  const acquire = () => {
    const result = engine.projection(observation);
    try {
      const value = result.takeProjection();
      if (!value) throw new Error("projection unavailable");
      return value;
    } finally { result.free(); }
  };
  let projection: ReturnType<typeof acquire> | undefined;
  let snapshots = 0;
  let counts = 0;
  try {
    for (let round = 0; round < rounds; round++) {
      if (!projection || lifetime === "renewed") {
        projection?.free(); projection = undefined;
        projection = acquire(); snapshots++;
      }
      for (let index = 0; index < expectedCount.length; index++) {
        const kind = projection.nodeKind(index);
        const actualText = projection.text(index);
        const count = projection.formatCount(index);
        const expectedKind = index === 10 ? undefined : expectedText[index] === undefined ? "element" : "text";
        // Name the original failing leaf. Do not infer that a count was wrong
        // merely because this combined getter check rejected. The independent
        // SameValue control is not a replacement for production validation.
        let rejected: "kind" | "text" | "count" | "count-type" | undefined;
        if (comparison === "strict") {
          if (kind !== expectedKind) rejected = "kind";
          else if (actualText !== expectedText[index]) rejected = "text";
          else if (count !== expectedCount[index]) rejected = "count";
        } else if (comparison === "same-value") {
          if (!Object.is(kind, expectedKind)) rejected = "kind";
          else if (!Object.is(actualText, expectedText[index])) rejected = "text";
          else if (!Object.is(count, expectedCount[index])) rejected = "count";
        } else {
          // Independent observation channel for this fixed 0/1/undefined
          // fixture only. Never used by production validation or as a retry.
          if (kind !== expectedKind) rejected = "kind";
          else if (actualText !== expectedText[index]) rejected = "text";
          else if (typeof count !== typeof expectedCount[index]) rejected = "count-type";
          else if (String(count) !== String(expectedCount[index])) rejected = "count";
        }
        if (rejected) {
          const bits = (value: number | undefined) => {
            if (value === undefined) return null;
            const view = new DataView(new ArrayBuffer(8));
            view.setFloat64(0, value, false);
            return view.getBigUint64(0, false).toString(16).padStart(16, "0");
          };
          throw new Error(`projection count ${JSON.stringify({ round, index, lifetime, comparison, rejected,
            kind, expectedKind, textType: typeof actualText, textMatches: actualText === expectedText[index],
            count: String(count), countType: typeof count, expected: String(expectedCount[index]),
            countBits: bits(count), expectedBits: bits(expectedCount[index]),
            sameKind: Object.is(kind, expectedKind), sameText: Object.is(actualText, expectedText[index]),
            sameCount: Object.is(count, expectedCount[index]) })}`);
        }
        counts++;
      }
      if (round % 100 === 99) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { rounds, lifetime, comparison, counts, snapshots };
  } finally { projection?.free(); observation.free(); engine.free(); }
}
