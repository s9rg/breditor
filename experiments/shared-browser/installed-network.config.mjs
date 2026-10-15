// The same demo and inline-presentation assertions; all three browser libraries come from
// installed npm archives without workspace links. Matching Rust/Wasm is still host-supplied.
import {defineConfig} from "@playwright/test";
import base from "./playwright.config.mjs";
export default defineConfig({...base,testMatch:["inline-presentation.spec.mjs","standard-profile.spec.mjs","network-demo.spec.mjs"],outputDir:"../../target/shared-installed-browser-results",use:{...base.use,baseURL:"http://127.0.0.1:49783"},webServer:{...base.webServer,url:"http://127.0.0.1:49783/",env:{BREDITOR_SHARED_PORT:"49783",BREDITOR_SHARED_INSTALLED:"1"}}});
