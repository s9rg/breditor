import installed from "../editor-browser/playwright.config.mjs";

const {use} = installed.projects.find(project => project.name === "chromium");
const chrome = {...use, channel: "chrome"};

export default {
  ...installed,
  outputDir: "../../target/editor-browser-memory-results",
  timeout: 300_000,
  globalTimeout: 360_000,
  projects: [
    {name: "chrome", use: chrome, metadata: {rangeEditing: "original"}},
    {name: "chrome-general-ranges", use: chrome, metadata: {rangeEditing: "general-v1"}},
  ],
};
