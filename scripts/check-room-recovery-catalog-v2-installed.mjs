/** Identical V2 native/staging assertions in freshly installed, offline public archives. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {sourceEvidence} from './candidate-release/evidence.mjs';
import {searchConsumerLock,verifySearchConsumerRegistry} from './search-consumer-lock.mjs';
import {buildRoomParticipantInventoryFixtures} from './check-room-participant-inventory-native.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),node=process.execPath,npm=process.env.BREDITOR_NPM??process.env.NPM_BIN??'npm',sha=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.length!==2)throw Error('Catalog checks accept no substituted runtime or native fixtures');
const temporary=mkdtempSync(join(tmpdir(),'breditor-catalog-v2-installed-')),archives=join(temporary,'archives'),consumer=join(temporary,'consumer');mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'],packs=JSON.parse(execFileSync(npm,['pack','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(n=>['--workspace',n])],{cwd:root,encoding:'utf8'})),paths=packs.map(p=>join(archives,p.filename)),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((p,i)=>({name:p.name,path:paths[i]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));
for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
for(const name of ['room-participant-inventory/environment.mjs','room-participant-inventory/generation-participant.mjs','room-participant-inventory/participant.mjs','room-recovery-catalog-v2/faults.mjs','room-recovery-catalog-v2/cleanup-failures.mjs','room-recovery-catalog-v2/acquisition-failures.mjs','room-recovery-catalog-v2/opening-failures.mjs','room-recovery-catalog-v2/catalog-opening-failures.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs']){const dest=join(consumer,'fixtures',name);mkdirSync(dirname(dest),{recursive:true});cpSync(join(root,'scripts/fixtures',name),dest);}
cpSync(join(root,'scripts/fixtures/editor-consumer/types-room-recovery-catalog-v2.ts'),join(consumer,'types-room-recovery-catalog-v2.ts'));
execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','types-room-recovery-catalog-v2.ts'],{cwd:consumer,stdio:'inherit'});
const nativeFixtures=buildRoomParticipantInventoryFixtures({saveReport:false}),runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),original=readFileSync(join(root,'scripts/probe-room-recovery-catalog-v2.mjs'),'utf8');let probe=original;
for(const[from,to]of [["import('../packages/breditor-collaboration/dist/index.js')","import('@breditor/collaboration')"],["import('../packages/breditor-experimental-rich-content/index.js')","import('@breditor/experimental-rich-content')"]]){assert.equal(probe.split(from).length,2,from);probe=probe.replace(from,to);}
assert.ok(!probe.includes('../packages/')&&!probe.includes('../target/'));writeFileSync(join(consumer,'catalog-v2-probe.mjs'),probe);
const acceptance=JSON.parse(execFileSync(node,['catalog-v2-probe.mjs',runtime,nativeFixtures.manifest],{cwd:consumer,encoding:'utf8',maxBuffer:2*1024*1024,timeout:360000}));
for(const[key,value]of Object.entries({passed:true,nativeRooms:10,families:30,stagedGeneration:60,stagedMixed:60,coldGeneration:60,coldMixed:60,files:150,duplicateWriterRefusals:30,legacyCopiesRetained:30,futureDocumentCheckpoints:54,futureReviewCheckpoints:54,lostAcknowledgementResumes:6,policySnapshots:2,mixedPolicySnapshots:2,failedCleanupRetries:6,originalCatalogCleanupRetries:2,generationCatalogCleanupRetries:2,mixedOriginalCleanupRetries:2,cleanupColdParticipants:6,failedAcquisitionRetries:12,originalCatalogAcquisitionRetries:4,generationCatalogAcquisitionRetries:4,mixedOriginalAcquisitionRetries:4,acquisitionRetainedRecordComparisons:64,acquisitionColdParticipants:12,acquisitionOriginalFileComparisons:52,networkCalls:0}))assert.equal(acceptance[key],value,key);
for(const[key,value]of Object.entries({initialOpeningRetries:20,openingCatalogRetries:12,openingDirectRetries:8,openingMissingDestinationChecks:42,openingLiveOwnerRefusals:8,openingRetainedRecordComparisons:42,openingColdParticipants:20,openingOriginalFileComparisons:60,openingReturnedOwnerReopens:8}))assert.equal(acceptance[key],value,key);
for(const[key,value]of Object.entries({catalogOpeningRetries:8,catalogOpeningBeginRetries:4,catalogOpeningResumeRetries:4,catalogOpeningMissingChecks:4,catalogOpeningLiveOwnerRefusals:8,catalogOpeningRetainedRecordComparisons:4,catalogOpeningOriginalFileComparisons:32,catalogOpeningColdReopens:8}))assert.equal(acceptance[key],value,key);
const continuedSource=readFileSync(join(root,'scripts/probe-continued-generation-catalog.mjs'),'utf8');
const continuedProbe=continuedSource
 .replace("import('../packages/breditor-collaboration/dist/index.js')","import('@breditor/collaboration')")
 .replace("import('../packages/breditor-experimental-rich-content/index.js')","import('@breditor/experimental-rich-content')")
 .replace("import('../packages/breditor-collaboration/dist/generation_operation/operation.js')",
  "import('./node_modules/@breditor/collaboration/dist/generation_operation/operation.js')")
 .replace("import('../packages/breditor-collaboration/dist/generation_source/record_reference_capture.js')",
  "import('./node_modules/@breditor/collaboration/dist/generation_source/record_reference_capture.js')");
assert.ok(!continuedProbe.includes('../packages/')&&!continuedProbe.includes('../target/'));
writeFileSync(join(consumer,'continued-catalog-probe.mjs'),continuedProbe);
const continued=JSON.parse(execFileSync(node,['continued-catalog-probe.mjs',runtime,nativeFixtures.manifest],{cwd:consumer,encoding:'utf8',maxBuffer:2*1024*1024,timeout:120000}));
assert.deepEqual(continued,{passed:true,interrupted:1,exactPredecessor:true,documentAndCommentRedo:true,exactUploadStore:true,retainedRasters:2,uploadReceipt:true,versionPackets:2,offlineGroups:6,nativeInventoryPrefix:true,unboundReview:true,
 operationalReopen:true,replacedPredecessorRefused:true,forkRefused:true,readOnlyReopen:true,advancedOfflineGroups:8,protectedOriginsRead:true,fourSlotReferences:true});
writeFileSync(join(consumer,'entry.mjs'),'export {SharedRoomRecoveryCatalogArchive,SharedRoomRecoveryCatalog,SharedRoomRecoveryCatalogArchiveV2,SharedRoomRecoveryCatalogV2,OperationalSharedGenerationParticipant} from "@breditor/collaboration";');
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'catalog-v2-proof'}}}),modules=(Array.isArray(output)?output:[output]).flatMap(r=>r.output).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules));
for(const path of ['room_recovery_catalog/catalog.js','room_recovery_catalog_v2/catalog.js','room_recovery_catalog_v2/archive.js','room_recovery_catalog_v2/coverage.js','generation_participant/recovery.js','generation_operation/operation.js','generation_source/native_read.js','participant_recovery/cleanup_scope.js','participant_recovery/opening_custody.js'])assert.ok(modules.some(p=>p.includes('/node_modules/@breditor/collaboration/dist/'+path)),path);
assert.ok(!modules.some(p=>p.includes(join(root,'packages'))||p.includes('/node_modules/react/')||p.includes('fake-indexeddb')));assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/room-recovery-catalog-v2-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,archives:packs.map((p,i)=>({name:p.name,path:paths[i],sha256:sha(readFileSync(paths[i]))})),nativeFixtures,sourceTestSha256:sha(original),consumerTestSha256:sha(probe),acceptance,continued,continuedSourceTestSha256:sha(continuedSource),productionModuleCount:modules.length,noWorkspaceReactOrSyntheticStorageInProduction:true,sharedWasmSha256:sha(readFileSync(join(runtime,'breditor_shared_bg.wasm'))),scope:'Identical source assertions in fresh offline public archives using all ten normally built native room fixtures. Mixed-family exact retention, inactive room staging and continued local participant operational reopen and protected history references. Whole-room operational custody, provider/client closure, independent comment/server generations, browser durability and authenticated activation are separate.'};
writeFileSync(join(root,'target/room-recovery-catalog-v2-installed-consumer.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
