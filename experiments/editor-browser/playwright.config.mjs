import {defineConfig,devices} from "@playwright/test";
import {editorBrowserPort} from "./port.mjs";
const origin=`http://127.0.0.1:${editorBrowserPort()}`;
export default defineConfig({testDir:".",testMatch:"*.spec.mjs",outputDir:"../../target/editor-browser-results",workers:1,retries:0,timeout:60_000,globalTimeout:300_000,forbidOnly:true,reporter:"line",use:{baseURL:origin,trace:"retain-on-failure"},projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}},{name:"firefox",use:{...devices["Desktop Firefox"]}},{name:"webkit",use:{...devices["Desktop Safari"]}}],webServer:{command:"node experiments/editor-browser/serve.mjs",cwd:"../..",url:`${origin}/`,reuseExistingServer:false,timeout:10_000}});
