// The same demo and inline-presentation assertions; all three browser libraries come from
// installed npm archives without workspace links, including the matching packaged Rust/Wasm.
import {defineConfig} from "@playwright/test";
import base,{sharedBrowserProjects} from "./playwright.config.mjs";
import {installedNetworkSpecs} from "./installed-network-specs.mjs";
const testMatch=[...installedNetworkSpecs];
export default defineConfig({...base,testMatch,projects:sharedBrowserProjects(testMatch),outputDir:"../../target/shared-installed-browser-results",use:{...base.use,baseURL:"http://127.0.0.1:49783"},webServer:{...base.webServer,url:"http://127.0.0.1:49783/",env:{BREDITOR_SHARED_PORT:"49783",BREDITOR_SHARED_INSTALLED:"1"}}});
