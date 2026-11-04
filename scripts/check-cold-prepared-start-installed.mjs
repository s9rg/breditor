/** Independently pack/install the explicit prepared cold-start workset. Module
 * and resource locations alone change; all functional assertions stay literal. */
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('Run the complete prepared-start case without filters');
const tests=['scripts/cold-room-prepared-start.test.mjs'];
const types=['scripts/fixtures/editor-consumer/types-cold-room-execution.ts'];
const expectedCases=1,sha=data=>createHash('sha256').update(data).digest('hex');
const workset='prepared-cold-start-installed';
const source=sourceEvidence(root),directory=fs.mkdtempSync('/private/tmp/breditor-'+workset+'-');
const archives=join(directory,'archives'),consumer=join(directory,'consumer');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const generatedOutput=JSON.parse(execFileSync(process.execPath,['scripts/check-generated-package-output.mjs'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}));
assert.equal(generatedOutput.passed,true);
const folders=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'];
const mapping=new Map(folders.map(folder=>[folder,JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).name]));
const packs=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...folders.map(folder=>join(root,'packages',folder))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json')));
const locked=searchConsumerLock(producer,packs.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));
fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));
for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'),'Installed packages cannot be workspace links');

const copied=[],seen=new Set();
function copyScript(path){
 if(seen.has(path))return;seen.add(path);
 const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),rewrites=[];
 const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,_prefix,folder,tail)=>{
  const name=mapping.get(folder);assert.ok(name,folder);
  let location=relative(dirname(target),join(consumer,'node_modules',name,tail));
  if(!location.startsWith('.'))location='./'+location;
  if(tail.endsWith('/')&&!location.endsWith('/'))location+='/';
  const to=quote+location+quote;rewrites.push([from,to]);return to;
 }).replace(/(['"])packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,folder,tail)=>{
  const name=mapping.get(folder);assert.ok(name,folder);const to=quote+'node_modules/'+name+'/'+tail+quote;rewrites.push([from,to]);return to;
 });
 let reversed=text;for(const[from,to]of rewrites.toReversed())reversed=reversed.replaceAll(to,from);
 assert.equal(reversed,original,'Only reversible installed module locations may change');
 assert.equal(text.includes('/Users/s/'),false);assert.equal(text.includes(root),false);
 assert.equal(/(?:\.\.\/)+packages\/breditor-/.test(text),false);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);
 copied.push({path,sourceSha256:sha(original),installedSha256:sha(text),reversibleModuleLocationsOnly:true});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){
  const dependency=resolve(dirname(join(root,path)),hit[1]);
  if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));
 }
}
for(const path of [...tests,...types])copyScript(path);
const runtime=[];
for(const path of [
 'target/owned-history-relay-native/release/examples/complete_cohort_control_functional',
 'target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional',
 ...fs.readdirSync(join(root,'target/promoted-shared-web')).map(name=>'target/promoted-shared-web/'+name),
 'crates/breditor-core/tests/fixtures/rich-local-root.json',
]){
 const from=join(root,path),to=join(consumer,path),bytes=fs.readFileSync(from);
 fs.mkdirSync(dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{mode:fs.statSync(from).mode});
 assert.equal(sha(fs.readFileSync(to)),sha(bytes));runtime.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const normalWasmSha256=sha(fs.readFileSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
let matchingPackageDistFiles=0;
for(const[folder,name]of mapping){
 const from=join(root,'packages',folder),to=join(consumer,'node_modules',name);
 function compare(path){
  for(const child of fs.readdirSync(join(from,path),{withFileTypes:true})){
   const next=join(path,child.name);assert.equal(child.isSymbolicLink(),false);
   if(child.isDirectory())compare(next);else{assert.ok(child.isFile());assert.equal(sha(fs.readFileSync(join(from,next))),sha(fs.readFileSync(join(to,next))),next);matchingPackageDistFiles++;}
  }
 }
 compare('dist');
}
const state={format:'breditor/'+workset,formatVersion:1,source,directory,consumer,generatedOutput,registryArtifacts,workspaceLinks:false,copied,runtime,normalWasmSha256,matchingPackageDistFiles,archives:packs.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),complete:false,releaseReady:false};
saveEvidence(join(directory,'running.json'),state);
saveEvidence(join(root,'target/'+workset+'-running.json'),{directory,consumer});
console.log(JSON.stringify({directory,phase:'strict-types-and-complete-restart-association'}));
let child,timer,killTimer,stop;
const interrupted=()=>{stop?.('SIGTERM');killTimer??=setTimeout(()=>stop?.('SIGKILL'),10000);};
process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);
try{
 const output=execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','es2022','--module','nodenext','--moduleResolution','nodenext','--lib','es2022,dom,dom.iterable','--skipLibCheck','false',...types],{cwd:consumer,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 fs.writeFileSync(join(directory,'types.log'),output);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');
 child=spawn(process.execPath,['--test','--test-concurrency=1',...tests],{cwd:consumer,stdio:['ignore',fd,fd],detached:true});fs.closeSync(fd);
 // Own only this detached test child's process group, never our caller's group.
 stop=signal=>{if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
 let timedOut=false;
 timer=setTimeout(()=>{timedOut=true;stop('SIGTERM');killTimer=setTimeout(()=>stop('SIGKILL'),10000);},60*60*1000);
 const execution=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',(code,signal)=>done({pid:child.pid,code,signal}));});
 clearTimeout(timer);clearTimeout(killTimer);saveEvidence(join(directory,'exit.json'),execution);
 assert.equal(timedOut,false);assert.equal(execution.code,0,'Read '+logPath);assert.equal(execution.signal,null);
 assert.ok(fs.statSync(logPath).size<=8*1024*1024);
 const log=fs.readFileSync(logPath,'utf8');
 for(const[key,n]of[['tests',expectedCases],['pass',expectedCases],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.match(log,/PREPARED_COLD_BASELINE_MISSING_RUN /);assert.match(log,/PREPARED_COLD_START_COMPLETE /);
 assert.deepEqual(sourceEvidence(root),source);
 for(const row of runtime)assert.equal(sha(fs.readFileSync(join(root,row.path))),row.sha256);
 const scope='Explicit absent-only cold start from a real seven-family prepared execution. Existing-only resume refusal, untouched occupied journals, declined execution, exact reconstructed checkpoints and future document/comment histories. No full Native process association, physical storage durability or V1 claim.';
 Object.assign(state,{complete:true,passed:true,cases:expectedCases,sourceUnchanged:true,strictPrivateTypes:true,log:logPath,logSha256:sha(log),scope});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/'+workset+'-result.json'),state);
 console.log(JSON.stringify({directory,passed:true,cases:expectedCases,matchingPackageDistFiles}));
}catch(error){
 saveEvidence(join(directory,'failed.json'),{...state,complete:true,passed:false,error:String(error)});throw error;
}finally{clearTimeout(timer);clearTimeout(killTimer);process.off('SIGTERM',interrupted);process.off('SIGINT',interrupted);}
