import {fileURLToPath} from "node:url";
import installed from "../editor-browser/playwright.config.mjs";

const {use}=installed.projects.find(project=>project.name==="chromium");
export default {
 ...installed,
 outputDir:"../../target/editor-browser-rollover-results",
 timeout:360000,
 globalTimeout:420000,
 reporter:[["line"],["json",{outputFile:fileURLToPath(new URL("../../target/editor-browser-rollover-report.json",import.meta.url))}]],
 projects:[{name:"chrome",use:{...use,channel:"chrome"}}],
};
