/** Independent packages exercise all three selected Native document/comment
 * combinations with the real authenticated server and exact future histories. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {copySharedRuntimeForActivation} from './candidate-release/shared-runtime-evidence.mjs';
import {historicalSharedWasmSha256} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {independentCurrentTests as tests,independentCurrentTypes as types,independentCurrentData as data,independentCurrentCaseCount as count} from './independent-current-reconciliation-plan.mjs';
import {checkIndependentCurrentEvidence} from './independent-current-reconciliation-evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('All three independent policy cases and real Native hosts are mandatory');
const source=sourceEvidence(root),directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-independent-current-reconciliation-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer'),sha=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const sharedRuntime=copySharedRuntimeForActivation(root,consumer,source);
const packages=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'],mapping=new Map(packages.map(name=>[name,JSON.parse(fs.readFileSync(join(root,'packages',name,'package.json'))).name]));
const packed=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...packages.map(name=>join(root,'packages',name))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packed.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));
for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
const copied=[],seen=new Set();
function copyScript(path){
 if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),rewrites=[];
 const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,_prefix,folder,tail)=>{
  const name=mapping.get(folder);assert.ok(name);let location=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!location.startsWith('.'))location='./'+location;if(tail.endsWith('/')&&!location.endsWith('/'))location+='/';const to=quote+location+quote;rewrites.push([from,to]);return to;
 }).replace(/(['"])packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(from,quote,folder,tail)=>{const name=mapping.get(folder);assert.ok(name);const to=quote+'node_modules/'+name+'/'+tail+quote;rewrites.push([from,to]);return to;});
 let reversed=text;for(const[from,to]of rewrites.toReversed())reversed=reversed.replaceAll(to,from);assert.equal(reversed,original,'Only reversible installed module locations may change');
 assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-/.test(text),false);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(original),installedSha256:sha(text),reversibleModuleLocationsOnly:true});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));}
}
for(const test of tests)copyScript('scripts/'+test);
for(const file of types)copyScript(file);
for(const path of data){const from=join(root,path),to=join(consumer,path);fs.mkdirSync(dirname(to),{recursive:true});fs.copyFileSync(from,to);assert.equal(sha(fs.readFileSync(from)),sha(fs.readFileSync(to)));copied.push({path,sourceSha256:sha(fs.readFileSync(from)),installedSha256:sha(fs.readFileSync(to))});}
const native=[];
for(const target of ['server-metadata-native','server-native-dependencies-native','server-packet-inspection-native'])for(const name of ['selected_suggestion_delivery_functional','complete_cohort_control_functional']){
 const path='target/'+target+'/release/examples/'+name,from=join(root,path),to=join(consumer,path);fs.mkdirSync(dirname(to),{recursive:true});fs.copyFileSync(from,to);assert.equal(sha(fs.readFileSync(to)),sha(fs.readFileSync(from)));native.push({path,sha256:sha(fs.readFileSync(from))});
}
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(wasm));assert.equal(normalWasmSha256,sharedRuntime?.wasmSha256??historicalSharedWasmSha256);
const compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler));
const state={format:'breditor/independent-current-reconciliation-installed-consumer',formatVersion:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,copied,native,normalWasmSha256,sharedRuntimeReceiptSha256:sharedRuntime?.sha256??null,compilerSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),releaseReady:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-public-types-and-genuine-all-family-receipt-containment'}));
try{
 const typesLog=execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...types],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
 fs.writeFileSync(join(directory,'types.log'),typesLog);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let execution;try{execution=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(test=>'scripts/'+test)],{cwd:consumer,env:{...process.env,...sharedRuntime?.environment},stdio:['ignore',fd,fd],timeout:7200000});}finally{fs.closeSync(fd);}assert.equal(execution.error,undefined);assert.equal(execution.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<=8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 checkIndependentCurrentEvidence(log);
 for(const[key,n]of [['tests',count],['pass',count],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);for(const row of native)assert.equal(sha(fs.readFileSync(join(root,row.path))),row.sha256);
 Object.assign(state,{complete:true,passed:true,tests:count,sourceUnchanged:true,strictPublicTypes:true,log:join(directory,'contracts.log'),logSha256:sha(log),scope:'Three distinct independently selected Native document/comment history pairs across seven genuine clients. Real authenticated protocol passes, actual managed image uploads, uncached catalogs and complete current Native/source/provider reads preserve literal policies, Pending/cache/queue facts and exact future document/comment content and history depths. Guarded current reads fetch no packet/raster bodies and the actual guarded cache counter stays zero. Independent offline installed packages and strict public types have no workspace links. Controlled IDB/locks/raster presentation; no whole-room activation or V1 approval.'});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/independent-current-reconciliation-installed-consumer.json'),state);console.log(JSON.stringify({directory,passed:true,tests:count,workspaceLinks:false,sourceUnchanged:true}));
}catch(error){
 if(error.stdout)fs.writeFileSync(join(directory,'failed-stdout.log'),error.stdout);if(error.stderr)fs.writeFileSync(join(directory,'failed-stderr.log'),error.stderr);
 saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;
}
