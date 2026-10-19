/** Reproduce and guard the candidate SDK build order without removing workspace outputs. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {cpSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {sourceEvidence} from "./candidate-release/evidence.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
if(process.argv.length!==2)throw Error("Usage: node scripts/check-candidate-sdk-build.mjs; keeps temporary build evidence, never publishes");
const source=sourceEvidence(root),temporary=mkdtempSync(join(tmpdir(),"breditor-clean-candidate-sdk-"));
const packages=["breditor-browser","breditor-wasm","breditor-experimental-rich-content","breditor-collaboration","breditor-editor"];
const plan=candidateReleasePlan({profile:"functional"});
const stage=id=>{const result=plan.checks.find(check=>check.id===id);assert.ok(result,id);return result;};
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");

/** Bind copied prerequisites and prove that none of the producer outputs were changed. */
function outputInventory(){
 const files=[];
 const visit=path=>{const stat=lstatSync(path);assert.ok(!stat.isSymbolicLink(),"Generated package output cannot escape through a link");
  if(stat.isDirectory())for(const name of readdirSync(path).sort())visit(join(path,name));
  else{assert.ok(stat.isFile()&&stat.size<=32*1024*1024);files.push({path:relative(root,path),bytes:stat.size,sha256:hash(readFileSync(path))});}
  assert.ok(files.length<=8192,"Bounded generated prerequisite inventory");
 };
 for(const name of packages){const path=join(root,"packages",name,"dist");assert.ok(existsSync(path),`Build the declared prerequisite first: ${name}/dist`);visit(path);}
 assert.ok(files.reduce((sum,file)=>sum+file.bytes,0)<=256*1024*1024);
 return files;
}
const before=outputInventory();

/** Only the default browser/Wasm and fresh candidate native bindings are prerequisites.
 * No compiled rich-browser, shared SDK or editor SDK files enter either fixture. */
function fixture(name){
 const work=join(temporary,name);mkdirSync(work);
 for(const file of ["package.json","tsconfig.base.json"])cpSync(join(root,file),join(work,file));
 for(const name of packages){
  const from=join(root,"packages",name),to=join(work,"packages",name);
  cpSync(from,to,{recursive:true,filter:path=>{const rel=relative(from,path).split("\\").join("/");return rel!=="node_modules"&&!rel.startsWith("node_modules/")&&(name==="breditor-browser"||name==="breditor-wasm"||rel!=="dist"&&!rel.startsWith("dist/"));}});
  if(name==="breditor-experimental-rich-content"){
   mkdirSync(join(to,"dist"));for(const file of readdirSync(join(from,"dist")))if(file!=="browser")cpSync(join(from,"dist",file),join(to,"dist",file),{recursive:true});
  }
  if(name==="breditor-collaboration")cpSync(join(from,"dist/runtime"),join(to,"dist/runtime"),{recursive:true});
 }
 mkdirSync(join(work,"node_modules"));
 for(const name of readdirSync(join(root,"node_modules")))if(name!=="@breditor"&&name!==".package-lock.json")symlinkSync(join(root,"node_modules",name),join(work,"node_modules",name));
 mkdirSync(join(work,"node_modules/@breditor"));
 for(const name of packages){const path=join(work,"packages",name),metadata=JSON.parse(readFileSync(join(path,"package.json")));symlinkSync(path,join(work,"node_modules",metadata.name));}
 assert.equal(existsSync(join(work,"packages/breditor-experimental-rich-content/dist/browser")),false);
 assert.equal(existsSync(join(work,"packages/breditor-collaboration/dist/index.js")),false);
 assert.equal(existsSync(join(work,"packages/breditor-editor/dist/index.js")),false);
 return work;
}
function execute(check,work,name){
 const outcome=spawnSync(check.command,check.args,{cwd:work,env:{...process.env,...check.env},encoding:"utf8",maxBuffer:8*1024*1024,timeout:120000});
 const output=(outcome.stdout??"")+(outcome.stderr??""),path=join(temporary,name+".log");writeFileSync(path,output);
 return{command:check.command,args:check.args,status:outcome.status,signal:outcome.signal,error:outcome.error?.code??null,log:{path,bytes:Buffer.byteLength(output),sha256:hash(output)},output};
}
const negative=fixture("missing-rich-build"),former=execute(stage("collaboration-build"),negative,"before-fix");
// The real emitting tsc command returns diagnostics-with-output status 2.
assert.equal(former.status,2,`The former missing-prerequisite order must reproduce a compiler failure: ${former.log.path}`);
assert.equal(former.error,null);assert.match(former.output,/TS2307: Cannot find module '\.\/dist\/browser\/core\.js'/);
const corrected=fixture("declared-build-order"),results=[];
for(const id of ["rich-browser-build","collaboration-build","editor-build","rich-browser-types","collaboration-types","editor-types"]){
 const result=execute(stage(id),corrected,id);assert.equal(result.status,0,`Candidate SDK stage failed: ${id}; ${result.log.path}`);assert.equal(result.error,null);const{output,...evidence}=result;results.push({id,...evidence});
}
for(const path of ["breditor-experimental-rich-content/dist/browser/writing_tools_panel.js","breditor-experimental-rich-content/dist/browser/writing_tools_panel.d.ts","breditor-collaboration/dist/index.js","breditor-collaboration/dist/index.d.ts","breditor-editor/dist/writing_tools_react.js","breditor-editor/dist/writing_tools_react.d.ts"])assert.ok(existsSync(join(corrected,"packages",path)),path);
assert.deepEqual(outputInventory(),before,"The producer's generated outputs must remain untouched");
assert.deepEqual(sourceEvidence(root),source,"The producer source must remain unchanged");
const{output,...negativeEvidence}=former;
const report={format:"breditor/candidate-sdk-build",formatVersion:1,passed:true,source,sourceUnchanged:true,workspaceOutputsUnchanged:true,temporary,prerequisiteOutputs:before,negative:{expectedFailure:true,missingRichBrowserBuild:true,...negativeEvidence},corrected:results,scope:"Two isolated copied-source trees, initially without rich-browser/shared/editor compiled SDK files. The actual declared build and type commands reproduce the former TS2307 failure then pass in corrected order. External development dependencies are borrowed via links; internal package links target only each copied tree. Previously built default browser/Wasm artifacts and candidate native bindings are explicit copied prerequisites, not a complete clean-checkout/native/npm-install or hosted CI qualification. No workspace outputs removed, no network, no publication."};
writeFileSync(join(root,"target/candidate-sdk-build.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({format:report.format,passed:true,temporary,negative:report.negative,corrected:results,source,workspaceOutputsUnchanged:true,scope:report.scope},null,2));
