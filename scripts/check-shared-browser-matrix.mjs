// Same coverage-preserving process isolation used by the legacy collaboration matrix.
import {execFileSync} from "node:child_process";
import {readdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import config from "../experiments/shared-browser/playwright.config.mjs";
import {sharedBrowserRuns} from "./shared-browser-runs.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),discovered=readdirSync(resolve(root,"experiments/shared-browser")).filter(name=>name.endsWith(".spec.mjs"));
console.log("Shared WebKit uses fresh per-file processes; every discovered spec runs once, without retries or relaxed assertions");
for(const run of sharedBrowserRuns(config.testMatch,discovered))execFileSync(resolve(root,"node_modules/.bin/playwright"),["test","--config","experiments/shared-browser/playwright.config.mjs",...run.projects.map(project=>`--project=${project}`),...run.patterns],{cwd:root,env:process.env,stdio:"inherit"});
