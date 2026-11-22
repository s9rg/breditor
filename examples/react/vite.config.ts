import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compactHtmlCharacterData } from "./compact-html-character-data.js";

export default defineConfig({
  plugins: [react(), compactHtmlCharacterData()],
  build: {
    modulePreload: { polyfill: false },
    target: "es2022",
  },
});
