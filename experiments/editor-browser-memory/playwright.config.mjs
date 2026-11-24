import installed from "../editor-browser/playwright.config.mjs";

const {use} = installed.projects.find(project => project.name === "chromium");
const chrome = {...use, channel: "chrome"};
const pairedMemory = process.env.BREDITOR_EDITOR_PAIRED_MEMORY === "1";

export default {
  ...installed,
  outputDir: "../../target/editor-browser-memory-results",
  timeout: 300_000,
  globalTimeout: 360_000,
  projects: [
    {name: "chrome", use: chrome, metadata: {rangeEditing: "original"},
      ...(pairedMemory ? {} : {testIgnore: "paired-memory.spec.mjs"})},
    {name: "chrome-general-ranges", use: chrome, testMatch: "shared-memory.spec.mjs", metadata: {rangeEditing: "general-v1"}},
  ],
};
