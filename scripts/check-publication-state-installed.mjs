import {tmpdir} from 'node:os';
import {publicationStateCompiled} from './publication-state-artifacts.mjs';
/** Fresh offline package archives exercise the complete publication/lifetime matrix. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {copySharedRuntimeForActivation,selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {historicalSharedWasmSha256,pinnedSharedRuntimeReceipt} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {publicationStateTests as tests,publicationStateTypes as types,publicationStateCount as count,checkPublicationStateEvidence} from './publication-state-plan.mjs';
const data=['crates/breditor-core/tests/fixtures/rich-local-root.json'];
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('The complete normal Native publication/lifetime matrix is mandatory');
const source=sourceEvidence(root),compiled=publicationStateCompiled(root),directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-publication-state-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer'),sha=value=>createHash('sha256').update(value).digest('hex');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const runtime=copySharedRuntimeForActivation(root,consumer,source);
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
fs.cpSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),join(consumer,'target/promoted-shared-web'),{recursive:true});
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(wasm));assert.equal(normalWasmSha256,runtime?.wasmSha256??historicalSharedWasmSha256);
assert.deepEqual(publicationStateCompiled(consumer,true),compiled);
const compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler));
const state={format:'breditor/native-publication-state-installed-consumer',formatVersion:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,copied,compiled,normalWasmSha256,sharedRuntimeReceiptSha256:runtime?.sha256??null,compilerSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),releaseReady:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-public-types-and-actual-native-publication-lifetimes'}));
try{
 const typesLog=execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...types],{cwd:consumer,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120000});
 fs.writeFileSync(join(directory,'types.log'),typesLog);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let execution;try{execution=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(test=>'scripts/'+test)],{cwd:consumer,env:{...process.env,...runtime?.environment},stdio:['ignore',fd,fd],timeout:120000});}finally{fs.closeSync(fd);}assert.equal(execution.error,undefined);assert.equal(execution.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<=8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 checkPublicationStateEvidence(log);
 for(const[key,n]of [['tests',count],['pass',count],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);assert.deepEqual(publicationStateCompiled(root),compiled);assert.deepEqual(publicationStateCompiled(consumer,true),compiled);
 assert.deepEqual(selectSharedRuntimeBuild(root,source),runtime);
 if(runtime)assert.deepEqual(pinnedSharedRuntimeReceipt(consumer,runtime.sha256).report.source,source);
 Object.assign(state,{complete:true,passed:true,tests:count,sourceUnchanged:true,strictPublicTypes:true,log:join(directory,'contracts.log'),logSha256:sha(log),scope:'Actual normal Native document/comment histories, publication scalar invalidation, original full record admission, readonly mutation/disposal refusal, exact future Undo/Redo and independent installed package/types. Controlled IDB/locks/raster presentation. No whole-room activation, full recovery performance or V1 approval.'});
 saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/publication-state-installed.json'),state);console.log(JSON.stringify({directory,passed:true,tests:count,workspaceLinks:false,sourceUnchanged:true}));
}catch(error){
 if(error.stdout)fs.writeFileSync(join(directory,'failed-stdout.log'),error.stdout);if(error.stderr)fs.writeFileSync(join(directory,'failed-stderr.log'),error.stderr);
 saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;
}
