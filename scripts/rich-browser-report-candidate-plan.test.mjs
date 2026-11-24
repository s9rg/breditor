import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,utimesSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {test} from "node:test";
import {fileEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {validateRichBrowserReport} from "./candidate-release/rich-browser-report.mjs";
import {candidateCoverage} from "./check-candidate-coverage.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";

const files=["paragraph.spec.mjs","table.spec.mjs"];
const engines=["chromium","firefox","webkit"];

function report(engine){
 return {stats:{expected:2,skipped:0,unexpected:0,flaky:0},errors:[],suites:files.map((file,index)=>{
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

test("candidate qualification and coverage review reject incomplete retained rich browser reports",async t=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-rich-browser-report-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=args=>execFileSync("git",args,{cwd:root,stdio:"ignore"});
 git(["init","-q"]);
 writeFileSync(join(root,".gitignore"),"target/\ndist/\n");
 mkdirSync(join(root,"experiments/rich-browser"),{recursive:true});
 for(const file of files)writeFileSync(join(root,"experiments/rich-browser",file),"");
 git(["add","."]);
 git(["-c","user.name=Candidate Fixture","-c","user.email=fixture@example.test","commit","-qm","Candidate source"]);
 const plan=candidateReleasePlan({profile:"rich-browser-matrix"});
 const incompleteReport=report("webkit");
 incompleteReport.suites.pop();
 const run=async incomplete=>runCandidateChecks(plan,{root,report:()=>{},execute:async(check,{logPath})=>{
  writeFileSync(logPath,check.id);
  const engine=engines.find(engine=>check.id===`rich-browser-${engine}`);
  for(const artifact of check.artifacts){
   const path=join(root,artifact.path);
   mkdirSync(dirname(path),{recursive:true});
   writeFileSync(path,engine?JSON.stringify(incomplete&&engine==="webkit"?incompleteReport:report(engine)):check.id);
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
 assert.deepEqual(JSON.parse(readFileSync(join(dirname(invalid.manifest),failed.artifacts[0].retainedPath))),incompleteReport);

 const valid=await run(false);
 assert.equal(valid.exitCode,0,valid.result.error);
 assert.equal(candidateCoverage(root,[valid.manifest]).coveredStages,plan.checks.length);
 const directory=dirname(valid.manifest),[retained]=valid.result.stages.at(-1).artifacts;
 writeFileSync(join(directory,retained.retainedPath),JSON.stringify(incompleteReport));
 const changed=fileEvidence(directory,retained.retainedPath);
 Object.assign(retained,{bytes:changed.bytes,sha256:changed.sha256});
 saveEvidence(valid.manifest,valid.result);
 assert.throws(()=>candidateCoverage(root,[valid.manifest]),/spec file coverage/);
});
