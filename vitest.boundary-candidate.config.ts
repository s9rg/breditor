import { fileURLToPath } from "node:url";
import { transformWithOxc, type Plugin } from "vite";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./packages/breditor-browser/vitest.config";
import { transformNumericConsumer } from "./tests/browser/diagnostics/numeric_consumer_transform";

const helper = fileURLToPath(new URL("./tests/browser/diagnostics/normalize_boundary_number.ts", import.meta.url));
const targets = new Map([
  ["wasm_profile_descriptor.ts", "wasm_profile_descriptor.js"],
  ["wasm_selection_adapter.ts", "wasm_selection_adapter.js"],
]);
const exercised = new Set<string>();
const candidate: Plugin = {
  name: "breditor-boundary-candidate-contract-tests",
  enforce: "pre",
  async transform(code, id) {
    const filename = id.split("/").at(-1)!;
    const output = targets.get(filename);
    if (output === undefined || !id.endsWith(`/breditor-browser/src/${filename}`)) return null;
    // Strip types before applying the same fail-closed four-site transform
    // used by the production-minified experiment. No runtime source is edited.
    const js = await transformWithOxc(code, id);
    const result = transformNumericConsumer(js.code, `/breditor-browser/dist/${output}`, helper);
    if (result === null) throw new Error("Expected numeric boundary candidate transform");
    exercised.add(filename);
    return { code: result.code, map: null };
  },
  closeBundle() {
    if (exercised.size !== 2) throw new Error("Candidate contract suite did not transform both boundary modules");
  },
};

/** Historical pre-integration experiment. Its fail-closed transform now rejects
 * the integrated sources. Use ordinary npm test to qualify the runtime; this
 * config is retained only for reproducing a pre-integration source checkout.
 */
export default mergeConfig(base, defineConfig({
  plugins: [candidate],
  test: { include: ["packages/breditor-browser/src/**/*.test.ts"] },
}));
