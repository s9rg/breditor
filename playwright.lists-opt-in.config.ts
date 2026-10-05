import {defineConfig} from "@playwright/test";
import {mkdtempSync, realpathSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import base from "./playwright.lists.config.js";

const repository = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
// Playwright also evaluates configs in workers. Allocate once in the parent and
// inherit that exact run directory; do not allocate a new artifact per worker.
const inherited = process.env["BREDITOR_OPT_IN_TEST_OUTPUT"];
const output = inherited ? realpathSync(inherited) : mkdtempSync(join(repository, "target/list-opt-in-demo-"));
if (dirname(output) !== join(repository, "target")) throw new Error("Opt-in test output must be directly under repository target");
process.env["BREDITOR_OPT_IN_TEST_OUTPUT"] = output;
const port = 4198;
if (!inherited) console.log(`Opt-in demo qualification: ${output}`);
export default defineConfig({...base,
  outputDir: join(output, "results"),
  reporter: [["line"], ["json", {outputFile: join(output, "report.json")}]],
  use: {...base.use, baseURL: `http://127.0.0.1:${port}`},
  webServer: {
    command: `vite build --config vite.lists-opt-in.config.mjs --mode qualification && vite preview --config vite.lists-opt-in.config.mjs --mode qualification --host 127.0.0.1 --port ${port} --strictPort`,
    env: {BREDITOR_OPT_IN_DEMO_OUTPUT: output},
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 30_000,
  },
});
