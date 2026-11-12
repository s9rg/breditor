/** Execute authenticated SDK handover activation and controller/storage laws from installed packages. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,lstatSync,mkdtempSync,mkdirSync,cpSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareActivationRetentionFixture} from './fixtures/activation-retention/prepare.mjs';
import {sourceEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
prepareActivationRetentionFixture(root);
const sealedProcess=process.argv.length===3&&process.argv[2]==='--sealed-process';
if(process.argv.length!==2&&!sealedProcess)throw Error('Expected no arguments or --sealed-process');
const producer=root;
const {searchConsumerLock,verifySearchConsumerRegistry}=await import(new URL('./scripts/search-consumer-lock.mjs','file://'+producer+'/'));
const {executeCandidateStage}=await import(new URL('./scripts/candidate-release/process.mjs','file://'+producer+'/'));
const sha=value=>createHash('sha256').update(value).digest('hex'),directory=mkdtempSync(join(realpathSync(tmpdir()),'breditor-handover-native-activation-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');mkdirSync(archives);mkdirSync(consumer);
const inputs=()=>{const result=[];function walk(path){const s=lstatSync(path);if(s.isSymbolicLink())return;if(s.isDirectory())for(const name of readdirSync(path).sort())walk(join(path,name));else if(s.isFile())result.push({path:relative(root,path),bytes:s.size,sha256:sha(readFileSync(path))});}for(const path of ['packages/breditor-collaboration/src','packages/breditor-collaboration/dist','scripts'])walk(join(root,path));return result;};
const before=inputs(),sourcePackage=JSON.parse(readFileSync(join(root,'packages/breditor-collaboration/package.json'))),producerLock=JSON.parse(readFileSync(join(producer,'package-lock.json'))),packages=[join(producer,'packages/breditor-browser'),join(producer,'packages/breditor-experimental-rich-content'),join(root,'packages/breditor-collaboration')];
for(const path of packages)assert.equal(JSON.parse(readFileSync(join(path,'package.json'))).version,sourcePackage.version);
const packs=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',archives,...packages],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024})),locked=searchConsumerLock(producerLock,packs.map(row=>({name:row.name,path:join(archives,row.filename)})));
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
const sealedTests=['native-sealed-handover-process-recovery.test.mjs','native-sealed-published-process-recovery.test.mjs'];
const tests=sealedProcess?sealedTests
 :['native-handover-activation-coordinated.test.mjs','native-handover-activation-host.test.mjs','native-handover-publication-host.test.mjs',...sealedTests,'handover-activation-coordination.test.mjs','recorded-base-handover-inspection.test.mjs','generation-recovery-control.test.mjs','generation-delivery-control.test.mjs','generation-delivery-path-control.test.mjs','generation-control-request-lifetime.test.mjs','native-activation-transport.test.mjs','handover-activation-intent-storage.test.mjs','activation-retention-lifetime.test.mjs','room-native-activation-intent.test.mjs','activation-intent-wire.test.mjs'];
const expectedCases=sealedProcess?4:220;
const copied=[],mapping=new Map(packages.map(path=>{const row=JSON.parse(readFileSync(join(path,'package.json')));return[path.split('/').at(-1),row.name];}));
function copyScript(path){const target=join(consumer,path),original=readFileSync(join(root,path),'utf8');let text=original;
 text=text.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(match,quote,prefix,folder,tail)=>{const name=mapping.get(folder);if(!name)return match;let selected=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!selected.startsWith('.'))selected='./'+selected;return quote+selected+quote;});
 assert.equal(text.includes('/Users/s/'),false,'No development path may enter installed test source');assert.equal(/(?:\.\.\/)+packages\/breditor-collaboration\//.test(text),false,'No workspace SDK import');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);copied.push({path,sourceSha256:sha(Buffer.from(original)),installedSha256:sha(Buffer.from(text))});
}
function fixtures(path){for(const entry of readdirSync(join(root,path),{withFileTypes:true})){const next=join(path,entry.name);if(entry.isDirectory())fixtures(next);else if(entry.isFile()&&entry.name.endsWith('.mjs'))copyScript(next);}}
fixtures('scripts/fixtures');for(const name of tests)copyScript('scripts/'+name);
copyScript('scripts/diagnostics/archive-error-chain.mjs');
copyScript('scripts/fixtures/editor-consumer/types-handover-activation-coordination.ts');
const retained='target/activation-retainer-actual-input',indexBytes=readFileSync(join(root,retained,'index.json'));
assert.equal(sha(indexBytes),'572671293d3afd4c2134c69774e8e0bacc0d180e9f652dbf8d64a4354a510518');
const corpus=JSON.parse(indexBytes),runtimeInputs=[];
for(const row of [{name:'index.json',bytes:indexBytes.length,sha256:sha(indexBytes)},...corpus.files]){
 const path=join(retained,row.name),data=readFileSync(join(root,path));assert.equal(data.length,row.bytes);assert.equal(sha(data),row.sha256);
 mkdirSync(dirname(join(consumer,path)),{recursive:true});writeFileSync(join(consumer,path),data);runtimeInputs.push({path,bytes:data.length,sha256:row.sha256});
}
const staticPath='scripts/fixtures/local-metadata/pending-source-packet-recovery.archive',staticBytes=readFileSync(join(root,staticPath));
mkdirSync(dirname(join(consumer,staticPath)),{recursive:true});writeFileSync(join(consumer,staticPath),staticBytes);runtimeInputs.push({path:staticPath,bytes:staticBytes.length,sha256:sha(staticBytes)});
execFileSync(join(root,'node_modules/.bin/tsc'),['--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','scripts/fixtures/editor-consumer/types-handover-activation-coordination.ts'],{cwd:consumer,stdio:'inherit',timeout:120000});

const nativeRelative='target/handover-activation-native/release/examples/native_handover_activation_sdk_functional',nativeSource=join(root,nativeRelative),nativeTarget=join(consumer,nativeRelative),nativeSha256=sha(readFileSync(nativeSource));mkdirSync(dirname(nativeTarget),{recursive:true});cpSync(nativeSource,nativeTarget);assert.equal(sha(readFileSync(nativeTarget)),nativeSha256);
const nativeBuild=JSON.parse(readFileSync(join(root,'target/handover-native-activation-native-build.json')));assert.equal(nativeBuild.complete,true);assert.equal(nativeBuild.exitCode,0);assert.equal(nativeBuild.sourceUnchanged,true);assert.equal(nativeBuild.exceeded,false);assert.equal(nativeBuild.timedOut,false);assert.equal(nativeBuild.monitorError,undefined);assert.deepEqual(nativeBuild.source,sourceEvidence(root));assert.equal(nativeBuild.binaries[0].sha256,nativeSha256);
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(readFileSync(wasm));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/installed-handover-native-activation-development',version:1,complete:false,sourceRoot:root,producer,consumer,directory,sourceInputs:before,copied,runtimeInputs,workspaceLinks:false,registryArtifacts,matchingPackageDistFiles,nativeSha256,nativeBuild,normalWasmSha256,archives:packs.map(row=>({name:row.name,path:join(archives,row.filename),sha256:sha(readFileSync(join(archives,row.filename)))})),startedAt:new Date().toISOString()};
writeFileSync(join(directory,'running.json'),JSON.stringify(state,null,2));console.log(JSON.stringify({directory,consumer,phase:'execute-actual-handover-native-activation'}));
const logPath=join(directory,'installed-handover-native-activation.log'),result=await executeCandidateStage({id:'installed-handover-native-activation',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:{BREDITOR_ACTIVATION_RETENTION_FIXTURE:join(consumer,retained)},timeoutMs:7800000},{root:consumer,logPath});
const log=readFileSync(logPath,'utf8');state.result={...result,logPath,logSha256:sha(Buffer.from(log))};writeFileSync(join(directory,'running.json'),JSON.stringify(state,null,2));assert.equal(result.status,'passed');for(const [name,value] of [['tests',expectedCases],['pass',expectedCases],['fail',0],['cancelled',0],['skipped',0]])assert.match(log,new RegExp('^# '+name+' '+value+'$','m'));
assert.deepEqual(inputs(),before);assert.equal(sha(readFileSync(nativeSource)),nativeSha256);state.complete=true;state.sourceUnchanged=true;state.releaseReady=false;state.v1GatesOpen=13;state.finishedAt=new Date().toISOString();
state.scope=sealedProcess
 ?'Actual Native sealed process exits and fresh protected-stream authentication, checkpoint and publication controls. Whole-room SDK owner recovery is separate.'
 :'Actual inactive sealed successor activated by genuine SDK metadata coordination and authenticated Rust HTTP. Seven cold owners, fourteen offline lanes, original metadata, complete intent retention, explicit lost-response retry, one actual Native epoch, authenticated Native listener publication with an explicit lost-reply retry, normal delivery, provider reconciliation and future histories. Includes sealed Native process exits and fresh authenticated publication. Controller/storage laws use additional controlled wire fixtures. Node storage, locks and image decoding are controlled. Whole-room local-owner publication and physical durability remain separate.';
const report=sealedProcess?'sealed-native-process-installed-consumer.json':'handover-native-activation-installed-consumer.json';
writeFileSync(join(directory,'result.json'),JSON.stringify(state,null,2));writeFileSync(join(root,'target',report),JSON.stringify(state,null,2));console.log(JSON.stringify({passed:true,tests:expectedCases,directory,sourceUnchanged:true,workspaceLinks:false}));
