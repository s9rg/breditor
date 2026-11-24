import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";

export function validateRichBrowserReport(report,engine,expectedFiles){
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
    assert.ok(selectedProject&&test.projectId===test.projectName&&(!project||project===test.projectName),
     `Wrong rich browser ${engine} project in ${fileSuite.file}`);
    project=test.projectName;
    specIds.add(spec.id);
   }
  }
  assert.ok(project,`Missing executed rich browser ${engine} specs in ${fileSuite.file}`);
 }
 assert.equal(specIds.size,expected,`Rich browser ${engine} result count differs from the report summary`);
}

export function verifyRichBrowserStage(root,directory,stage){
 const match=/^rich-browser-(chromium|firefox|webkit)$/u.exec(stage.id);
 if(!match)return;
 const engine=match[1],path=`target/rich-browser-${engine}-report.json`,retained=`artifacts/${stage.id}/${path}`;
 const artifact=stage.artifacts.find(item=>item.path===path);
 assert.ok(artifact?.retainedPath===retained,`Missing retained rich browser ${engine} report`);
 const bytes=readFileSync(resolve(directory,retained));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),artifact.sha256,`Retained rich browser ${engine} report changed`);
 const files=readdirSync(resolve(root,"experiments/rich-browser")).filter(file=>file.endsWith(".spec.mjs"));
 validateRichBrowserReport(JSON.parse(bytes),engine,files);
}
