/** Qualify the isolated Native restart boundary from source and independently
 * installed packages. Nine mandatory cases; no full client handoff/V1 claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
if(process.argv.length!==2)throw Error('All Native joint restart cases are mandatory');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),sha=b=>createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync(join(root,'target/native-joint-process-native-build.json')));assert.equal(build.complete,true);assert.equal(build.exitCode,0);assert.equal(build.sourceUnchanged,true);assert.deepEqual(build.source,source);
const directory=fs.mkdtempSync(join(root,'target/native-joint-process-qualification-')),sourceRunner=join(directory,'source'),archives=join(directory,'archives'),consumer=join(directory,'consumer');for(const path of[sourceRunner,archives,consumer])fs.mkdirSync(path);
const packages=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'],mapping=new Map(packages.map(name=>[name,JSON.parse(fs.readFileSync(join(root,'packages',name,'package.json'))).name]));
const tests=['native-joint-process-recovery.test.mjs','native-joint-process-refusal.test.mjs','native-joint-publication-compat.test.mjs','native-process-recovery-direct.test.mjs','native-process-recovery-failed-boot.test.mjs'];
const nativePaths={native_joint_process_recovery_functional:'target/native-joint-process-native/debug/examples/native_joint_process_recovery_functional',native_publication_sdk_functional:'target/joint-publication-native/debug/examples/native_publication_sdk_functional',native_process_recovery_functional:'target/reconciled-packet-native/release/examples/native_process_recovery_functional'};
for(const row of build.binaries){assert.equal(sha(fs.readFileSync(row.path)),row.sha256);assert.ok(nativePaths[basename(row.path)]);}
assert.equal(build.binaries.length,3);
const wasmPath='packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',normalWasmSha256=sha(fs.readFileSync(join(root,wasmPath)));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/native-joint-process-qualification',formatVersion:1,source,build,normalWasmSha256,tests,caseCount:9,directory,complete:false,releaseReady:false,wholeRoomActivated:false,v1GatesOpen:13};saveEvidence(join(directory,'running.json'),state);
function copyTests(target,installed){
 const seen=new Set(),rows=[];
 function copy(path){
  if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),file=join(target,path),rewrites=[];
  const text=installed?original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,q,_prefix,folder,tail)=>{const name=mapping.get(folder);assert.ok(name);let location=relative(dirname(file),join(target,'node_modules',name,tail));if(!location.startsWith('.'))location='./'+location;if(tail.endsWith('/')&&!location.endsWith('/'))location+='/';const to=q+location+q;rewrites.push([from,to]);return to;}).replace(/(['"])packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,q,folder,tail)=>{const name=mapping.get(folder);assert.ok(name);const to=q+'node_modules/'+name+'/'+tail+q;rewrites.push([from,to]);return to;}):original;
  let reversed=text;for(const[from,to]of rewrites.toReversed())reversed=reversed.replaceAll(to,from);assert.equal(reversed,original);
  fs.mkdirSync(dirname(file),{recursive:true});fs.writeFileSync(file,text);rows.push({path,sourceSha256:sha(original),executedSha256:sha(text),reversibleModuleLocationsOnly:true});
  for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copy(relative(root,dependency));}
 }
 for(const file of tests)copy('scripts/'+file);return rows;
}
function nativeFiles(target){
 const rows=[];for(const pin of build.binaries){const path=nativePaths[basename(pin.path)],file=join(target,path);fs.mkdirSync(dirname(file),{recursive:true});fs.copyFileSync(pin.path,file);assert.equal(sha(fs.readFileSync(file)),pin.sha256);rows.push({path,bytes:pin.bytes,sha256:pin.sha256});}
 fs.writeFileSync(join(target,'target/native-joint-process-native-build.json'),JSON.stringify(build));return rows;
}
function run(target){
 const logFile=join(target,'contracts.log'),fd=fs.openSync(logFile,'wx');let result;try{result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(file=>'scripts/'+file)],{cwd:target,stdio:['ignore',fd,fd],timeout:15*60*1000});}finally{fs.closeSync(fd);}
 assert.equal(result.error,undefined);assert.equal(result.status,0,'Read '+logFile);const bytes=fs.readFileSync(logFile);assert.ok(bytes.length<1024*1024);const log=bytes.toString();for(const[key,n]of[['tests',9],['pass',9],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 const observations=log.split('\n').filter(row=>row.startsWith('# NATIVE_JOINT_PROCESS ')).map(row=>JSON.parse(row.slice('# NATIVE_JOINT_PROCESS '.length)));assert.deepEqual(observations.map(o=>o.initialStage),['prepared','committed','published']);for(const o of observations){assert.equal(o.restarts.length,3);assert.equal(o.wholeRoomActivated,false);for(const r of o.restarts){assert.equal(r.signal,'SIGKILL');assert.notEqual(r.oldPid,r.newPid);assert.equal(r.protectedStreams,14);assert.equal(r.originalCheckpointBytesUnchanged,true);}}
 const refusals=log.split('\n').filter(row=>row.startsWith('# NATIVE_JOINT_REFUSAL ')).map(row=>JSON.parse(row.slice('# NATIVE_JOINT_REFUSAL '.length)));assert.equal(refusals.length,2);for(const o of refusals){assert.equal(o.actualExitSignal,'SIGKILL');assert.equal(o.authorityUnchanged,true);assert.equal(o.corruptBytesPreserved,true);}
 return{passed:true,tests:9,log:logFile,logSha256:sha(bytes),observations,refusals};
}
try{
 console.log(JSON.stringify({directory,phase:'source-nine-cases'}));fs.symlinkSync(join(root,'packages'),join(sourceRunner,'packages'),'dir');state.sourceScripts=copyTests(sourceRunner,false);state.sourceNative=nativeFiles(sourceRunner);state.sourceResult=run(sourceRunner);saveEvidence(join(directory,'source-complete.json'),state);
 console.log(JSON.stringify({directory,phase:'pack-install-nine-cases'}));
 const packed=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...packages.map(p=>join(root,'packages',p))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
 const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packed.map(p=>({name:p.name,path:join(archives,p.filename)})));locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
 fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
 state.registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
 state.archives=packed.map(p=>({name:p.name,file:join(archives,p.filename),sha256:sha(fs.readFileSync(join(archives,p.filename)))}));state.consumerScripts=copyTests(consumer,true);state.consumerNative=nativeFiles(consumer);
 const installedWasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm');assert.equal(sha(fs.readFileSync(installedWasm)),normalWasmSha256);state.consumerResult=run(consumer);
 assert.deepEqual(sourceEvidence(root),source);for(const row of build.binaries)assert.equal(sha(fs.readFileSync(row.path)),row.sha256);assert.equal(sha(fs.readFileSync(join(root,wasmPath))),normalWasmSha256);
 Object.assign(state,{complete:true,passed:true,sourceUnchanged:true,workspaceLinksInInstalledConsumer:false});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/native-joint-process-qualification.json'),state);console.log(JSON.stringify({directory,passed:true,sourceTests:9,installedTests:9}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
