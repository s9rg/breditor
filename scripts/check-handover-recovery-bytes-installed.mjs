/** Execute complete metadata handover from independently installed package archives. */
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,lstatSync,mkdtempSync,mkdirSync,cpSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('The complete metadata handover workset is required');
const producer=root;
const {searchConsumerLock,verifySearchConsumerRegistry}=await import(new URL('./scripts/search-consumer-lock.mjs','file://'+producer+'/'));
const {executeCandidateStage}=await import(new URL('./scripts/candidate-release/process.mjs','file://'+producer+'/'));
const sha=value=>createHash('sha256').update(value).digest('hex'),directory=mkdtempSync(join(realpathSync(tmpdir()),'breditor-handover-recovery-bytes-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');mkdirSync(archives);mkdirSync(consumer);
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
const tests=['native-metadata-handover-bytes.test.mjs','metadata-handover-bytes-contracts.test.mjs','metadata-handover-contracts.test.mjs','local-review-delivery-contracts.test.mjs','local-metadata-reconciliation-contracts.test.mjs','server-packet-reconciliation-contracts.test.mjs','local-metadata-resume-restore-contracts.test.mjs'];
const expectedCases=27;
const copied=[],mapping=new Map(packages.map(path=>{const row=JSON.parse(readFileSync(join(path,'package.json')));return[path.split('/').at(-1),row.name];}));
function copyScript(path){const target=join(consumer,path),original=readFileSync(join(root,path),'utf8');let text=original;
 text=text.replace(/(['"])((?:\.\.\/)+)packages\/(breditor-[^/]+)\/([^'"]+)\1/g,(match,quote,prefix,folder,tail)=>{const name=mapping.get(folder);if(!name)return match;let selected=relative(dirname(target),join(consumer,'node_modules',name,tail));if(!selected.startsWith('.'))selected='./'+selected;return quote+selected+quote;});
 assert.equal(text.includes('/Users/s/'),false,'No development path may enter installed test source');assert.equal(/(?:\.\.\/)+packages\/breditor-collaboration\//.test(text),false,'No workspace SDK import');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);copied.push({path,sourceSha256:sha(Buffer.from(original)),installedSha256:sha(Buffer.from(text))});
}
function fixtures(path){for(const entry of readdirSync(join(root,path),{withFileTypes:true})){const next=join(path,entry.name);if(entry.isDirectory())fixtures(next);else if(entry.isFile()&&entry.name.endsWith('.mjs'))copyScript(next);}}
fixtures('scripts/fixtures');for(const name of tests)copyScript('scripts/'+name);
copyScript('scripts/diagnostics/archive-error-chain.mjs');
const nativeRelative='target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional',nativeSource=join(root,nativeRelative),nativeTarget=join(consumer,nativeRelative),nativeSha256=sha(readFileSync(nativeSource));mkdirSync(dirname(nativeTarget),{recursive:true});cpSync(nativeSource,nativeTarget);assert.equal(sha(readFileSync(nativeTarget)),nativeSha256);
const wasm=join(consumer,'node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(readFileSync(wasm));assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/installed-handover-recovery-bytes-development',version:1,complete:false,sourceRoot:root,producer,consumer,directory,sourceInputs:before,copied,workspaceLinks:false,registryArtifacts,matchingPackageDistFiles,nativeSha256,normalWasmSha256,archives:packs.map(row=>({name:row.name,path:join(archives,row.filename),sha256:sha(readFileSync(join(archives,row.filename)))})),startedAt:new Date().toISOString()};
writeFileSync(join(directory,'running.json'),JSON.stringify(state,null,2));console.log(JSON.stringify({directory,consumer,phase:'execute-actual-handover-recovery-bytes'}));
const logPath=join(directory,'installed-handover-recovery-bytes.log'),result=await executeCandidateStage({id:'installed-handover-recovery-bytes',command:process.execPath,args:['--test',...tests.map(name=>'scripts/'+name)],env:{},timeoutMs:7800000},{root:consumer,logPath});
const log=readFileSync(logPath,'utf8');state.result={...result,logPath,logSha256:sha(Buffer.from(log))};writeFileSync(join(directory,'running.json'),JSON.stringify(state,null,2));assert.equal(result.status,'passed');for(const [name,value] of [['tests',expectedCases],['pass',expectedCases],['fail',0],['cancelled',0],['skipped',0]])assert.match(log,new RegExp('^# '+name+' '+value+'$','m'));
assert.deepEqual(inputs(),before);assert.equal(sha(readFileSync(nativeSource)),nativeSha256);state.complete=true;state.sourceUnchanged=true;state.releaseReady=false;state.v1GatesOpen=13;state.finishedAt=new Date().toISOString();state.scope='Actual sealed successor, seven cold clients, preserved offline and metadata facts, complete packet/server/raster recovery capture under the authenticated path, current native/provider reconciliation and future Undo/Redo. Node storage/locks and image decoding are controlled fixtures. Whole-room activation and physical browser durability require further qualification.';writeFileSync(join(directory,'result.json'),JSON.stringify(state,null,2));writeFileSync(join(root,'target/handover-recovery-bytes-installed-consumer.json'),JSON.stringify(state,null,2));console.log(JSON.stringify({passed:true,tests:expectedCases,directory,sourceUnchanged:true,workspaceLinks:false}));
