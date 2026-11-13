/** Execute complete handover intent DATA retention and original intent laws from installed packages. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,lstatSync,mkdtempSync,mkdirSync,cpSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence} from './candidate-release/evidence.mjs';
import {nativeSuggestionExecutable,verifyNativeSuggestionBuild} from './candidate-release/native-suggestion-build-evidence.mjs';
import {copySharedRuntimeForActivation} from './candidate-release/shared-runtime-evidence.mjs';
import {historicalSharedWasmSha256} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {prepareActivationRetentionFixture} from './fixtures/activation-retention/prepare.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const reassociationOnly=process.argv.length===3&&process.argv[2]==='--reassociation-contracts';
const jointChoice=process.argv.length===3&&process.argv[2]==='--sealed-joint-choice';
if(process.argv.length!==2&&!reassociationOnly&&!jointChoice)throw Error('Expected no arguments, --reassociation-contracts or --sealed-joint-choice');
prepareActivationRetentionFixture(root);
const producer=root;
const {searchConsumerLock,verifySearchConsumerRegistry}=await import(new URL('./scripts/search-consumer-lock.mjs','file://'+producer+'/'));
const {executeCandidateStage}=await import(new URL('./scripts/candidate-release/process.mjs','file://'+producer+'/'));
const sha=value=>createHash('sha256').update(value).digest('hex'),directory=mkdtempSync(join(realpathSync(tmpdir()),'breditor-handover-activation-intent-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');mkdirSync(archives);mkdirSync(consumer);
const source=sourceEvidence(root),sharedRuntime=copySharedRuntimeForActivation(root,consumer,source);
const inputs=()=>{const result=[];function walk(path){const s=lstatSync(path);if(s.isSymbolicLink())return;if(s.isDirectory())for(const name of readdirSync(path).sort())walk(join(path,name));else if(s.isFile())result.push({path:relative(root,path),bytes:s.size,sha256:sha(readFileSync(path))});}for(const path of ['packages/breditor-collaboration/src','packages/breditor-collaboration/dist','scripts'])walk(join(root,path));return result;};
const before=inputs(),sourcePackage=JSON.parse(readFileSync(join(root,'packages/breditor-collaboration/package.json'))),producerLock=JSON.parse(readFileSync(join(producer,'package-lock.json'))),packages=[join(producer,'packages/breditor-browser'),join(producer,'packages/breditor-experimental-rich-content'),join(root,'packages/breditor-collaboration')];
for(const path of packages)assert.equal(JSON.parse(readFileSync(join(path,'package.json'))).version,sourcePackage.version);
const packs=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...packages],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024})),locked=searchConsumerLock(producerLock,packs.map(row=>({name:row.name,path:join(archives,row.filename)})));
locked.manifest.dependencies.undici=producerLock.packages['node_modules/undici'].version;
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producerLock,JSON.parse(readFileSync(join(consumer,'package-lock.json'))));
for(const pack of packs)assert.ok(realpathSync(join(consumer,'node_modules',pack.name)).startsWith(realpathSync(consumer)+'/node_modules/'));
let matchingPackageDistFiles=0;
for(const pack of packs){
 const from=join(packages.find(path=>JSON.parse(readFileSync(join(path,'package.json'))).name===pack.name),'dist');
 const to=join(consumer,'node_modules',pack.name,'dist');
 function compare(path){
  const entries=readdirSync(join(from,path),{withFileTypes:true});
  assert.deepEqual(entries.map(entry=>entry.name).sort(),readdirSync(join(to,path)).sort());
  for(const entry of entries){
   const next=join(path,entry.name);
   if(entry.isDirectory())compare(next);
   else if(entry.isFile()){
    assert.equal(sha(readFileSync(join(to,next))),sha(readFileSync(join(from,next))),next);
    matchingPackageDistFiles++;
   }
  }
 }
 compare('');
}
const tests=jointChoice
 ?['handover-activation-reassociation.test.mjs','recorded-base-handover-inspection.test.mjs','sealed-joint-reassociation-choice.test.mjs']
 :['handover-activation-reassociation.test.mjs','handover-activation-intent-storage.test.mjs','activation-retention-lifetime.test.mjs','room-native-activation-intent.test.mjs','activation-intent-wire.test.mjs'];
if(!reassociationOnly&&!jointChoice)tests.unshift('native-handover-activation-intent-data.test.mjs');
const expectedCases=jointChoice?30:reassociationOnly?50:51;
const copied=[],mapping=new Map(packages.map(path=>{const row=JSON.parse(readFileSync(join(path,'package.json')));return[path.split('/').at(-1),row.name];}));
function copyScript(path){const target=join(consumer,path),original=readFileSync(join(root,path),'utf8');let text=original;
 text=text.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(match,quote,prefix,folder,tail)=>{const name=mapping.get(folder);if(!name)return match;let selected=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!selected.startsWith('.'))selected='./'+selected;return quote+selected+quote;});
 assert.equal(text.includes('/Users/s/'),false,'No development path may enter installed test source');assert.equal(/(?:\.\.\/)+packages\/breditor-collaboration\//.test(text),false,'No workspace SDK import');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);copied.push({path,sourceSha256:sha(Buffer.from(original)),installedSha256:sha(Buffer.from(text))});
}
function fixtures(path){for(const entry of readdirSync(join(root,path),{withFileTypes:true})){const next=join(path,entry.name);if(entry.isDirectory())fixtures(next);else if(entry.isFile()&&entry.name.endsWith('.mjs'))copyScript(next);}}
fixtures('scripts/fixtures');for(const name of tests)copyScript('scripts/'+name);
copyScript('scripts/diagnostics/archive-error-chain.mjs');
copyScript('scripts/fixtures/editor-consumer/types-handover-activation-intent.ts');
const retained='target/activation-retainer-actual-input',indexBytes=readFileSync(join(root,retained,'index.json'));
assert.equal(sha(indexBytes),'572671293d3afd4c2134c69774e8e0bacc0d180e9f652dbf8d64a4354a510518');
const corpus=JSON.parse(indexBytes),runtimeInputs=[];
for(const row of [{name:'index.json',bytes:indexBytes.length,sha256:sha(indexBytes)},...corpus.files]){
 const path=join(retained,row.name),data=readFileSync(join(root,path));assert.equal(data.length,row.bytes);assert.equal(sha(data),row.sha256);
 mkdirSync(dirname(join(consumer,path)),{recursive:true});writeFileSync(join(consumer,path),data);runtimeInputs.push({path,bytes:data.length,sha256:row.sha256});
}
const env={BREDITOR_ACTIVATION_RETENTION_FIXTURE:join(consumer,retained)};
const originalInputs=[];
if(jointChoice){
 const provided=process.env.BREDITOR_SEALED_RESTART_CHOICES;
 assert.ok(provided,'Select the output directory of the actual sealed whole-room fixture');
 const selected=join(consumer,'target','sealed-restart-choices');
 mkdirSync(selected,{recursive:true});
 const copyChoiceInput=name=>{
  const from=join(resolve(provided),name),to=join(selected,name),bytes=readFileSync(from),sha256=sha(bytes);
  mkdirSync(dirname(to),{recursive:true});
  writeFileSync(to,bytes);
  assert.equal(sha(readFileSync(to)),sha256);
  runtimeInputs.push({path:relative(consumer,to),bytes:bytes.length,sha256});
  originalInputs.push({path:from,sha256});
  return bytes;
 };
 for(const suffix of ['independent-plan','continued-choice'])copyChoiceInput('actual-joint-complete-'+suffix+'.json');
 const intent='actual-joint-prepared-native-intent-evidence';
 const choice=JSON.parse(copyChoiceInput(join(intent,'choice.json')));
 const graph=copyChoiceInput(join(intent,'graph.json'));
 assert.equal(graph.length,choice.graph.bytes);assert.equal(sha(graph),choice.graph.sha256);
 for(const pin of choice.objects){
  assert.match(pin.sha256,/^[a-f0-9]{64}$/);
  const bytes=copyChoiceInput(join(intent,pin.sha256+'.bin'));
  assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);
 }
 env.BREDITOR_SEALED_RESTART_CHOICES=selected;
}
const staticPath='scripts/fixtures/local-metadata/pending-source-packet-recovery.archive',staticBytes=readFileSync(join(root,staticPath));
mkdirSync(dirname(join(consumer,staticPath)),{recursive:true});writeFileSync(join(consumer,staticPath),staticBytes);runtimeInputs.push({path:staticPath,bytes:staticBytes.length,sha256:sha(staticBytes)});
execFileSync(join(root,'node_modules/.bin/tsc'),['--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','scripts/fixtures/editor-consumer/types-handover-activation-intent.ts'],{cwd:consumer,stdio:'inherit',timeout:120000});

const nativeSource=join(root,nativeSuggestionExecutable),nativeTarget=join(consumer,nativeSuggestionExecutable);
const nativeSha256=reassociationOnly||jointChoice?null:sha(readFileSync(nativeSource));
const nativeBuild=nativeSha256&&sharedRuntime?verifyNativeSuggestionBuild(root,source):undefined;
if(nativeBuild)assert.equal(nativeSha256,nativeBuild.binary.sha256);
if(nativeSha256){mkdirSync(dirname(nativeTarget),{recursive:true});cpSync(nativeSource,nativeTarget);assert.equal(sha(readFileSync(nativeTarget)),nativeSha256);}
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(readFileSync(wasm));assert.equal(normalWasmSha256,sharedRuntime?.wasmSha256??historicalSharedWasmSha256);
const state={format:'breditor/installed-handover-activation-intent-development',version:1,complete:false,source,sourceRoot:root,producer,consumer,directory,sourceInputs:before,copied,runtimeInputs,workspaceLinks:false,registryArtifacts,matchingPackageDistFiles,nativeSha256,normalWasmSha256,sharedRuntimeReceiptSha256:sharedRuntime?.sha256??null,nativeHostBuildReceiptSha256:nativeBuild?.sha256??null,archives:packs.map(row=>({name:row.name,path:join(archives,row.filename),sha256:sha(readFileSync(join(archives,row.filename)))})),startedAt:new Date().toISOString()};
writeFileSync(join(directory,'running.json'),JSON.stringify(state,null,2));console.log(JSON.stringify({directory,consumer,phase:jointChoice?'execute-sealed-joint-reassociation-choice':reassociationOnly?'execute-handover-activation-reassociation-contracts':'execute-actual-handover-activation-intent-data'}));
const logPath=join(directory,'installed-handover-activation-intent.log'),result=await executeCandidateStage({id:'installed-handover-activation-intent',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:{...env,...sharedRuntime?.environment},timeoutMs:7800000},{root:consumer,logPath});
const log=readFileSync(logPath,'utf8');state.result={...result,logPath,logSha256:sha(Buffer.from(log))};writeFileSync(join(directory,'running.json'),JSON.stringify(state,null,2));assert.equal(result.status,'passed');for(const [name,value] of [['tests',expectedCases],['pass',expectedCases],['fail',0],['cancelled',0],['skipped',0]])assert.match(log,new RegExp('^# '+name+' '+value+'$','m'));
assert.deepEqual(inputs(),before);
assert.deepEqual(sourceEvidence(root),source);
if(nativeBuild)assert.equal(verifyNativeSuggestionBuild(root,source).sha256,nativeBuild.sha256);
if(nativeSha256)assert.equal(sha(readFileSync(nativeSource)),nativeSha256);
for(const input of originalInputs)assert.equal(sha(readFileSync(input.path)),input.sha256);
state.complete=true;state.sourceUnchanged=true;state.releaseReady=false;state.v1GatesOpen=13;state.finishedAt=new Date().toISOString();
state.scope=jointChoice
 ? 'Sealed reassociation and confirmation using real retained choices and controlled storage and Native responses. No live relay activation or publication.'
 : reassociationOnly
 ? 'Exact sealed activation reassociation, original intent storage, cancellation and wire laws with a pinned recovery corpus and controlled Node storage, locks and HTTP. No actual relay restart or activation.'
 : 'Actual sealed successor, seven cold clients and preserved offline/metadata facts; complete recovery capture retained through the separate handover intent and exact cold/disk readback. Exact reassociation, original intent storage, cancellation and wire laws remain checked. Activation declarations in storage tests are synthetic inert DATA; no actual activation is requested. Node storage, locks and image decoding are controlled fixtures. Full authenticated activation/publication and physical durability remain open.';
const report=jointChoice?'sealed-joint-reassociation-choice-installed-consumer.json':reassociationOnly?'handover-activation-reassociation-installed-consumer.json':'handover-activation-intent-installed-consumer.json';
writeFileSync(join(directory,'result.json'),JSON.stringify(state,null,2));writeFileSync(join(root,'target',report),JSON.stringify(state,null,2));console.log(JSON.stringify({passed:true,tests:expectedCases,directory,sourceUnchanged:true,workspaceLinks:false}));
