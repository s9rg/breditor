import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin } from "vite";
import interactive from "./vite.clipboard-boundary.config";

const variant = process.env["BREDITOR_BOUNDARY_VARIANT"] ?? "original";
const probes = ["action_state_restore_probe", "profile_descriptor_probe", "profile_owner_lifecycle_probe",
  "profile_descriptor_raw_probe", "selection_raw_restore_probe", "selection_restore_probe"];
const expectedExports = ["probeRestoredActionStates", "probeProfileDescriptors", "probeProfileOwnerLifetimes",
  "probeRawProfileDescriptors", "probeRawRestoredSelections", "probeRestoredSelections"];
const probeInputs = Object.fromEntries(probes.map(name => [name,
  fileURLToPath(new URL(`./tests/browser/harness/${name}.ts`, import.meta.url))]));
const routes = new Map(probes.map(name => [`/${name}.ts`, `/probes/${name}.js`]));
const compiledProbeRoutes: Plugin = {
  name: "breditor-compiled-matrix-probes",
  generateBundle(_, bundle) {
    for (const [index, name] of probes.entries()) {
      const entry = bundle[`probes/${name}.js`];
      if (entry?.type !== "chunk" || !entry.exports.includes(expectedExports[index]!)) {
        throw new Error(`Missing compiled probe export: ${name}`);
      }
    }
  },
  // Existing tests import dev-server .ts URLs. Redirect only these exact URLs
  // to minified entry modules, preserving the tests and their independent oracles.
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      const target = request.method === "GET" ? routes.get(request.url ?? "") : undefined;
      if (target === undefined) { next(); return; }
      response.writeHead(307, { Location: target, "Cache-Control": "no-store" });
      response.end();
    });
  },
};

/** Separate output preserves the previously qualified clipboard-only bytes. */
export default mergeConfig(interactive, {
  plugins: [compiledProbeRoutes],
  build: {
    outDir: fileURLToPath(new URL(`./target/boundary-matrix-${variant}`, import.meta.url)),
    rolldownOptions: {
      input: probeInputs,
      // Vite's application default may remove otherwise unreferenced exports.
      // These entries are imported by tests at runtime, not by the HTML graph.
      preserveEntrySignatures: "strict",
      output: { entryFileNames: (chunk: { name: string }) => probes.includes(chunk.name)
        ? "probes/[name].js" : "assets/[name]-[hash].js" },
    },
  },
});
