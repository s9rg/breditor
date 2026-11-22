import {defineConfig,devices} from "@playwright/test";
// The canonical runner gives every WebKit file a fresh process, as the legacy matrix does.
// A coverage guard rejects a new spec missing from this explicit list. No retries or timeouts change.
const specs=["ai-tools.spec.mjs","captions.spec.mjs","code-highlighting.spec.mjs","demo.spec.mjs","document-contents.spec.mjs","editing-aids.spec.mjs","editor-shell.spec.mjs","grammar.spec.mjs","inline-presentation.spec.mjs","input-rules.spec.mjs","standard-profile.spec.mjs","standard-toolbar.spec.mjs","network-demo.spec.mjs","persistence.spec.mjs","placements.spec.mjs","presence.spec.mjs","profile.spec.mjs","relay-assets.spec.mjs","relay-presence.spec.mjs","relay-sync.spec.mjs","relay.spec.mjs","shared.spec.mjs","slash-commands.spec.mjs","writer-transport.spec.mjs","v4-block-fields.spec.mjs","v4-inline.spec.mjs","v4-structure.spec.mjs","formatting-productivity.spec.mjs","v4-interchange.spec.mjs","ai-agent-shared.spec.mjs","ruby.spec.mjs","list-structure.spec.mjs"];
// A plain `playwright test --config` run (outside the per-file matrix) would otherwise put every WebKit test in
// one browser instance; Playwright's macOS WebKit stops opening pages after roughly 63 test contexts there (the
// 64th page.goto never issues a request). Playwright launches a fresh browser per project, so WebKit is split into
// project groups dealt round-robin, one per WEBKIT_FILES_PER_GROUP spec files, as in experiments/rich-browser.
// Select all of WebKit with --project='webkit*'; each spec belongs to exactly one group.
const WEBKIT_FILES_PER_GROUP=5;
export function sharedBrowserProjects(testMatch){
 const sorted=[...testMatch].sort(),groups=Math.max(1,Math.ceil(sorted.length/WEBKIT_FILES_PER_GROUP));
 return [{name:"chromium",use:{...devices["Desktop Chrome"]}},{name:"firefox",use:{...devices["Desktop Firefox"]}},
  ...Array.from({length:groups},(_,group)=>({name:`webkit-${group+1}`,testMatch:sorted.filter((_,index)=>index%groups===group).map(name=>`**/${name}`),use:{...devices["Desktop Safari"]}}))];
}
export default defineConfig({testDir:".",testMatch:specs,outputDir:"../../target/shared-browser-results",workers:1,retries:0,timeout:60_000,globalTimeout:45*60_000,forbidOnly:true,reporter:"line",use:{baseURL:"http://127.0.0.1:49774",trace:"retain-on-failure"},projects:sharedBrowserProjects(specs),webServer:{command:"node experiments/shared-browser/serve.mjs",cwd:"../..",url:"http://127.0.0.1:49774/",reuseExistingServer:false,timeout:10_000}});
