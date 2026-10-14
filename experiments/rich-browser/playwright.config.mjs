import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
 testDir:".",testMatch:"*.spec.mjs",outputDir:"../../target/rich-browser-results",workers:1,retries:0,timeout:60_000,globalTimeout:5*60_000,forbidOnly:true,reporter:"line",
 use:{baseURL:"http://127.0.0.1:49773",trace:"retain-on-failure"},
 projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}},{name:"firefox",use:{...devices["Desktop Firefox"]}},{name:"webkit",use:{...devices["Desktop Safari"]}}],
 webServer:{command:"node experiments/rich-browser/serve.mjs",cwd:"../..",url:"http://127.0.0.1:49773/",reuseExistingServer:false,timeout:10_000},
});
