/** Fresh offline consumer and actual bundle repeat the fixed native cohort
 * workload. Only reversible assertion/module/fixture locations may change. */
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {build} from 'vite';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
if(process.argv.length!==2)throw Error('No substituted runtime, assertions or reduced workload accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(tmpdir(),'breditor-delivery-operation-cohort-installed-')),archives=join(directory,'archives'),consumer=join(directory,'consumer');
const sha=b=>createHash('sha256').update(b).digest('hex'),node=process.execPath,npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm';mkdirSync(archives);mkdirSync(consumer);
function run(id,command,args,env=process.env){try{const out=execFileSync(command,args,{cwd:consumer,encoding:'utf8',env,timeout:1800000,maxBuffer:12*1024*1024});writeFileSync(join(directory,id+'.log'),out);return out;}catch(error){writeFileSync(join(directory,id+'.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}}
const execFileAsync=promisify(execFile);
async function runAcceptance(id,entry){
 console.log('PHASE',id,directory);
 const log=join(directory,id+'.log');
 try{
  const {stdout}=await execFileAsync(node,[entry,runtime],{cwd:consumer,encoding:'utf8',timeout:2700000,maxBuffer:12*1024*1024});
  writeFileSync(log,stdout);
  return stdout;
 }catch(error){
  writeFileSync(log,String(error.stdout??'')+'\n'+String(error.stderr??''));
  throw new Error(id+' failed. See '+log,{cause:error});
 }
}
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
const packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'})),paths=packs.map(row=>join(archives,row.filename));
const producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((row,index)=>({name:row.name,path:paths[index]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));run('install',npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund']);
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
const copiedAssertions=[];
function relocate(original,rewrites,name){let copy=original;const used=[];for(const[from,to]of rewrites)if(copy.includes(from)){copy=copy.replaceAll(from,to);used.push([from,to]);}let back=copy;for(const[from,to]of used.toReversed())back=back.replaceAll(to,from);assert.equal(back,original,'Assertions may change only reversible locations');copiedAssertions.push({name,sourceSha256:sha(original),installedSha256:sha(copy),reversibleLocationsOnly:true});return copy;}
const fixtures=new Set();
function discover(path){const text=readFileSync(path,'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)){const file=new URL(match[1],pathToFileURL(path)).pathname;if(file.startsWith(join(root,'scripts/fixtures')+'/')&&file.endsWith('.mjs')&&!fixtures.has(file)){fixtures.add(file);discover(file);}}}
for(const name of ["delivery-operation-cohort.test.mjs","delivery-local-operation-cohort.test.mjs","restored-participant.test.mjs","independent-operation-participant.test.mjs","native-input-cohort.test.mjs","native-input-cohort-shape.test.mjs","native-signal-fence.test.mjs","probe-delivery-operation-cohort.mjs"])discover(join(root,'scripts',name));
for(const absolute of fixtures){const path=relative(join(root,'scripts/fixtures'),absolute),original=readFileSync(absolute,'utf8');for(const[bucket,prefix]of[['fixtures','../../node_modules/@breditor/collaboration/dist/'],['bundled-fixtures','../../bundle-modules/']]){const target=join(consumer,bucket,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,relocate(original,[['../../../packages/breditor-collaboration/dist/',prefix]],bucket+'/'+path));}}
cpSync(join(root,'crates/breditor-core/tests/fixtures/rich-local-root.json'),join(consumer,'rich-local-root.json'));
const typeFile='types-delivery-operation-cohort.ts',typeSource=readFileSync(join(root,'scripts/fixtures/editor-consumer',typeFile),'utf8');writeFileSync(join(consumer,typeFile),relocate(typeSource,[['../../../packages/breditor-collaboration/dist/','./node_modules/@breditor/collaboration/dist/']],typeFile));
run('types',node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',typeFile]);
const unitFiles=["delivery-operation-cohort.test.mjs","delivery-local-operation-cohort.test.mjs","restored-participant.test.mjs","independent-operation-participant.test.mjs","native-input-cohort.test.mjs","native-input-cohort-shape.test.mjs","native-signal-fence.test.mjs"];
for(const unitFile of unitFiles){const unitSource=readFileSync(join(root,'scripts',unitFile),'utf8');writeFileSync(join(consumer,unitFile),relocate(unitSource,[['../packages/breditor-collaboration/dist/','./node_modules/@breditor/collaboration/dist/'],['../crates/breditor-core/tests/fixtures/rich-local-root.json','./rich-local-root.json'],['../target/promoted-shared-web/','./node_modules/@breditor/collaboration/dist/runtime/']],unitFile));}
const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime');
const unitEnvironment={...process.env,BREDITOR_NATIVE_INPUT_COHORT_RUNTIME:runtime,BREDITOR_OPERATION_PARTICIPANT_RUNTIME:runtime,BREDITOR_RESTORED_PARTICIPANT_RUNTIME:runtime};
console.log('PHASE','contracts',directory);
const unit=run('contracts',node,['--test',...unitFiles],unitEnvironment);
assert.match(unit,/^# pass 120$/m);assert.match(unit,/^# fail 0$/m);assert.match(unit,/^# skipped 0$/m);
const probe=readFileSync(join(root,'scripts/probe-delivery-operation-cohort.mjs'),'utf8');writeFileSync(join(consumer,'probe.mjs'),probe);assert.equal(sha(readFileSync(join(consumer,'probe.mjs'))),sha(probe));writeFileSync(join(consumer,'bundled-probe.mjs'),relocate(probe,[['./fixtures/','./bundled-fixtures/']],'bundled-probe.mjs'));
const imports="import*as api from'@breditor/collaboration';import*as rich from'@breditor/experimental-rich-content';import{OperationalIndependentLocalParticipant as Legacy}from'./node_modules/@breditor/collaboration/dist/independent_local_operation/participant.js';import{OperationalRestoredLocalParticipant as Snapshot}from'./node_modules/@breditor/collaboration/dist/restored_local_operation/participant.js';import{OperationalFlatLocalParticipant as Flat}from'./node_modules/@breditor/collaboration/dist/flat_local_operation/participant.js';import{OperationalIndependentDeliveryParticipant as Delivery}from'./node_modules/@breditor/collaboration/dist/independent_operation/participant.js';import{RestoredOperationParticipant as Restored}from'./node_modules/@breditor/collaboration/dist/restored_participant/participant.js';import{captureLocalOperationBackup}from'./node_modules/@breditor/collaboration/dist/independent_local_operation/portable_capture.js';import{captureIndependentOperationBackup}from'./node_modules/@breditor/collaboration/dist/independent_operation/portable_capture.js';import{IndependentOperationLineageBackup}from'./node_modules/@breditor/collaboration/dist/independent_operation/lineage_archive.js';import{independentDeliverySource}from'./node_modules/@breditor/collaboration/dist/independent_delivery_source/admission.js';import{operationJournalBinding}from'./node_modules/@breditor/collaboration/dist/independent_operation/cut_journal.js';import{restoredOperationJournalBinding}from'./node_modules/@breditor/collaboration/dist/restored_operation/journal.js';import{handoffDeliveryOperationParticipants}from'./node_modules/@breditor/collaboration/dist/delivery_operation_cohort/cohort.js';";
const internals="const internals={Legacy,Snapshot,Flat,Delivery,Restored,captureLocalOperationBackup,captureIndependentOperationBackup,IndependentOperationLineageBackup,independentDeliverySource,operationJournalBinding,restoredOperationJournalBinding,handoffDeliveryOperationParticipants};";
const invoke="console.log(JSON.stringify(await probeDeliveryOperationCohort({api,rich,internals,runtime:process.argv[2],fixture:new URL('./rich-local-root.json',import.meta.url)})));\n";
writeFileSync(join(consumer,'acceptance.mjs'),imports+internals+"import{probeDeliveryOperationCohort}from'./probe.mjs';"+invoke);
const modules=['restored_local_operation/participant.js','independent_local_operation/portable_capture.js','flat_local_operation/capture.js'];
let entry=imports+internals+'export{api,rich,internals};\n';for(const[index,path]of modules.entries())entry+="import*as proxy"+index+" from './node_modules/@breditor/collaboration/dist/"+path+"';export{proxy"+index+"};\n";writeFileSync(join(consumer,'entry.mjs'),entry);
const built=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'delivery-operation-cohort-proof'},rollupOptions:{output:{inlineDynamicImports:true}}}}),chunks=(Array.isArray(built)?built:[built]).flatMap(row=>row.output).filter(row=>row.type==='chunk');assert.equal(chunks.length,1);const production=Object.keys(chunks[0].modules);
for(const path of ["delivery_operation_cohort/cohort.js","independent_operation/participant.js","independent_operation/participant_owners.js","independent_operation/cut_journal.js","restored_participant/participant.js","restored_operation/journal.js","independent_recovery/signal.js","operation_cohort/source_handoff.js","local_operation_cohort/cohort.js","native_input_operation/handoff.js","operation_cohort/cohort.js"])assert.ok(production.some(name=>name.endsWith('/node_modules/@breditor/collaboration/dist/'+path)),path);
assert.ok(!production.some(name=>name.includes(join(root,'packages'))||name.includes('/node_modules/react/')||name.includes('fake-indexeddb')));writeFileSync(join(consumer,'bundle.mjs'),chunks[0].code);
const proxies=[];
for(const[index,path]of modules.entries()){const namespace=await import(pathToFileURL(join(consumer,'node_modules/@breditor/collaboration/dist',path)).href),target=join(consumer,'bundle-modules',path),from=relative(dirname(target),join(consumer,'bundle.mjs')).replaceAll('\\','/'),names=Object.keys(namespace);for(const name of names)assert.match(name,/^[A-Za-z_$][A-Za-z0-9_$]*$/);const text="import{proxy"+index+" as source}from'"+(from.startsWith('.')?from:'./'+from)+"';\n"+names.map(name=>name==='default'?'export default source.default;':'export const '+name+'=source.'+name+';').join('\n')+'\n';mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);proxies.push({module:path,names,sha256:sha(text)});}
writeFileSync(join(consumer,'bundled-acceptance.mjs'),"import{api,rich,internals}from'./bundle.mjs';import{probeDeliveryOperationCohort}from'./bundled-probe.mjs';"+invoke);
// These children read the same immutable package files and each owns its
// synthetic storage. Await all exits before comparing their reports.
const proofs=await Promise.allSettled([
 runAcceptance('acceptance','acceptance.mjs'),
 runAcceptance('bundled-acceptance','bundled-acceptance.mjs'),
]);
for(const proof of proofs)if(proof.status==='rejected')throw proof.reason;
const [accepted,bundled]=proofs.map(proof=>proof.value);
const acceptance=JSON.parse(accepted),bundledAcceptance=JSON.parse(bundled);
assert.equal(acceptance.passed,true);assert.equal(acceptance.cases,40);assert.equal(acceptance.handoffs,400);
assert.equal(acceptance.sharedWasmSha256,sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))));
assert.deepEqual(bundledAcceptance,acceptance);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/delivery-operation-cohort-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,consumer,workspaceLinks:false,strictPrivateTypes:true,registryArtifacts,archives:packs.map((row,index)=>({name:row.name,path:paths[index],sha256:sha(readFileSync(paths[index]))})),copiedAssertions:{files:copiedAssertions,probeByteIdentical:true,bundleProxies:proxies},unitContracts:{passed:120,failed:0,skipped:0,log:join(directory,'contracts.log')},acceptance,bundledAcceptance,productionModuleCount:production.length,bundleSha256:sha(chunks[0].code),noWorkspaceReactOrSyntheticStorageInProduction:true,scope:'Private functional custody: all120 installed laws and strict five-family selection/provider types; actual fresh archives and an actual bundle each execute the same fixed40five-family cohorts. Full bundled negative suite is not claimed. Not seven-family catalog adoption, complete reconciliation, authenticated activation, sustainable history, physical durability or V1 approval.'};
saveEvidence(join(root,'target/delivery-operation-cohort-installed-consumer.json'),report);saveEvidence(join(directory,'result.json'),report);console.log(JSON.stringify(report));
