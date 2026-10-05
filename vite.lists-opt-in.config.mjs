import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";
import {realpathSync} from "node:fs";
import {resolve, relative, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {assertOptInRuntimeModules, loadOptInConsumer} from "./scripts/opt-in-demo-runtime.mjs";

const repository = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
export default defineConfig(async ({mode}) => {
  const admitted = await loadOptInConsumer(process.env.BREDITOR_OPT_IN_CONSUMER_RECORD);
  const installed = admitted.installed;
  const output = process.env.BREDITOR_OPT_IN_DEMO_OUTPUT;
  if (!output && mode === "qualification") throw new Error("Qualification requires a fresh BREDITOR_OPT_IN_DEMO_OUTPUT directory");
  const outDir = realpathSync(resolve(repository, output ?? "target"));
  const local = relative(resolve(repository, "target"), outDir);
  if (local === ".." || local.startsWith(`..${sep}`) || local.startsWith(sep) || (output && !local)) throw new Error("Demo output must be a directory beneath repository target");
  return {
    root: resolve(repository, "examples/lists"),
    cacheDir: resolve(outDir, "vite-cache"),
    plugins: [react(), {
      name: "verify-installed-opt-in-runtime",
      generateBundle() {
        const modules = assertOptInRuntimeModules(this.getModuleIds(), repository, installed);
        this.emitFile({type: "asset", fileName: "opt-in-runtime-proof.json", source: JSON.stringify({
          archiveSha256: admitted.archiveSha256, wasmSha256: admitted.wasmSha256,
          workspaceEditorModules: 0, installedModules: modules,
        }, null, 2) + "\n"});
      },
    }],
    define: {__BREDITOR_FLAT_LIST_WASM_SHA256__: JSON.stringify(admitted.wasmSha256)},
    resolve: {alias: [
      {find: /^@breditor\/browser$/, replacement: resolve(installed, "index.js")},
      {find: /^@breditor\/browser\/advanced$/, replacement: resolve(installed, "dist/browser/advanced.js")},
      {find: /^@breditor\/wasm$/, replacement: resolve(installed, "dist/wasm/breditor_wasm.js")},
      // The experimental source demo predates the opt-in exports. All three
      // internal imports resolve to its public root here, never workspace code.
      {find: /^(?:\.\.\/)+packages\/breditor-browser\/src\/(?:browser_editor|flat_list_toolbar_manifest|wasm_engine_bootstrap)\.js$/, replacement: resolve(installed, "index.js")},
      {find: "./demoProfile.js", replacement: resolve(repository, "examples/lists/profile.ts")},
    ]},
    optimizeDeps: {exclude: ["@breditor/browser", "@breditor/browser/advanced", "@breditor/wasm", "@breditor/reference-highlight"]},
    server: {host: "127.0.0.1", fs: {allow: [repository, installed]}},
    build: {outDir: resolve(outDir, "bundle"), emptyOutDir: false, modulePreload: {polyfill: false}, target: "es2022",
      rolldownOptions: {input: {demo: resolve(repository, "examples/lists/index.html"), clipboard: resolve(repository, "examples/lists/manual-clipboard.html")}}},
  };
});
