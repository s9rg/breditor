import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync } from "rolldown/utils";

const root = fileURLToPath(new URL("../", import.meta.url));
const browser = join(root, "packages", "breditor-browser");
const output = resolve(process.argv[2] ?? join(browser, "dist"));
const compiler = join(root, "node_modules", "typescript", "bin", "tsc");

// Keep full editor hover help for the supported entry points and their most
// frequently used APIs, including the command adapter's deprecation notice.
const documentedDeclarations = [
  "advanced",
  "browser_editor",
  "clipboard_html",
  "html_host",
  "index",
  "presentation",
  "session_checkpoint_autosave",
  "wasm_command_adapter",
];

// These shipping modules are also inputs to the WebKit differential probes.
// Preserve their emitted bindings and control flow so the source transforms
// can isolate one behavior without changing the rest of the bundle.
const diagnosticModules = new Set([
  "browser_editor.js",
  "browser_event_router.js",
  "command_queue.js",
  "projection.js",
  "wasm_command_adapter.js",
  "wasm_document_json.js",
  "wasm_engine_bootstrap.js",
  "wasm_profile_descriptor.js",
  "wasm_projection_adapter.js",
  "wasm_selection_adapter.js",
  "wasm_session_checkpoint.js",
]);

function emit(directory, ...flags) {
  execFileSync(process.execPath, [
    compiler, "-p", join(browser, "tsconfig.json"), "--outDir", directory, ...flags,
  ], { cwd: root, stdio: "inherit" });
}

function minifyJavaScript(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      minifyJavaScript(path);
    } else if (entry.isFile() && extname(entry.name) === ".js") {
      if (directory === output && diagnosticModules.has(entry.name)) continue;
      const { code, errors } = minifySync(path, readFileSync(path, "utf8"), {
        module: true,
        compress: { keepNames: { function: true, class: true } },
        mangle: { keepNames: true },
      });
      if (errors.length) throw Error(errors.map(error => error.message).join("\n"));
      writeFileSync(path, code);
    }
  }
}

const documented = mkdtempSync(join(tmpdir(), "breditor-browser-declarations-"));
try {
  emit(output, "--declaration", "false", "--removeComments");
  minifyJavaScript(output);
  emit(output, "--emitDeclarationOnly", "--removeComments");
  emit(documented, "--emitDeclarationOnly");
  for (const name of documentedDeclarations) {
    const declaration = name + ".d.ts";
    copyFileSync(join(documented, declaration), join(output, declaration));
  }
} finally {
  rmSync(documented, { recursive: true, force: true });
}
