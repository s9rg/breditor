import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { buildShowcaseBrowserProfile } from "./build-showcase-browser-profile.js";
import { compactHtmlCharacterData } from "./compact-html-character-data.js";

export default defineConfig({
  plugins: [react(), compactHtmlCharacterData(), buildShowcaseBrowserProfile()],
  build: {
    modulePreload: { polyfill: false },
    target: "es2022",
  },
});
