import {readdirSync} from "node:fs";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {defineConfig,devices} from "@playwright/test";

// WebKit (Playwright's macOS build) stops opening pages after roughly 63 test contexts in one browser
// instance: the 64th test's page.goto never issues a request and times out. Playwright launches a fresh
// browser per project, so WebKit is split into project groups that each stay well below that count.
// Spec files are dealt round-robin into one group per WEBKIT_FILES_PER_GROUP files (today 27 files and 147
// tests give 6 groups of 16-31 tests, about half the limit); new specs add groups automatically. Select all
// of WebKit with --project='webkit*'.
const WEBKIT_FILES_PER_GROUP=5;
// BREDITOR_RICH_PORT moves the contract host (default 49773) so parallel checkouts do not collide.
const port=Number(process.env.BREDITOR_RICH_PORT??49773),origin=`http://127.0.0.1:${port}`;
const specs=readdirSync(dirname(fileURLToPath(import.meta.url))).filter(name=>name.endsWith(".spec.mjs")).sort();
const groups=Math.max(1,Math.ceil(specs.length/WEBKIT_FILES_PER_GROUP));
const webkit=Array.from({length:groups},(_,group)=>({
 name:`webkit-${group+1}`,
 testMatch:specs.filter((_,index)=>index%groups===group).map(name=>`**/${name}`),
 use:{...devices["Desktop Safari"]},
}));

export default defineConfig({
 testDir:".",testMatch:"*.spec.mjs",outputDir:"../../target/rich-browser-results",workers:1,retries:0,timeout:60_000,globalTimeout:20*60_000,forbidOnly:true,reporter:"line",
 use:{baseURL:origin,trace:"retain-on-failure"},
 projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}},{name:"firefox",use:{...devices["Desktop Firefox"]}},...webkit],
 webServer:{command:"node experiments/rich-browser/serve.mjs",cwd:"../..",url:`${origin}/`,reuseExistingServer:false,timeout:10_000},
});
