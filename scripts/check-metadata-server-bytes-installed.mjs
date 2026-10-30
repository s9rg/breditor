/** Independent npm archives execute the complete original native workflow.
 * Private module tests do not widen public exports. Node IDB is controlled;
 * authenticated relay receipts and native history replay are real. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {saveMetadataRecoveryEvidence} from './metadata-recovery-artifacts.mjs';
import {executeCandidateStage} from './candidate-release/process.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('No reduced coupled server-byte qualification mode');
const source=sourceEvidence(root),directory=fs.mkdtempSync('/private/tmp/breditor-metadata-server-bytes-installed-'),archives=join(directory,'archives'),consumer=join(directory,'consumer');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const sha=b=>createHash('sha256').update(b).digest('hex'),packages=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'];
const mapping=new Map(packages.map(folder=>[folder,JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).name]));
const version=JSON.parse(fs.readFileSync(join(root,'packages/breditor-collaboration/package.json'))).version;
for(const folder of packages)assert.equal(JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).version,version);
const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',archives,...packages.map(folder=>join(root,'packages',folder))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packed.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
const compiler={path:join(root,'node_modules/typescript/bin/tsc'),version:producer.packages['node_modules/typescript'].version};
compiler.sha256=sha(fs.readFileSync(compiler.path));
fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));
for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
const copied=[],seen=new Set();
function rewrite(original,target){
 const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(_match,quote,_prefix,folder,tail)=>{
  const name=mapping.get(folder);assert.ok(name,'Every tested SDK dependency is an installed archive');
  let path=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!path.startsWith('.'))path='./'+path;if(tail.endsWith('/')&&!path.endsWith('/'))path+='/';return quote+path+quote;
 });
 assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-collaboration\//.test(text),false);return text;
}
function copyScript(path){
 if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),text=rewrite(original,target);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(Buffer.from(original)),installedSha256:sha(Buffer.from(text))});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));}
}
const tests=['local-metadata-contracts.test.mjs','local-metadata-storage.test.mjs','local-metadata-restore-storage.test.mjs','local-metadata-resume-restore-contracts.test.mjs','local-metadata-delivery-native.test.mjs','local-metadata-assets-records.test.mjs','local-metadata-room-references-contracts.test.mjs','local-metadata-room-references-native.test.mjs','local-metadata-portable-reference-close-native.test.mjs','metadata-availability-opaque-native.test.mjs','metadata-availability-content-addressed-native.test.mjs','metadata-availability-pending-catalog-native.test.mjs','metadata-availability-cancelled-token-native.test.mjs','metadata-raster-archive.test.mjs','relay-asset-read-bytes-native.test.mjs','local-metadata-materialization-contracts.test.mjs','metadata-materialization-opaque-native.test.mjs','metadata-materialization-content-addressed-native.test.mjs','metadata-materialization-remote-content-native.test.mjs','metadata-materialization-inspection-native.test.mjs','metadata-materialization-inspection-close-native.test.mjs','metadata-materialization-local-only-native.test.mjs','recoverable-local-assets.test.mjs','recovery-server-bytes-contracts.test.mjs','metadata-recovery-bytes-same-server-native.test.mjs','metadata-recovery-bytes-advanced-server-native.test.mjs'];
for(const name of tests)copyScript('scripts/'+name);
const fixture='crates/breditor-core/tests/fixtures/rich-local-root.json';fs.mkdirSync(dirname(join(consumer,fixture)),{recursive:true});fs.copyFileSync(join(root,fixture),join(consumer,fixture));
const compatibilityFixture='scripts/fixtures/local-metadata/v1-materialized-rasters.archive',compatibilitySource=join(root,compatibilityFixture),compatibilityTarget=join(consumer,compatibilityFixture),compatibilitySha256='d644ea5ac7a61061ec22cfb35058af449c34a33b32bc9913a73fcea0b94354df';assert.equal(sha(fs.readFileSync(compatibilitySource)),compatibilitySha256);fs.mkdirSync(dirname(compatibilityTarget),{recursive:true});fs.copyFileSync(compatibilitySource,compatibilityTarget);assert.equal(sha(fs.readFileSync(compatibilityTarget)),compatibilitySha256);copied.push({path:compatibilityFixture,sourceSha256:compatibilitySha256,installedSha256:compatibilitySha256});
const typeFiles=['scripts/fixtures/editor-consumer/types-local-metadata-room-references.ts','scripts/fixtures/editor-consumer/types-local-metadata-delivery.ts','scripts/fixtures/editor-consumer/types-local-metadata-assets.ts','scripts/fixtures/editor-consumer/types-local-metadata-availability.ts','scripts/fixtures/editor-consumer/types-local-metadata-materialization.ts','scripts/fixtures/editor-consumer/types-recoverable-local-assets.ts','scripts/fixtures/editor-consumer/types-metadata-recovery-bytes.ts'];for(const file of typeFiles)copyScript(file);
const nativeRelative='target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional',nativeSource=join(root,nativeRelative),nativeTarget=join(consumer,nativeRelative);fs.mkdirSync(dirname(nativeTarget),{recursive:true});fs.copyFileSync(nativeSource,nativeTarget);
const originalRelative='target/owned-history-relay-native/release/examples/selected_delivery_functional',originalSource=join(root,originalRelative),originalTarget=join(consumer,originalRelative);fs.copyFileSync(originalSource,originalTarget);const originalNativeHostSha256=sha(fs.readFileSync(originalSource));assert.equal(sha(fs.readFileSync(originalTarget)),originalNativeHostSha256);assert.equal(originalNativeHostSha256,'c224c4d39d5f603dcb3815ebc58c1719b59b4d6db6fe554e675f91d4cab46ea7');
const nativeHostSha256=sha(fs.readFileSync(nativeSource));assert.equal(sha(fs.readFileSync(nativeTarget)),nativeHostSha256);
assert.equal(nativeHostSha256,'60427bb794f52c39a7084fac797f8f3150501238c45c78bad6195cd928a252ca');
const normalWasmSha256=sha(fs.readFileSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm')));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/installed-metadata-server-bytes-qualification',version:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,compiler,copied,nativeHostSha256,originalNativeHostSha256,normalWasmSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),results:[],startedAt:new Date().toISOString()};
saveEvidence(directory+'/running.json',state);console.log(JSON.stringify({directory,phase:'execute-coupled-selected-server-bytes-and-complete-original-recovery-regressions'}));
const checks=[
 {id:'installed-complete-metadata-server-bytes',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:{},timeoutMs:7200000},
 {id:'strict-installed-metadata-server-bytes-types',command:process.execPath,args:[compiler.path,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...typeFiles],env:{},timeoutMs:120000},
];
const outcomes=await Promise.allSettled(checks.map(async check=>{
 const logPath=join(directory,check.id+'.log'),result=await executeCandidateStage(check,{root:consumer,logPath}),log=fs.readFileSync(logPath,'utf8');state.results.push({...result,logPath,logSha256:sha(Buffer.from(log))});saveEvidence(directory+'/running.json',state);assert.equal(result.status,'passed');
 if(check.id==='installed-complete-metadata-server-bytes')for(const [name,n]of [['tests',94],['pass',94],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+name+' '+n+'$','m'));
}));
for(const outcome of outcomes)if(outcome.status==='rejected'){saveEvidence(directory+'/failed.json',{...state,error:String(outcome.reason)});throw outcome.reason;}
assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(nativeSource)),nativeHostSha256);assert.equal(sha(fs.readFileSync(originalSource)),originalNativeHostSha256);assert.equal(sha(fs.readFileSync(compiler.path)),compiler.sha256);
Object.assign(state,{complete:true,sourceUnchanged:true,tests:94,localMetadataSources:3,nativeParticipants:7,releaseReady:false,v1GatesOpen:13,finishedAt:new Date().toISOString(),scope:'Complete original Native metadata/cold/restore/reference/provider/V1/V2 byte tests plus source-owned selected server/inventory byte coupling. Real seven-participant cases preserve three locally complete raster payloads while server upload state remains Pending. One captures the original selected server; another actually publishes document changes, rejects stale old server/inventory for the new controller, and captures exact advanced files through genuine Native continuation. Every Blob role is saved and rebuilt from files before genuine Native client inspection offline. Copied readers fail before callbacks; component checks refuse rehashed slot corruption and ended reader lifetimes. Server byte/frame admission is historical DATA, not browser-side Native server replay, current authority, accepted-head agreement, protected credentials or a serving role. Full reconciliation, authenticated restoration/activation, opaque-host Ready, independent generations and thirteen V1/parity gates remain required.'});
saveEvidence(directory+'/result.json',state);saveMetadataRecoveryEvidence(root,'serverBytes',state);console.log(JSON.stringify({passed:true,directory,tests:94,workspaceLinks:false,sourceUnchanged:true}));
