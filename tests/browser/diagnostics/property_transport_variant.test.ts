import { expect, it } from "vitest";
import { propertyNumberVariant, transformPropertyNumberSource } from "./property_transport_variant";

it("leaves the f64 reference and every production module unchanged", () => {
  expect(transformPropertyNumberSource("original", "/diagnostics/property_boundary_probe.ts", "f64")).toBeNull();
  expect(transformPropertyNumberSource("original", "/src/production.ts", "u32")).toBeNull();
});
it("converts exactly one diagnostic bound call and fails on drift", () => {
  const id = "/diagnostics/property_boundary_probe.ts";
  const code = "const value = constantBound(iteration, 2, 0);";
  expect(transformPropertyNumberSource(code, id, "u32")).toBe("const value = (constantBound(iteration, 2, 0) >>> 0);");
  expect(transformPropertyNumberSource(code, id, "text")).toBe("const value = Number(String(constantBound(iteration, 2, 0)));");
  expect(() => transformPropertyNumberSource(code + code, id, "u32")).toThrow("drift");
  expect(() => transformPropertyNumberSource("renamed", id, "text")).toThrow("drift");
});
it("substitutes only the tiny module for the i32 control", () => {
  expect(transformPropertyNumberSource("export function createConstantBoundWasm() {}", "/diagnostics/constant_bound_wasm.ts", "i32"))
    .toContain("createConstantI32BoundWasm as createConstantBoundWasm");
  expect(() => transformPropertyNumberSource("renamed", "/diagnostics/constant_bound_wasm.ts", "i32")).toThrow("drift");
});
it("accepts only explicit known variant names", () => {
  expect(propertyNumberVariant(undefined)).toBe("f64");
  expect(propertyNumberVariant("i32")).toBe("i32");
  expect(() => propertyNumberVariant("unknown")).toThrow("Unknown");
});
it("replaces only the factory for alternative numeric source controls", () => {
  for (const [variant, factory] of [["js-call", "createJavaScriptBound"], ["js-dataview", "createDataViewBound"], ["wasm-memory", "createMemoryBoundWasm"]] as const) {
    expect(transformPropertyNumberSource("export function createConstantBoundWasm() {}", "/diagnostics/constant_bound_wasm.ts", variant)).toContain(`${factory} as createConstantBoundWasm`);
    expect(transformPropertyNumberSource("untouched", "/diagnostics/property_boundary_probe.ts", variant)).toBeNull();
    expect(() => transformPropertyNumberSource("renamed", "/diagnostics/constant_bound_wasm.ts", variant)).toThrow("drift");
  }
});
it("isolates strict comparison and validator-removal experiments with drift guards", () => {
  const id = "/diagnostics/property_boundary_probe.ts";
  expect(transformPropertyNumberSource("if (!Object.is(values[field], reference[field])) reject();", id, "js-dataview-strict"))
    .toBe("if (!(values[field] === reference[field])) reject();");
  const validator = '  const result = validateProperty(...values);\n  if (JSON.stringify(result) !== expected[propertyIndex]) rejectInput(values, reference, iteration, propertyIndex, 0);';
  expect(transformPropertyNumberSource("comparisonOracle();\n" + validator, id, "js-dataview-bare")).toBe("comparisonOracle();\n");
  const importWasm = 'const wasm = mode === "wasm" ? await import("@breditor/wasm") : undefined;';
  expect(transformPropertyNumberSource(importWasm + "\ncomparisonOracle();\n" + validator, id, "js-only"))
    .toBe("const wasm = undefined;\ncomparisonOracle();\n");
  expect(() => transformPropertyNumberSource(validator, id, "js-only")).toThrow("import drift");
  expect(transformPropertyNumberSource(importWasm + "\n" + validator, id, "js-cold-branch"))
    .toBe('const wasm = mode === "wasm" ? await Promise.resolve({}) : undefined;\n');
  const coldProfile = "source.fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON);";
  expect(transformPropertyNumberSource(importWasm + "\n" + validator + "\n" + coldProfile, id, "js-cold-minimal"))
    .toBe('const wasm = mode === "wasm" ? await Promise.resolve({}) : undefined;\n\nsource.fromBootstrapJsonV2("{}");');
  expect(() => transformPropertyNumberSource(importWasm + "\n" + validator, id, "js-cold-minimal")).toThrow("argument drift");
  for (const variant of ["js-dataview-strict", "js-dataview-bare"] as const) {
    expect(() => transformPropertyNumberSource("renamed", id, variant)).toThrow("drift");
    expect(transformPropertyNumberSource("export function createConstantBoundWasm() {}", "/diagnostics/constant_bound_wasm.ts", variant)).toContain("createDataViewBound as createConstantBoundWasm");
  }
});
