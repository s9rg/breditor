import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error Node diagnostic CLI is intentionally JavaScript.
import { readColdArrayMemory } from "../../../scripts/capture-webkit-array-memory.mjs";
const good = "40a0000000000000", zero = "0000000000000000";
const bits = [good, zero, good, good, good];
const memory = { pointerMatches: true, slotsHex: bits.map(b => b.match(/../g)!.reverse().join("")).join("") };
const child = (m: unknown = memory) => ({ status: 0, signal: null, stdout: "BREDITOR_COLD_MEMORY=" + JSON.stringify(m) });
const evidence = { representation: 1, storage: "ArrayWithDouble", retained: true, value: { bits: zero }, values: bits.map(bits => ({ bits })), staged: { typed: { bits: good } } };
it("verifies the synthetic control independently of fault evidence", () => {
  expect(readColdArrayMemory(child(), {}, "control").outcome).toBe("control-confirmed");
});
it("confirms stored zero only when raw bytes agree with all five JS slots and a nonzero source", () => {
  expect(readColdArrayMemory(child(), evidence, "probe").outcome).toBe("stored-zero-confirmed");
  expect(readColdArrayMemory(child(), { ...evidence, staged: { typed: { bits: zero } } }, "probe").outcome).toBe("memory-needs-inspection");
  expect(readColdArrayMemory(child(), { ...evidence, values: bits.map(() => ({ bits: good })) }, "probe").outcome).toBe("memory-needs-inspection");
});
it("rejects stale pointers, incomplete reads and failed debugger runs", () => {
  expect(readColdArrayMemory(child({ ...memory, pointerMatches: false }), evidence, "probe").outcome).toBe("invalid-memory-capture");
  expect(readColdArrayMemory(child({ ...memory, slotsHex: memory.slotsHex.slice(2) }), evidence, "probe").outcome).toBe("invalid-memory-capture");
  expect(readColdArrayMemory({ ...child(), signal: "SIGKILL" }, evidence, "probe").outcome).toBe("debugger-error");
  expect(readColdArrayMemory(child(), { ...evidence, retained: false }, "probe").outcome).toBe("invalid-failure-evidence");
});
it("changes only the cold failure payload of the storage-capture probe", () => {
  const read = (name: string) => readFileSync(new URL("../harness/" + name + ".ts", import.meta.url), "utf8");
  const added = `          nativeDescription: (globalThis as typeof globalThis & { $vm?: { value(value: unknown): string } }).$vm?.value(values) ?? "unavailable",
          retained: ((globalThis as typeof globalThis & { __breditorFailedArray?: number[] }).__breditorFailedArray = values, true),
`;
  expect(read("numeric_transfer_memory_capture_probe")).toBe(read("numeric_transfer_storage_capture_probe").replace("          recheck: capturedPositiveU32(value),", added + "          recheck: capturedPositiveU32(value),"));
});
