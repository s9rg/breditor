/** Fresh production archives, original authenticated decisions and normal Wasm.
 * No workspace links or reduced workflow; Node storage/locks are controlled. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {executeCandidateStage} from './candidate-release/process.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('No reduced native owned-history qualification mode');
const source=sourceEvidence(root),directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-native-suggestion-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const sha=b=>createHash('sha256').update(b).digest('hex'),packages=['breditor-browser','breditor-experimental-rich-content','breditor-collaboration'];
const mapping=new Map(packages.map(folder=>[folder,JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).name]));
const version=JSON.parse(fs.readFileSync(join(root,'packages/breditor-collaboration/package.json'))).version;
for(const folder of packages)assert.equal(JSON.parse(fs.readFileSync(join(root,'packages',folder,'package.json'))).version,version);
const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',archives,...packages.map(folder=>join(root,'packages',folder))],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
const producer=JSON.parse(fs.readFileSync(join(root,'package-lock.json'))),locked=searchConsumerLock(producer,packed.map(pack=>({name:pack.name,path:join(archives,pack.filename)})));
locked.manifest.dependencies.undici=producer.packages['node_modules/undici'].version;
fs.writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));fs.writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(fs.readFileSync(join(consumer,'package-lock.json'))));
for(const name of mapping.values())assert.ok(fs.realpathSync(join(consumer,'node_modules',name)).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
const copied=[],seen=new Set();
function rewrite(original,target){
 const text=original.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(match,quote,_prefix,folder,tail)=>{
  const name=mapping.get(folder);if(!name)return match;
  let path=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!path.startsWith('.'))path='./'+path;if(tail.endsWith('/')&&!path.endsWith('/'))path+='/';return quote+path+quote;
 });
 assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-collaboration\//.test(text),false);return text;
}
function copyScript(path){
 if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),text=rewrite(original,target);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(Buffer.from(original)),installedSha256:sha(Buffer.from(text))});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));}
}
const tests=['native-suggestion-delivery.test.mjs','native-suggestion-observer.test.mjs','native-suggestion-failures.test.mjs','native-suggestion-lifetime.test.mjs','observer-work-custody.test.mjs','native-suggestion-selected-room.test.mjs','native-owned-suggestion-history.test.mjs','native-owned-suggestion-input.test.mjs','native-owned-suggestion-membership.test.mjs','metadata-admitted-work.test.mjs'];
for(const name of tests)copyScript('scripts/'+name);copyScript('scripts/probe-suggestion-observer-sdk.mjs');
const fixture='crates/breditor-core/tests/fixtures/rich-local-root.json';fs.mkdirSync(dirname(join(consumer,fixture)),{recursive:true});fs.copyFileSync(join(root,fixture),join(consumer,fixture));
const typeFiles=['types-native-owned-suggestion.ts','types-native-suggestion-delivery.ts'];for(const typeFile of typeFiles){const typeSource=fs.readFileSync(join(root,'scripts/fixtures/editor-consumer',typeFile),'utf8');fs.writeFileSync(join(consumer,typeFile),rewrite(typeSource,join(consumer,typeFile)));}
const nativeRelative='target/owned-history-relay-native/release/examples/suggestions_functional',nativeSource=join(root,nativeRelative),nativeTarget=join(consumer,nativeRelative);fs.mkdirSync(dirname(nativeTarget),{recursive:true});fs.copyFileSync(nativeSource,nativeTarget);
const selectedRelative='target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional';fs.mkdirSync(dirname(join(consumer,selectedRelative)),{recursive:true});fs.copyFileSync(join(root,selectedRelative),join(consumer,selectedRelative));const selectedNativeHostSha256=sha(fs.readFileSync(join(root,selectedRelative)));assert.equal(selectedNativeHostSha256,sha(fs.readFileSync(join(consumer,selectedRelative))));
const nativeHostSha256=sha(fs.readFileSync(nativeSource));assert.equal(sha(fs.readFileSync(nativeTarget)),nativeHostSha256);
const normalWasmSha256=sha(fs.readFileSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm')));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/installed-native-suggestion-delivery-qualification',version:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,copied,nativeHostSha256,selectedNativeHostSha256,normalWasmSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),results:[],startedAt:new Date().toISOString()};
saveEvidence(directory+'/running.json',state);console.log(JSON.stringify({directory,phase:'execute-original-receipts-under-held-native-owner'}));
const checks=[
 {id:'native-owned-history',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:{},timeoutMs:1800000},
 {id:'ordinary-installed-observer',command:process.execPath,args:['scripts/probe-suggestion-observer-sdk.mjs',join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),nativeTarget],env:{},timeoutMs:180000},
 {id:'strict-installed-private-and-public-types',command:process.execPath,args:[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...typeFiles],env:{},timeoutMs:120000},
];
const outcomes=await Promise.allSettled(checks.map(async check=>{
 const logPath=join(directory,check.id+'.log'),result=await executeCandidateStage(check,{root:consumer,logPath}),log=fs.readFileSync(logPath,'utf8'),row={...result,logPath,logSha256:sha(Buffer.from(log))};state.results.push(row);saveEvidence(directory+'/running.json',state);assert.equal(result.status,'passed');
 if(check.id==='ordinary-installed-observer'){const report=JSON.parse(log);assert.equal(report.passed,true);assert.equal(report.trials,6);assert.equal(report.readerAuthorResumes,0);assert.equal(report.readerDocumentSubmissions,0);}
 if(check.id==='native-owned-history')for(const [name,n]of [['tests',218],['pass',218],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+name+' '+n+'$','m'));
}));
for(const value of outcomes)if(value.status==='rejected'){saveEvidence(directory+'/failed.json',{...state,error:String(value.reason)});throw value.reason;}
assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(nativeSource)),nativeHostSha256);assert.equal(sha(fs.readFileSync(join(root,selectedRelative))),selectedNativeHostSha256);
Object.assign(state,{complete:true,sourceUnchanged:true,tests:218,nativeAuthorPolicies:72,nativeObserverPolicies:72,persistenceFailureCases:24,lifecycleAndCacheCases:18,observerWorkCases:6,completeRoomCases:1,originalNativeIngressCases:25,ordinaryObserverPolicies:6,releaseReady:false,v1GatesOpen:13,finishedAt:new Date().toISOString(),scope:'Original queued suggestions use actual native-held author or permanent-observer transports across every bound source family, selection and grouping policy. Actual authenticated decisions, owned and unowned Undo, cold independent histories, interrupted local writes, postcommit authority loss, lost replies, cancelled late tokens and lazy packet caches are verified from independent archives. Ordinary observer behavior and original native ingress checks remain covered. Revision settlement, remaining local metadata bindings, complete provider/client/assets reconciliation and joint activation remain required.'});
saveEvidence(directory+'/result.json',state);saveEvidence(join(root,'target/native-suggestion-delivery-installed-consumer.json'),state);console.log(JSON.stringify({passed:true,directory,tests:218,workspaceLinks:false,sourceUnchanged:true}));
