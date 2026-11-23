/** Independently packed SDKs execute every native metadata dependency test.
 * Controlled IDB/locks do not establish physical durability; no server or
 * provider capability is inferred from dependency DATA. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {executeCandidateStage} from './candidate-release/process.mjs';
import {selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {historicalSharedWasmSha256} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('No reduced local metadata qualification mode');
const source=sourceEvidence(root),directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-local-metadata-assets-records-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');
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
const tests=['local-metadata-assets-records.test.mjs'];
for(const name of tests)copyScript('scripts/'+name);
const fixture='crates/breditor-core/tests/fixtures/rich-local-root.json';fs.mkdirSync(dirname(join(consumer,fixture)),{recursive:true});fs.copyFileSync(join(root,fixture),join(consumer,fixture));
const typeFile='scripts/fixtures/editor-consumer/types-local-metadata-assets.ts';copyScript(typeFile);
const sharedRuntime=selectSharedRuntimeBuild(root,source);
const normalWasmSha256=sha(fs.readFileSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,sharedRuntime?.wasmSha256??historicalSharedWasmSha256);
const state={format:'breditor/installed-local-metadata-assets-records-qualification',version:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,compiler,copied,normalWasmSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),results:[],startedAt:new Date().toISOString()};
saveEvidence(directory+'/running.json',state);console.log(JSON.stringify({directory,phase:'read-all-native-and-metadata-packet-dependencies'}));
const checks=[
 {id:'installed-native-local-metadata-assets',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:{},timeoutMs:180000},
 {id:'strict-installed-local-metadata-asset-types',command:process.execPath,args:[compiler.path,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',typeFile],env:{},timeoutMs:120000},
];
const outcomes=await Promise.allSettled(checks.map(async check=>{
 const logPath=join(directory,check.id+'.log'),result=await executeCandidateStage(check,{root:consumer,logPath}),log=fs.readFileSync(logPath,'utf8');state.results.push({...result,logPath,logSha256:sha(Buffer.from(log))});saveEvidence(directory+'/running.json',state);assert.equal(result.status,'passed');
 if(check.id==='installed-native-local-metadata-assets')for(const [name,n]of [['tests',15],['pass',15],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+name+' '+n+'$','m'));
}));
for(const outcome of outcomes)if(outcome.status==='rejected'){saveEvidence(directory+'/failed.json',{...state,error:String(outcome.reason)});throw outcome.reason;}
assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler.path)),compiler.sha256);
const evidencePath=join(consumer,'target/local-metadata-assets-record-evidence.json'),evidence=JSON.parse(fs.readFileSync(evidencePath));assert.equal(evidence.kind,'native-dependency-data-only');assert.equal(evidence.cases.length,8);assert.ok(evidence.cases.every(row=>row.nativeUnchanged&&row.read.outcome.kind==='ready'));state.evidence={path:evidencePath,sha256:sha(fs.readFileSync(evidencePath)),nativePolicies:8};
Object.assign(state,{complete:true,sourceUnchanged:true,tests:15,nativePolicies:8,releaseReady:false,v1GatesOpen:13,finishedAt:new Date().toISOString(),scope:'Actual exact native dependency DATA across all original/segmented document/comment layouts with owned/unowned history. Includes original Undo/Redo, retained source versions, cached versions, intermediate/deleted proposal and revision image generations, explicit uncached/source Pending, exact comment journals, mid-read comment mutation, detached input and synchronous authority. No upload/provider/server grant, complete-room reconciliation, activation or V1 approval.'});
saveEvidence(directory+'/result.json',state);saveEvidence(join(root,'target/local-metadata-assets-records-installed-consumer.json'),state);console.log(JSON.stringify({passed:true,directory,tests:15,workspaceLinks:false,sourceUnchanged:true}));
