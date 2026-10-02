export const propertyNumberVariants = ["f64", "i32", "u32", "text", "js-call", "js-dataview", "wasm-memory", "js-dataview-strict", "js-dataview-bare", "js-only", "js-cold-branch", "js-cold-minimal"] as const;
export type PropertyNumberVariant = typeof propertyNumberVariants[number];

export function propertyNumberVariant(value: string | undefined): PropertyNumberVariant {
  if (value === undefined) return "f64";
  if (!(propertyNumberVariants as readonly string[]).includes(value)) throw new Error("Unknown property number variant");
  return value as PropertyNumberVariant;
}

/** Test-build changes only, applied to the preserved failing fixture. */
export function transformPropertyNumberSource(code: string, id: string, variant: PropertyNumberVariant): string | null {
  if (id.endsWith("/diagnostics/property_boundary_probe.ts") && variant === "js-dataview-strict") {
    const needle = "Object.is(values[field], reference[field])";
    if (code.split(needle).length !== 2) throw new Error("Property comparison drift");
    // Diagnostic fixture values contain neither NaN nor signed zero. This is
    // not a general-purpose Object.is replacement or a production workaround.
    return code.replace(needle, "(values[field] === reference[field])");
  }
  if (id.endsWith("/diagnostics/property_boundary_probe.ts") && ["js-dataview-bare", "js-only", "js-cold-branch", "js-cold-minimal"].includes(variant)) {
    const needle = '  const result = validateProperty(...values);\n  if (JSON.stringify(result) !== expected[propertyIndex]) rejectInput(values, reference, iteration, propertyIndex, 0);';
    if (code.split(needle).length !== 2) throw new Error("Property validator call drift");
    // Keep the independently expected input-comparison oracle; omit only the
    // private validator invocation that follows it on the success path.
    let output = code.replace(needle, "");
    if (variant === "js-only" || variant === "js-cold-branch" || variant === "js-cold-minimal") {
      const importNeedle = 'const wasm = mode === "wasm" ? await import("@breditor/wasm") : undefined;';
      if (output.split(importNeedle).length !== 2) throw new Error("Property Wasm import drift");
      // Retain the cold branch's shape with a JS-only placeholder. The public
      // diagnostic command selects tiny-wasm mode, so this branch never runs.
      // This variant deliberately does not support the real-wasm fixture mode.
      output = output.replace(importNeedle, variant === "js-only" ? "const wasm = undefined;" : 'const wasm = mode === "wasm" ? await Promise.resolve({}) : undefined;');
    }
    if (variant === "js-cold-minimal") {
      const profileNeedle = "fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON)";
      if (output.split(profileNeedle).length !== 2) throw new Error("Cold profile argument drift");
      output = output.replace(profileNeedle, 'fromBootstrapJsonV2("{}")');
    }
    return output;
  }
  if (id.endsWith("/diagnostics/constant_bound_wasm.ts") &&
      (variant.startsWith("js-") || variant === "wasm-memory")) {
    if (!code.includes("export function createConstantBoundWasm()")) throw new Error("Constant bound factory drift");
    const factory = variant === "js-call" ? "createJavaScriptBound" : variant === "wasm-memory" ? "createMemoryBoundWasm" : "createDataViewBound";
    return `export { ${factory} as createConstantBoundWasm } from "./alternative_bound_sources";`;
  }
  if (id.endsWith("/diagnostics/constant_bound_wasm.ts") && variant === "i32") {
    if (!code.includes("export function createConstantBoundWasm()")) throw new Error("Constant bound factory drift");
    return 'export { createConstantI32BoundWasm as createConstantBoundWasm } from "./constant_bound_i32_wasm";';
  }
  if (!id.endsWith("/diagnostics/property_boundary_probe.ts") || (variant !== "u32" && variant !== "text")) return null;
  const needle = "constantBound(iteration, 2, 0)";
  if (code.split(needle).length !== 2) throw new Error("Property bound call-site drift");
  return code.replace(needle, variant === "u32" ? `(${needle} >>> 0)` : `Number(String(${needle}))`);
}
