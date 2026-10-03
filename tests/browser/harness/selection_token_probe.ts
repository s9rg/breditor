import initialize, { BreditorEngine } from "@breditor/wasm";

const text = (value: string) => ({ kind: "text", text: value, formats: [] });
const paragraph = (...children: ReturnType<typeof text>[]) => ({ kind: "element",
  type: "breditor/paragraph", entityId: null, properties: {}, children });
const documentJson = JSON.stringify({ format: "breditor/document", formatVersion: 1,
  schema: { name: "breditor/base", version: 1 }, root: { kind: "element", type: "breditor/document",
    entityId: null, properties: {}, children: [paragraph(text("Left🙂")), paragraph(), paragraph(text("Right🙂"))] } });

type Input = readonly [kind: "text" | "children", index: number, offset: number, affinity: "before" | "after"];
const ranges: readonly (readonly [Input, Input])[] = [
  [["children", 3, 0, "after"], ["text", 2, 6, "before"]],
  [["text", 2, 0, "before"], ["children", 3, 0, "before"]],
  [["children", 3, 0, "before"], ["text", 5, 0, "after"]],
  [["text", 5, 5, "before"], ["text", 2, 4, "after"]],
];
const durablePoint = ([kind, index, offset, affinity]: Input) => kind === "children"
  ? { kind, parentPath: [1], childIndex: offset, affinity }
  : { kind, textPath: [index === 2 ? 0 : 2, 0], utf16Offset: offset, affinity };
const expected = ranges.map(([anchor, focus]) => JSON.stringify({ kind: "range",
  anchor: durablePoint(anchor), focus: durablePoint(focus) }));

/** Exercise every token slot with invalid primitives and hostile objects. A
 * large primitive must not cause a proportional Wasm-memory allocation. */
export async function probeSelectionTokenRejections() {
  const exports = await initialize();
  const factory = BreditorEngine.fromDocumentJson("selection-token-rejections", documentJson, 8);
  const engine = factory.takeEngine();
  factory.free();
  if (!engine) throw new Error("selection token rejection fixture rejected");
  const observation = engine.observation();
  const checkpoint = () => {
    const result = engine.sessionCheckpointJson();
    try {
      const value = result.takeValue();
      if (!value) throw new Error("missing checkpoint");
      return value;
    } finally { result.free(); }
  };
  let conversionCalls = 0;
  const trapped = { get length() { conversionCalls++; throw new Error("unexpected length read"); },
    [Symbol.toPrimitive]() { conversionCalls++; throw new Error("unexpected conversion"); } };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const invalid = [undefined, null, false, 0, 1, 2, 3, 4, 0n, Symbol("text"), new String("text"), trapped, revoked.proxy,
    "text\0", "childrenx", "before\0", "\ud800", "x".repeat(16_777_216)];
  type SetRange = typeof engine.setRangeSelection;
  const invoke = engine.setRangeSelection.bind(engine) as (expected: Parameters<SetRange>[0],
    ...inputs: unknown[]) => ReturnType<SetRange>;
  let rejections = 0;
  try {
    const before = checkpoint();
    const memoryBefore = exports.memory.buffer.byteLength;
    for (const slot of [0, 3, 4, 7]) {
      const wrongDomain = slot === 0 || slot === 4 ? ["before", "after"] : ["text", "children"];
      for (const [index, value] of [...invalid, ...wrongDomain].entries()) {
        const inputs: unknown[] = ["text", 2, 0, "after", "text", 2, 0, "after"];
        inputs[slot] = value;
        const command = invoke(observation, ...inputs);
        try {
          const error = command.error;
          try {
            const expectedCode = slot === 0 || slot === 4 ? "breditor_wasm.invalid_selection_point_kind" : "breditor_wasm.invalid_selection_affinity";
            if (command.status !== "error" || error?.code !== expectedCode) {
              throw new Error(`invalid token admitted slot=${slot} case=${index}`);
            }
          } finally { error?.free(); }
        } finally { command.free(); }
        if (checkpoint() !== before) throw new Error(`invalid token mutated state slot=${slot} case=${index}`);
        rejections++;
      }
    }
    const memoryGrowth = exports.memory.buffer.byteLength - memoryBefore;
    const valid = engine.setRangeSelection(observation, ...ranges[0]![0], ...ranges[0]![1]);
    try { if (valid.status !== "committed") throw new Error("valid command after rejection failed"); }
    finally { valid.free(); }
    return { rejections, conversionCalls, memoryGrowth };
  } finally { observation.free(); engine.free(); }
}

/** Raw selection admission only: no projection getters, browser adapters,
 * history, editing, or clipboard. Verify accepted kind/path/offset/affinity via
 * durable state JSON, so a successful command cannot hide a wrong admission.
 * Stop at the first discrepancy. Never retry a failed command or read. */
export async function probeSelectionTokens(rounds: number, schedule: "sync" | "task") {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 10_000 ||
      (schedule !== "sync" && schedule !== "task")) throw new Error("invalid selection token request");
  await initialize();
  const factory = BreditorEngine.fromDocumentJson("selection-token-probe", documentJson, 8);
  const engine = factory.takeEngine();
  factory.free();
  if (!engine) throw new Error("selection token fixture rejected");
  let observation = engine.observation();
  let commands = 0;
  try {
    for (let round = 0; round < rounds; round++) {
      for (const [index, [anchor, focus]] of ranges.entries()) {
        const command = engine.setRangeSelection(observation, ...anchor, ...focus);
        try {
          const status = command.status;
          if (status !== "committed") {
            const error = command.error;
            try {
              throw new Error(`selection token ${JSON.stringify({ round, index, anchor, focus, status, code: error?.code })}`);
            } finally { error?.free(); }
          }
          const next = command.observation();
          if (!next) throw new Error("missing successor observation");
          observation.free(); observation = next;
        } finally { command.free(); }
        const state = engine.stateJson();
        let json: string | undefined;
        try { json = state.takeValue(); } finally { state.free(); }
        if (!json) throw new Error("missing durable state");
        const actual = JSON.stringify((JSON.parse(json) as { selection: unknown }).selection);
        if (actual !== expected[index]) {
          throw new Error(`selection token state ${JSON.stringify({ round, index, anchor, focus, actual, expected: expected[index] })}`);
        }
        commands++;
      }
      if (schedule === "task" && round % 100 === 99) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { rounds, schedule, commands };
  } finally { observation.free(); engine.free(); }
}
