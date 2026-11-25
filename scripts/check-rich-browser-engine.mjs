/** Compare the selected rich browser execution with its Playwright discovery. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {saveEvidence} from "./candidate-release/evidence.mjs";
import {richBrowserCaseReport,richBrowserCommand,richBrowserDiscoveryPath,richBrowserFiles} from "./candidate-release/rich-browser-report.mjs";

const args=process.argv.slice(2);
assert.equal(args.length,1,"Usage: node scripts/check-rich-browser-engine.mjs <chromium|firefox|webkit>");
const [engine]=args,command=richBrowserCommand(engine);
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const reportPath=join(root,`target/rich-browser-${engine}-report.json`);
const retainedDiscovery=join(root,richBrowserDiscoveryPath(engine));
const directory=mkdtempSync(join(tmpdir(),"breditor-rich-browser-discovery-"));
const discoveryPath=join(directory,"discovery.json");
const invoke=(path,extra,stdout)=>execFileSync(process.execPath,[...command,...extra],{
 cwd:root,env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:path},stdio:["ignore",stdout,"inherit"],
});
function readReport(path){
 const stat=statSync(path);
 assert.ok(stat.isFile()&&stat.size<=32*1024*1024,"Expected a bounded rich browser report");
 return JSON.parse(readFileSync(path));
}

try{
 mkdirSync(dirname(reportPath),{recursive:true});
 rmSync(reportPath,{force:true});
 rmSync(retainedDiscovery,{force:true});
 invoke(discoveryPath,["--list","--reporter=json"],"ignore");
 const discovery=readReport(discoveryPath);
 saveEvidence(retainedDiscovery,discovery);
 invoke(reportPath,["--reporter=line,json"],"inherit");
 const evidence=richBrowserCaseReport(discovery,readReport(reportPath),engine,richBrowserFiles(root));
 saveEvidence(reportPath,evidence);
}finally{
 rmSync(directory,{recursive:true,force:true});
}
