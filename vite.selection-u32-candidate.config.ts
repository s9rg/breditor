import { defineConfig } from "vite";
import base from "./vite.browser.config";
import { selectionU32CandidatePlugin, selectionU32Mode } from "./tests/browser/diagnostics/selection_u32_candidate_plugin";

/** Logger-free candidate; never used by ordinary demo or release builds. */
export default defineConfig({ ...base, plugins: [selectionU32CandidatePlugin(selectionU32Mode())] });
