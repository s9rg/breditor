/** Independent npm archives execute the new Native reconciliation workflow
 * and its focused component boundaries. Earlier full recovery qualifications
 * remain separate evidence. Private module tests do not widen public exports.
 * Node IDB is controlled; Native histories and authenticated receipts are real. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {saveMetadataRecoveryEvidence} from './metadata-recovery-artifacts.mjs';
import {executeCandidateStage} from './candidate-release/process.mjs';
import {metadataFixtureEvidence} from './candidate-release/metadata-fixture-evidence.mjs';
import {verifyMetadataReconciliationHosts} from './candidate-release/metadata-reconciliation-hosts.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('No reduced Native reconciliation qualification mode');
const source=sourceEvidence(root),directory=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'breditor-metadata-reconciliation-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');
fs.mkdirSync(archives);fs.mkdirSync(consumer);
const fixtureEvidence=metadataFixtureEvidence(root,source,consumer);
const companionHosts=fixtureEvidence.nativeHostBuildReceiptSha256===null?undefined:verifyMetadataReconciliationHosts(root,source);
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
 }).replace(/(['"])packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(_match,quote,folder,tail)=>{const name=mapping.get(folder);assert.ok(name);return quote+'node_modules/'+name+'/'+tail+quote;});
 assert.equal(text.includes('/Users/s/'),false);assert.equal(/(?:\.\.\/)+packages\/breditor-collaboration\//.test(text),false);return text;
}
function copyScript(path){
 if(seen.has(path))return;seen.add(path);const original=fs.readFileSync(join(root,path),'utf8'),target=join(consumer,path),text=rewrite(original,target);
 fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,text);copied.push({path,sourceSha256:sha(Buffer.from(original)),installedSha256:sha(Buffer.from(text))});
 for(const hit of original.matchAll(/['"](\.[^'"]+\.mjs)['"]/g)){const dependency=resolve(dirname(join(root,path)),hit[1]);if(dependency.startsWith(root+'/scripts/')&&fs.existsSync(dependency))copyScript(relative(root,dependency));}
}
const tests=['local-metadata-reconciliation-contracts.test.mjs','metadata-reconciliation-input-native.test.mjs','original-retention-version-loan-native.test.mjs','original-recovery-owner-version-loan-native.test.mjs','original-retained-root-version-loan-native.test.mjs','native-version-delivery.test.mjs','native-version-delivery-failures.test.mjs','segmented-retained-storage.test.mjs','metadata-provider-reconciliation-native.test.mjs','metadata-provider-reconciliation-cold-native.test.mjs'];
for(const name of tests)copyScript('scripts/'+name);
const fixture='crates/breditor-core/tests/fixtures/rich-local-root.json';fs.mkdirSync(dirname(join(consumer,fixture)),{recursive:true});fs.copyFileSync(join(root,fixture),join(consumer,fixture));
const compatibilityFixture='scripts/fixtures/local-metadata/v1-materialized-rasters.archive',compatibilitySource=join(root,compatibilityFixture),compatibilityTarget=join(consumer,compatibilityFixture),compatibilitySha256='d644ea5ac7a61061ec22cfb35058af449c34a33b32bc9913a73fcea0b94354df';assert.equal(sha(fs.readFileSync(compatibilitySource)),compatibilitySha256);fs.mkdirSync(dirname(compatibilityTarget),{recursive:true});fs.copyFileSync(compatibilitySource,compatibilityTarget);assert.equal(sha(fs.readFileSync(compatibilityTarget)),compatibilitySha256);copied.push({path:compatibilityFixture,sourceSha256:compatibilitySha256,installedSha256:compatibilitySha256});
const typeFiles=['scripts/fixtures/editor-consumer/types-local-metadata-reconciliation.ts'];for(const file of typeFiles)copyScript(file);
// The old public storage fixture uses a runtime alias; keep it inside this
// independently installed consumer so the actual Wasm module identity is shared.
const runtimeAlias=join(consumer,'target/promoted-shared-web');fs.mkdirSync(dirname(runtimeAlias),{recursive:true});fs.symlinkSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),runtimeAlias,'dir');assert.ok(fs.realpathSync(runtimeAlias).startsWith(fs.realpathSync(consumer)+'/node_modules/'));
const nativeRelative='target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional',nativeSource=join(root,nativeRelative),nativeTarget=join(consumer,nativeRelative);fs.mkdirSync(dirname(nativeTarget),{recursive:true});fs.copyFileSync(nativeSource,nativeTarget);
const originalRelative='target/owned-history-relay-native/release/examples/selected_delivery_functional',originalSource=join(root,originalRelative),originalTarget=join(consumer,originalRelative);fs.copyFileSync(originalSource,originalTarget);const originalNativeHostSha256=sha(fs.readFileSync(originalSource));assert.equal(sha(fs.readFileSync(originalTarget)),originalNativeHostSha256);assert.equal(originalNativeHostSha256,companionHosts?.binaries.selected_delivery_functional.sha256??'c224c4d39d5f603dcb3815ebc58c1719b59b4d6db6fe554e675f91d4cab46ea7');
const versionRelative='target/owned-history-relay-native/release/examples/segmented_relay_functional',versionSource=join(root,versionRelative),versionTarget=join(consumer,versionRelative),versionHostSha256=sha(fs.readFileSync(versionSource));fs.copyFileSync(versionSource,versionTarget);assert.equal(sha(fs.readFileSync(versionTarget)),versionHostSha256);
const rootRelative='target/owned-history-relay-native/release/examples/generation_complete_control_functional',rootSource=join(root,rootRelative),rootTarget=join(consumer,rootRelative),rootHostSha256=sha(fs.readFileSync(rootSource));fs.copyFileSync(rootSource,rootTarget);assert.equal(sha(fs.readFileSync(rootTarget)),rootHostSha256);
if(companionHosts){
 assert.equal(versionHostSha256,companionHosts.binaries.segmented_relay_functional.sha256);
 assert.equal(rootHostSha256,companionHosts.binaries.generation_complete_control_functional.sha256);
}
const nativeHostSha256=sha(fs.readFileSync(nativeSource));assert.equal(sha(fs.readFileSync(nativeTarget)),nativeHostSha256);
assert.equal(nativeHostSha256,fixtureEvidence.nativeHostSha256);
const normalWasmSha256=sha(fs.readFileSync(join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm')));assert.equal(normalWasmSha256,fixtureEvidence.normalWasmSha256);
const state={format:'breditor/installed-metadata-reconciliation-qualification',version:1,complete:false,source,sourceRoot:root,directory,consumer,workspaceLinks:false,registryArtifacts,compiler,copied,nativeHostSha256,originalNativeHostSha256,versionHostSha256,rootHostSha256,normalWasmSha256,nativeHostBuildReceiptSha256:fixtureEvidence.nativeHostBuildReceiptSha256,companionHostBuildReceiptSha256:companionHosts?.sha256??null,sharedRuntimeReceiptSha256:fixtureEvidence.sharedRuntimeReceiptSha256,archives:packed.map(pack=>({name:pack.name,path:join(archives,pack.filename),sha256:sha(fs.readFileSync(join(archives,pack.filename)))})),results:[],startedAt:new Date().toISOString()};
saveEvidence(directory+'/running.json',state);console.log(JSON.stringify({directory,phase:'execute-actual-managed-uploads-native-resume-and-same-owner-reconciliation'}));
const checks=[
 {id:'installed-metadata-native-reconciliation',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:fixtureEvidence.environment,timeoutMs:7200000},
 {id:'strict-installed-metadata-reconciliation-types',command:process.execPath,args:[compiler.path,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...typeFiles],env:{},timeoutMs:120000},
];
const outcomes=await Promise.allSettled(checks.map(async check=>{
 const logPath=join(directory,check.id+'.log'),result=await executeCandidateStage(check,{root:consumer,logPath}),log=fs.readFileSync(logPath,'utf8');state.results.push({...result,logPath,logSha256:sha(Buffer.from(log))});saveEvidence(directory+'/running.json',state);assert.equal(result.status,'passed');
 if(check.id==='installed-metadata-native-reconciliation')for(const [name,n]of [['tests',114],['pass',114],['fail',0],['skipped',0],['cancelled',0],['todo',0]]){
  const observed=new RegExp('^# '+name+' (\\d+)$','m').exec(log)?.[1];
  assert.equal(observed,String(n),'Installed metadata reconciliation '+name+' count');
 }
}));
for(const outcome of outcomes)if(outcome.status==='rejected'){saveEvidence(directory+'/failed.json',{...state,error:String(outcome.reason)});throw outcome.reason;}
assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(nativeSource)),nativeHostSha256);assert.equal(sha(fs.readFileSync(originalSource)),originalNativeHostSha256);assert.equal(sha(fs.readFileSync(compiler.path)),compiler.sha256);
assert.equal(sha(fs.readFileSync(versionSource)),versionHostSha256);
assert.equal(sha(fs.readFileSync(rootSource)),rootHostSha256);
if(companionHosts)assert.equal(verifyMetadataReconciliationHosts(root,source).sha256,companionHosts.sha256);
for(const [path,expected] of [[originalTarget,originalNativeHostSha256],[versionTarget,versionHostSha256],[rootTarget,rootHostSha256]])assert.equal(sha(fs.readFileSync(path)),expected);
Object.assign(state,{complete:true,sourceUnchanged:true,tests:114,localMetadataSources:3,nativeParticipants:7,releaseReady:false,v1GatesOpen:13,finishedAt:new Date().toISOString(),scope:'Actual three managed upload ACKs, genuine fresh full-path Native resume from older metadata, two authenticated delivery passes over all seven source families, and a separately named same-owner reconciliation of native heads, genuine local review bindings/receipts, actual all-family outbound metadata and complete asset requirements. The original legacy diagnostic retains unbound/Pending semantics. Thirty Native retained-storage checks, six component checks, actual Native inventory/outer archive identity regression, genuine retained-version child/parent/root loan regressions, 72 existing native version publication/failure/cold-history cases and strict consumer types cover the new behavior. A complete post-ACK source/client restart additionally retains seven fresh native owners, fourteen exact offline lanes, three real upload ACKs, original revision receipts, two further authenticated delivery passes and future document/review Undo/Redo with zero provider gaps. This is client/source recovery against the same live Native server. Earlier 94-check complete original recovery qualification remains separate evidence. Complete remote metadata catalogs, authenticated whole-room restoration/activation, opaque-host Ready, independent generations and all thirteen V1/parity gates remain required.'});
saveEvidence(directory+'/result.json',state);saveMetadataRecoveryEvidence(root,'reconciliation',state);console.log(JSON.stringify({passed:true,directory,tests:114,workspaceLinks:false,sourceUnchanged:true}));
