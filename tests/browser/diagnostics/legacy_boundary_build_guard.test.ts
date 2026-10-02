import { expect, it } from "vitest";
import { legacyBoundaryBuildGuard } from "./legacy_boundary_build_guard";
import { transformNumericConsumer } from "./numeric_consumer_transform";

it("rejects legacy rebuilds before output cleanup but permits preserved previews", () => {
  const hook = legacyBoundaryBuildGuard().config;
  if (typeof hook !== "function") throw new Error("Expected config hook");
  expect(() => hook.call({} as never, {}, { command: "build", mode: "production" })).toThrow("Legacy boundary build retired");
  expect(hook.call({} as never, {}, { command: "serve", mode: "production", isPreview: true })).toBeUndefined();
});

it("does not double-normalize an already integrated boundary", () => {
  for (const file of ["wasm_profile_descriptor", "wasm_selection_adapter"]) {
    expect(() => transformNumericConsumer("normalizeWasmBoundaryNumber(result)",
      `/breditor-browser/dist/${file}.js`, "./helper")).toThrow("Runtime normalization already installed");
  }
});
