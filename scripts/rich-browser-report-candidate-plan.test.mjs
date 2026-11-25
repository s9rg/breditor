import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,utimesSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {test} from "node:test";
import {fileEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {richBrowserCaseReport,richBrowserRunner,validateRichBrowserReport} from "./candidate-release/rich-browser-report.mjs";
import {candidateCoverage} from "./check-candidate-coverage.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";

const files=["paragraph.spec.mjs","table.spec.mjs"];
const engines=["chromium","firefox","webkit"];

function report(engine){
 const projects=engine==="webkit"?files.map((file,index)=>({name:`webkit-${index+1}`,testMatch:[`**/${file}`]})):[{name:engine}];
 return {config:{projects},stats:{expected:2,skipped:0,unexpected:0,flaky:0},errors:[],suites:files.map((file,index)=>{
  const project=engine==="webkit"?`webkit-${index+1}`:engine;
  return {file,suites:[{file:"registered-checks.mjs",specs:[{
   id:`spec-${index}`,file:"registered-checks.mjs",tests:[{
    projectId:project,projectName:project,status:"expected",expectedStatus:"passed",results:[{status:"passed"}],
   }],
  }]}]};
 })};
}

test("rich browser evidence covers all candidate entry specs with one passing result on the selected engine",()=>{
 for(const engine of engines)validateRichBrowserReport(report(engine),engine,files);
 const replacements=[
  [value=>{value.stats.skipped=1;},/zero skips or failures/],
  [value=>{value.suites.pop();},/spec file coverage/],
  [value=>{value.suites[1].file=files[0];},/spec file coverage/],
  [value=>{value.suites[1].suites[0].specs[0].id="spec-0";},/repeated rich browser/],
  [value=>{value.suites[1].suites=[];},/Missing executed/],
  [value=>{value.suites[1].suites[0].specs[0].tests[0].projectName="firefox";},/Wrong rich browser/],
  [value=>{value.suites[1].suites[0].specs[0].tests[0].results=[];},/Missing passing/],
  [value=>{value.stats.expected=3;},/result count differs/],
 ];
 for(const [replace,message] of replacements){
  const modified=report("webkit");replace(modified);
  assert.throws(()=>validateRichBrowserReport(modified,"webkit",files),message);
 }
});

test("every discovered rich case executes in its original file and bounded browser project",()=>{
 for(const engine of engines){
  const discovery=report(engine);
  discovery.suites[0].suites[0].specs.push({
   ...structuredClone(discovery.suites[0].suites[0].specs[0]),id:"another-case",
  });
  const passing=structuredClone(discovery);
  passing.stats.expected=3;
  assert.equal(richBrowserCaseReport(discovery,passing,engine,files).formatVersion,1);
  const incomplete=structuredClone(passing);
  incomplete.suites[0].suites[0].specs.pop();
  incomplete.stats.expected=2;
  validateRichBrowserReport(incomplete,engine,files);
  assert.throws(()=>richBrowserCaseReport(discovery,incomplete,engine,files),/differ from the discovered case inventory/);
 }
 const discovery=report("webkit"),reassigned=structuredClone(discovery);
 const test=reassigned.suites[0].suites[0].specs[0].tests[0];
 test.projectName=test.projectId="webkit-2";
 assert.throws(()=>richBrowserCaseReport(discovery,reassigned,"webkit",files),/Wrong rich browser webkit project/);
});

test("candidate qualification and coverage review reject incomplete retained rich browser reports",async t=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-rich-browser-report-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=args=>execFileSync("git",args,{cwd:root,stdio:"ignore"});
 git(["init","-q"]);
 writeFileSync(join(root,".gitignore"),"target/\ndist/\n");
 mkdirSync(join(root,"experiments/rich-browser"),{recursive:true});
 for(const file of files)writeFileSync(join(root,"experiments/rich-browser",file),"");
 mkdirSync(join(root,"scripts"));
 writeFileSync(join(root,richBrowserRunner),"");
 git(["add","."]);
 git(["-c","user.name=Candidate Fixture","-c","user.email=fixture@example.test","commit","-qm","Candidate source"]);
 const plan=candidateReleasePlan({profile:"rich-browser-matrix"});
 const incompleteReport=report("webkit");
 incompleteReport.suites.pop();
 const envelope=(engine,result)=>({format:"breditor/rich-browser-case-report",formatVersion:1,discovery:report(engine),report:result});
 const run=async incomplete=>runCandidateChecks(plan,{root,report:()=>{},execute:async(check,{logPath})=>{
  writeFileSync(logPath,check.id);
  const engine=engines.find(engine=>check.id===`rich-browser-${engine}`);
  for(const artifact of check.artifacts){
   const path=join(root,artifact.path);
   mkdirSync(dirname(path),{recursive:true});
   writeFileSync(path,engine?JSON.stringify(envelope(engine,incomplete&&engine==="webkit"?incompleteReport:report(engine))):check.id);
   const now=Date.now()/1000;
   utimesSync(path,now+2,now+2);
  }
  return {status:"passed",exitCode:0,signal:null};
 }});

 const invalid=await run(true),failed=invalid.result.stages.at(-1);
 assert.equal(invalid.exitCode,1);
 assert.equal(failed.id,"rich-browser-webkit");
 assert.equal(failed.status,"failed");
 assert.equal(failed.exitCode,0);
 assert.match(failed.error,/spec file coverage/);
 assert.deepEqual(JSON.parse(readFileSync(join(dirname(invalid.manifest),failed.artifacts[0].retainedPath))),envelope("webkit",incompleteReport));

 const valid=await run(false);
 assert.equal(valid.exitCode,0,valid.result.error);
 assert.equal(candidateCoverage(root,[valid.manifest]).coveredStages,plan.checks.length);
 const directory=dirname(valid.manifest),[retained]=valid.result.stages.at(-1).artifacts;
 writeFileSync(join(directory,retained.retainedPath),JSON.stringify(envelope("webkit",incompleteReport)));
 const changed=fileEvidence(directory,retained.retainedPath);
 Object.assign(retained,{bytes:changed.bytes,sha256:changed.sha256});
 saveEvidence(valid.manifest,valid.result);
 assert.throws(()=>candidateCoverage(root,[valid.manifest]),/spec file coverage/);
 writeFileSync(join(directory,retained.retainedPath),JSON.stringify(report("webkit")));
 const legacy=fileEvidence(directory,retained.retainedPath);
 Object.assign(retained,{bytes:legacy.bytes,sha256:legacy.sha256});
 saveEvidence(valid.manifest,valid.result);
 assert.throws(()=>candidateCoverage(root,[valid.manifest]),/Missing retained rich browser webkit discovery/);
});
