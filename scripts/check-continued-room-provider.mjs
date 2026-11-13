import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {copyConsumerFixtures} from './candidate-release/copy-consumer-fixtures.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
import {pixel,secondPixel} from './fixtures/review-assets/pixels.mjs';
import {startNativeGenerationCompleteControls} from './fixtures/generation-recovery-control/complete-native-host.mjs';
import {restartPublishedFixture} from './fixtures/generation-recovery-control/restart-published.mjs';
import {completeControlTransport} from './fixtures/physical-recovery-control/complete-transport.mjs';
import {build} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');

async function installedProbe(){
 const directory=mkdtempSync(join(tmpdir(),'breditor-continued-provider-installed-'));
 const consumer=join(directory,'consumer'),archiveDir=join(directory,'archives');
 mkdirSync(consumer);mkdirSync(archiveDir);
 const npm=process.env.BREDITOR_NPM??'npm';
 const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'];
 const packs=JSON.parse(execFileSync(npm,['pack','--offline','--ignore-scripts','--json','--pack-destination',archiveDir,
  ...names.flatMap(name=>['--workspace',name])],{cwd:root,encoding:'utf8'}));
 const archives=packs.map(pack=>({name:pack.name,path:join(archiveDir,pack.filename)}));
 const producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,archives);
 writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));
 writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));
 execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
 const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
 for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
 copyConsumerFixtures(root,consumer,['continued-room-provider/operation-archives.mjs','continued-room-provider/replacement.mjs','continued-room-provider/activation.mjs','continued-room-provider/covered.mjs','continued-room-provider/publication.mjs','continued-room-recovery/operation-archives.mjs','continued-room-recovery/original.mjs','continued-room-recovery/continued-delivery.mjs',
  'room-participant-inventory/environment.mjs','review-assets/pixels.mjs','independent-delivery/session.mjs','owned-core-cleanup/session.mjs']);
 const from="'../packages/breditor-collaboration/dist/index.js'",to="'@breditor/collaboration'";
 for(const name of ['probe-continued-room-catalog.mjs','probe-continued-room-provider.mjs']){
  const original=readFileSync(join(root,'scripts',name),'utf8'),changed=original.replace(from,to);
  assert.notEqual(changed,original);
  assert.equal(changed.replace(to,from),original);
  writeFileSync(join(consumer,name),changed);
 }
 const typeFile='types-continued-room-catalog.ts';
 writeFileSync(join(consumer,typeFile),readFileSync(join(root,'scripts/fixtures/editor-consumer',typeFile)));
 execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes',
  '--target','ES2022','--module','NodeNext','--lib','ES2022,DOM,ESNext.Disposable',typeFile],{cwd:consumer,stdio:'inherit'});
 const entry=join(consumer,'entry.mjs');
 writeFileSync(entry,'export {readContinuedRoomReconciliation,readRecoveredContinuedRoomReconciliation,previewRecoveredContinuedRoomCatchUp,retainRecoveredContinuedRoomCatchUp,prepareContinuedRoomActivation,verifyContinuedRoomActivation,commitContinuedRoomActivation,prepareContinuedRoomPublication,publishContinuedRoom} from "@breditor/collaboration";');
 const output=await build({configFile:false,root:consumer,logLevel:'error',
  build:{target:'es2022',write:false,minify:false,lib:{entry,formats:['es'],fileName:'continued-provider'}}});
 const modules=(Array.isArray(output)?output:[output]).flatMap(result=>result.output)
  .filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules));
 assert.ok(modules.some(module=>module.includes('/node_modules/@breditor/collaboration/dist/continued_room_activation/prepare.js')));
 assert.ok(modules.some(module=>module.includes('/node_modules/@breditor/collaboration/dist/continued_room_activation/commit.js')));
 assert.ok(modules.some(module=>module.includes('/node_modules/@breditor/collaboration/dist/continued_room_activation/publish.js')));
 for(const path of ['continued_room_reconciliation/read.js','continued_room_reconciliation/recovered.js','continued_room_reconciliation/catch_up.js','continued_room_reconciliation/catch_up_client.js','continued_room_reconciliation/retain_replacement.js','continued_room_recovery/recovery.js','continued_room_reconciliation/asset_pins.js','continued_room_reconciliation/independent_prefix.js','continued_room_reconciliation/delivery_prefix.js','continued_room_reconciliation/generation_prefix.js','continued_room_reconciliation/original_prefix.js','continued_room_reconciliation/operation_prefix.js','generation_recovery_control/host.js'])
  assert.ok(modules.some(module=>module.includes('/node_modules/@breditor/collaboration/dist/'+path)),path);
 assert.ok(!modules.some(module=>module.includes(join(root,'packages'))||module.includes('fake-indexeddb')));
 const runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime');
 return {runtime,probe:join(consumer,'probe-continued-room-provider.mjs'),
  proof:{consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,moduleCount:modules.length,
   archives:archives.map(row=>({...row,sha256:sha(readFileSync(row.path))}))}};
}

export async function runContinuedProviderQualification(start,directory,mode='both'){
 const source=sourceEvidence(root);
 assert.equal(source.dirty,false,'Qualify a clean source checkpoint');
 const runtime=join(root,'target/promoted-shared-web'),checksum=sha(readFileSync(join(runtime,'breditor_shared_bg.wasm')));
 const reports={},nativeFixtures=[];
 for(const name of mode==='both'?['source','installed']:[mode]){
  const setup=name==='installed'?await installedProbe():{runtime,probe:join(root,'scripts/probe-continued-room-provider.mjs'),proof:null};
  assert.equal(sha(readFileSync(join(setup.runtime,'breditor_shared_bg.wasm'))),checksum);
  const {probeContinuedRoomProvider}=await import(pathToFileURL(setup.probe).href);
  const cases=[],{controls,transport,restart}=await start(name);
  try{
   const chosen=[[1,false],[3,true]].map(([language,atomic])=>controls.manifest.cases.find(row=>{
    const fixture=JSON.parse(readFileSync(row.path));
    return fixture.language===language&&fixture.atomic===atomic;
   }));
   assert.ok(chosen.every(Boolean));
   nativeFixtures.push(...chosen.map(row=>({path:row.path,sha256:sha(readFileSync(row.path))})));
   for(const row of chosen){
    const result=await probeContinuedRoomProvider(setup.runtime,row,()=>controls.token(row.path),transport.requests,
     controls.delivery(row.path),restart?credentials=>restart(row,credentials):undefined);
    assert.equal(result.passed,true);
    assert.equal(result.localSuffixes,14);
    assert.equal(result.reviewPrefixes,49);
    assert.equal(result.foreignForks,2);
    assert.equal(result.mixedPending,1);
    assert.equal(result.mixedProviderReads,1);
    assert.equal(result.mixedForeignForks,1);
    assert.equal(result.mixedDeliveryProviderReads,1);
    assert.equal(result.continuedDeliveryProviderReads,1);
    assert.equal(result.recoveredRoomReads,1);
    assert.equal(result.recoveredClientCatchUps,2);
    assert.equal(result.recoveredReplacementClients,2);
    assert.equal(result.recoveredReplacementLocalClients,5);
    assert.equal(result.recoveredReplacementRasters,result.atomic?7:0);
    assert.equal(result.recoveredActivationIntents,result.atomic?1:0);
    assert.equal(result.recoveredActivationCommits,result.atomic?1:0);
    assert.equal(result.recoveredPublications,result.atomic?1:0);
    assert.equal(result.recoveredWritableSessions,result.atomic?7:0);
    assert.equal(result.recoveredDeliveredSessions,result.atomic?7:0);
    assert.equal(result.recoveredDeliveredUploads,result.atomic?1:0);
    assert.equal(result.restartedSessions,result.atomic&&restart?7:0);
    assert.equal(result.serverOnlyPacketAssets,result.atomic?1:0);
    assert.equal(result.recoveredRoomRefusals,3);
    assert.equal(result.mixedDeliveryAheadRefusals,1);
    assert.equal(result.generationProviderReads,5);
    assert.equal(result.generationDocumentOnlyReads,1);
    assert.equal(result.generationPredecessorChecks,1);
    assert.equal(result.generationAheadRefusals,1);
    assert.equal(result.generationForkRefusals,1);
    assert.equal(result.originalProviderReads,1);
    assert.equal(result.originalPolicyRefusals,1);
    assert.equal(result.operationProviderReads,3);
    assert.equal(result.operationMissingPolicyReads,1);
    assert.equal(result.operationRevocations,1);
    assert.equal(result.operationDuplicateRefusals,1);
    assert.equal(result.operationGraphAncestorReads,result.atomic?1:0);
    cases.push(result);
   }
  }finally{transport.restore();await controls.stop();}
  reports[name]={cases,proof:setup.proof};
 }
 if(reports.source&&reports.installed)assert.deepEqual(reports.source.cases,reports.installed.cases);
 assert.deepEqual(sourceEvidence(root),source);
 const report={format:'breditor/continued-provider-qualification',formatVersion:1,passed:true,source,
  sharedWasmSha256:checksum,nativeFixtures,reports,
  scope:'Authenticated Native activation and publication, seven clients with cold document, comment, version, proposal and revision acknowledgements, and one queued raster upload. The published-process restart uses fresh authenticated controls and the original client bindings.'};
 saveEvidence(join(directory,'continued-provider-qualification.json'),report);
 return report;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const [binary,mode='both']=process.argv.slice(2);
 assert.ok(binary&&['source','installed','both'].includes(mode),'Supply the native generation complete-control binary and test mode');
 const directory=mkdtempSync(join(root,'target/continued-provider-native-'));
 const start=async name=>{
  const fixtureDirectory=join(directory,name);
  mkdirSync(fixtureDirectory);
  for(const [name,data] of [['seed-a.png',pixel],['seed-b.png',secondPixel]])writeFileSync(join(fixtureDirectory,name),data,{mode:0o600,flag:'wx'});
  const controls=await startNativeGenerationCompleteControls(root,resolve(binary),fixtureDirectory,{serverPacketAssets:true});
  const transport=completeControlTransport(controls.manifest,{readAccepted:true,readRaster:true,commitActivation:true});
  return {controls,transport,async restart(row,credentials){
   const reopened=await restartPublishedFixture(resolve(binary),controls,row,credentials);
   try{transport.attachRestart(reopened);return reopened;}
   catch(error){await reopened.stop();throw error;}
  }};
 };
 const report=await runContinuedProviderQualification(start,directory,mode);
 saveEvidence(join(root,'target',`qualified-continued-room-provider-${mode}.json`),report);
 console.log(JSON.stringify(report,null,2));
}
