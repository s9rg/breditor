import {defineConfig} from "@playwright/test";
import {editorBrowserPort} from "../editor-browser/port.mjs";

const origin=`http://127.0.0.1:${editorBrowserPort()}`;
export default defineConfig({testDir:".",workers:1,retries:0,timeout:180_000,
 outputDir:"../../target/installed-input-latency-playwright",
 use:{baseURL:origin,browserName:"chromium",channel:"chrome",trace:"retain-on-failure"},
 webServer:{command:"node experiments/editor-browser/serve.mjs",cwd:"../..",url:`${origin}/`,reuseExistingServer:false,timeout:10_000},
});
