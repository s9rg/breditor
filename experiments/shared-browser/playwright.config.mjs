import {defineConfig,devices} from "@playwright/test";
import {sharedBrowserWebKitGroups} from "../../scripts/shared-browser-runs.mjs";
// The canonical runner gives every WebKit file a fresh process, as the legacy matrix does.
// A coverage guard rejects a new spec missing from this explicit list. No retries or timeouts change.
const specs=["ai-tools.spec.mjs","captions.spec.mjs","code-highlighting.spec.mjs","demo.spec.mjs","document-contents.spec.mjs","editing-aids.spec.mjs","editor-shell.spec.mjs","grammar.spec.mjs","inline-presentation.spec.mjs","input-rules.spec.mjs","standard-profile.spec.mjs","standard-toolbar.spec.mjs","network-demo.spec.mjs","persistence.spec.mjs","placements.spec.mjs","presence.spec.mjs","profile.spec.mjs","relay-assets.spec.mjs","relay-presence.spec.mjs","relay-sync.spec.mjs","relay.spec.mjs","shared.spec.mjs","slash-commands.spec.mjs","writer-transport.spec.mjs","v4-block-fields.spec.mjs","v4-inline.spec.mjs","v4-structure.spec.mjs","formatting-productivity.spec.mjs","v4-interchange.spec.mjs","ai-agent-shared.spec.mjs","ruby.spec.mjs","list-structure.spec.mjs"];
// A plain `playwright test --config` run (outside the per-file matrix) would otherwise put every WebKit test in
// one browser instance; Playwright's macOS WebKit stops opening pages after roughly 63 test contexts there (the
// 64th page.goto never issues a request). Playwright launches a fresh browser per project, so WebKit is split into
// project groups dealt round-robin with up to five spec files per group, as in experiments/rich-browser.
// Select all of WebKit with --project='webkit*'; each spec belongs to exactly one group.
export function sharedBrowserProjects(testMatch){
 return [{name:"chromium",use:{...devices["Desktop Chrome"]}},{name:"firefox",use:{...devices["Desktop Firefox"]}},
  ...sharedBrowserWebKitGroups(testMatch).map(group=>({...group,use:{...devices["Desktop Safari"]}}))];
}
const port=Number(process.env["BREDITOR_SHARED_PORT"]??49774);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Invalid shared demo port");
const origin=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:".",testMatch:specs,outputDir:"../../target/shared-browser-results",workers:1,retries:0,timeout:60_000,globalTimeout:45*60_000,forbidOnly:true,reporter:"line",use:{baseURL:origin,trace:"retain-on-failure"},projects:sharedBrowserProjects(specs),webServer:{command:"node experiments/shared-browser/serve.mjs",cwd:"../..",url:`${origin}/`,reuseExistingServer:false,timeout:10_000}});
