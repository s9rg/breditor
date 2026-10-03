import { readFileSync } from "node:fs";
import { parseSync } from "rolldown/utils";
import { expect, it } from "vitest";
import config from "../../../vite.adapter-reduction.config";

const plugin = config.plugins?.find(value => value && "name" in value && value.name === "breditor-adapter-reduction") as {
  transform(code: string, id: string): { code: string } | null;
};

it.each(["projection", "wasm_projection_adapter", "wasm_selection_adapter"])(
  "instruments the actual %s reduction module with valid JavaScript", module => {
    const id = `/repo/packages/breditor-browser/dist/${module}.js`;
    const source = readFileSync(new URL(`../../../packages/breditor-browser/dist/${module}.js`, import.meta.url), "utf8");
    const output = plugin.transform(source, id)!;
    expect(output).not.toBeNull();
    expect(parseSync(id, output.code).errors).toEqual([]);
    if (module === "wasm_selection_adapter") {
      expect(output.code).toContain("return __breditorNumericPredicate");
      expect(output.code).not.toContain(":operand:");
    } else if (module === "wasm_projection_adapter") {
      expect(output.code).toContain("return __breditorNumericPredicate");
      expect(output.code).toContain("__breditorImpactRejection");
      expect(output.code).toContain("__breditorProjectionChild");
    } else {
      expect(output.code).toContain("__breditorProjectionReject");
    }
  },
);

it("does not instrument command execution or unrelated modules", () => {
  for (const module of ["wasm_command_adapter", "browser_editor", "command_queue", "unrelated"]) {
    expect(plugin.transform("throw new Error('unchanged');", `/repo/packages/breditor-browser/dist/${module}.js`)).toBeNull();
  }
});
