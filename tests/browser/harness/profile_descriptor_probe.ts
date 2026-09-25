import initialize, * as wasm from "@breditor/wasm";
import { consumeWasmCompiledProfileDescriptor } from "@breditor/browser/advanced";
import { REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON } from "@breditor/reference-highlight";

/**
 * Repeatedly consumes independently owned descriptors from one real compiled
 * profile. The strict consumer checks both declared properties and out-of-range
 * absence sentinels. No DOM, React, checkpoint, or action-state work is involved.
 * This isolates the descriptor boundary; it does not claim to reproduce every
 * intermittent WebKit startup rejection seen in the complete demo.
 */
export async function probeProfileDescriptors(iterations: number): Promise<{
  iterations: number;
}> {
  await initialize();
  const result = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(
    REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  );
  let profile: wasm.BreditorCompiledProfile | undefined;
  try {
    profile = result.takeProfile();
  } finally {
    result.free();
  }
  if (profile === undefined) throw new Error("descriptor probe profile missing");
  let generation: wasm.BreditorProfileGeneration | undefined;
  try {
    generation = profile.generation();
    let expected: string | undefined;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      // The consumer releases this descriptor, including on rejection.
      const read = consumeWasmCompiledProfileDescriptor(generation, profile.descriptor());
      if (!read.ok) {
        throw new Error(`descriptor rejected at ${iteration}: ${read.error.code}`);
      }
      const actual = JSON.stringify(read.descriptor);
      if (expected === undefined) expected = actual;
      else if (actual !== expected) throw new Error(`descriptor changed at ${iteration}`);
      if (iteration % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { iterations };
  } finally {
    generation?.free();
    profile.free();
  }
}
