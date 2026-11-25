import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import {validatePlaywrightCaseInventory} from "./playwright-case-inventory.mjs";

export const richBrowserEngines=Object.freeze(["chromium","firefox","webkit"]);
export const richBrowserRunner="scripts/check-rich-browser-engine.mjs";
const evidenceFormat="breditor/rich-browser-case-report";
export const usesRichBrowserDiscovery=root=>existsSync(resolve(root,richBrowserRunner));

export function richBrowserCommand(engine){
 assert.ok(richBrowserEngines.includes(engine),"Choose chromium, firefox or webkit");
 return ["node_modules/@playwright/test/cli.js","test","--config","experiments/rich-browser/playwright.config.mjs",
  "--project="+(engine==="webkit"?"webkit*":engine),"--output=target/rich-browser-results/"+engine];
}

export function richBrowserFiles(root){
 return readdirSync(resolve(root,"experiments/rich-browser")).filter(file=>file.endsWith(".spec.mjs"));
}

export function validateRichBrowserReport(report,engine,expectedFiles,expectedProjects){
 const {expected,skipped,unexpected,flaky}=report.stats??{};
 assert.ok(Number.isSafeInteger(expected)&&expected>0&&skipped===0&&unexpected===0&&flaky===0&&
  Array.isArray(report.errors)&&report.errors.length===0,
  `Rich browser ${engine} report must contain successful results with zero skips or failures`);
 assert.ok(Array.isArray(report.suites),`Missing rich browser ${engine} file suites`);
 const observedFiles=report.suites.map(suite=>suite.file);
 assert.ok(observedFiles.length===expectedFiles.length&&new Set(observedFiles).size===expectedFiles.length&&
  expectedFiles.every(file=>observedFiles.includes(file)),`Rich browser ${engine} spec file coverage differs from the candidate`);

 const specIds=new Set();
 for(const fileSuite of report.suites){
  const suites=[fileSuite];
  let project;
  for(const suite of suites){
   suites.push(...(suite.suites??[]));
   for(const spec of suite.specs??[]){
    // Imported test registrations report the helper's location. The file suite identifies the entry point.
    assert.ok(typeof spec.id==="string"&&spec.id&&!specIds.has(spec.id),
     `Invalid or repeated rich browser ${engine} spec in ${fileSuite.file}`);
    const [test]=spec.tests??[];
    assert.ok(spec.tests?.length===1&&test.status==="expected"&&test.expectedStatus==="passed"&&
     test.results?.length===1&&test.results[0].status==="passed",`Missing passing rich browser ${engine} test in ${fileSuite.file}`);
    const selectedProject=engine==="webkit"?/^webkit-[1-9][0-9]*$/u.test(test.projectName):test.projectName===engine;
    assert.ok(selectedProject&&test.projectId===test.projectName&&(!project||project===test.projectName)&&
     (!expectedProjects||expectedProjects.get(fileSuite.file)===test.projectName),
     `Wrong rich browser ${engine} project in ${fileSuite.file}`);
    project=test.projectName;
    specIds.add(spec.id);
   }
  }
  assert.ok(project,`Missing executed rich browser ${engine} specs in ${fileSuite.file}`);
 }
 assert.equal(specIds.size,expected,`Rich browser ${engine} result count differs from the report summary`);
}

export function richBrowserCaseReport(discovery,report,engine,files){
 const configured=discovery.config?.projects;
 assert.ok(Array.isArray(configured),"Missing rich browser discovery projects");
 const projects=configured.filter(project=>engine==="webkit"?/^webkit-[1-9][0-9]*$/u.test(project.name):project.name===engine);
 const expected=new Map(files.map(file=>{
  const selected=engine==="webkit"?projects.filter(project=>project.testMatch?.includes(`**/${file}`)):projects;
  assert.equal(selected.length,1,`Rich browser spec ${file} must belong to one ${engine} project`);
  return [file,selected[0].name];
 }));
 validateRichBrowserReport(report,engine,files,expected);
 validatePlaywrightCaseInventory(discovery,report,projects.map(project=>project.name));
 return {format:evidenceFormat,formatVersion:1,discovery,report};
}

export function verifyRichBrowserStage(root,directory,stage){
 const match=/^rich-browser-(chromium|firefox|webkit)$/u.exec(stage.id);
 if(!match)return;
 const engine=match[1],path=`target/rich-browser-${engine}-report.json`,retained=`artifacts/${stage.id}/${path}`;
 const artifact=stage.artifacts.find(item=>item.path===path);
 assert.ok(artifact?.retainedPath===retained,`Missing retained rich browser ${engine} report`);
 const bytes=readFileSync(resolve(directory,retained));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),artifact.sha256,`Retained rich browser ${engine} report changed`);
 const files=richBrowserFiles(root),evidence=JSON.parse(bytes);
 if(!usesRichBrowserDiscovery(root)){
  validateRichBrowserReport(evidence,engine,files);
  return;
 }
 assert.ok(evidence.format===evidenceFormat&&evidence.formatVersion===1,`Missing retained rich browser ${engine} discovery`);
 richBrowserCaseReport(evidence.discovery,evidence.report,engine,files);
}
