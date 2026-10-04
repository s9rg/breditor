import {fileURLToPath} from "node:url";
import {mergeConfig} from "vite";
import demo from "./examples/react/vite.config.js";
import candidate from "./vite.browser-candidate.config.js";

// Reuse the package-record, archive and installed-tree admission from the
// browser harness. Only the React application root/output differ; no shipping
// package or default demo output is rebuilt by this configuration.
export default mergeConfig(demo, {
  root: fileURLToPath(new URL("./examples/react", import.meta.url)),
  cacheDir: `${candidate["cacheDir"]}/react-demo`,
  resolve: candidate["resolve"],
  optimizeDeps: {exclude: ["@breditor/browser", "@breditor/browser/advanced",
    "@breditor/wasm", "@breditor/reference-highlight"]},
  server: candidate["server"],
  build: {
    outDir: fileURLToPath(new URL("./target/react-demo-candidate", import.meta.url)),
    emptyOutDir: false,
  },
});
