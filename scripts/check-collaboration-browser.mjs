// Process isolation, not retries: the macOS empty-page control stalls at context 64.
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import config from "../experiments/collaboration/browser/playwright.config.mjs";
import {collaborationBrowserRuns} from "./collaboration-browser-runs.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),runs=collaborationBrowserRuns(config.testMatch);
console.log("WebKit uses fresh per-file processes; all configured specs run once, without retries or relaxed assertions");
for(const run of runs)execFileSync(resolve(root,"node_modules/.bin/playwright"),["test","--config","experiments/collaboration/browser/playwright.config.mjs",...run.projects.map(project=>`--project=${project}`),...run.specs],{cwd:root,env:process.env,stdio:"inherit"});
