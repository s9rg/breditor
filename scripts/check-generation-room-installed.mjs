/** The identical native generation inventory/cohort probes in fresh offline archives.
 * Internal installed-file imports are explicit fixture hooks, not public room APIs. */
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
if(process.argv.length!==2)throw Error('Generation room checks accept no substituted runtime or native fixtures');
const temporary=mkdtempSync(join(tmpdir(),'breditor-generation-room-installed-')),archives=join(temporary,'archives'),consumer=join(temporary,'consumer');mkdirSync(archives);mkdirSync(consumer);
const names=['@breditor/browser','@breditor/experimental-rich-content','@breditor/collaboration'],packs=JSON.parse(execFileSync(npm,['pack','--ignore-scripts','--json','--pack-destination',archives,...names.flatMap(n=>['--workspace',n])],{cwd:root,encoding:'utf8'})),paths=packs.map(p=>join(archives,p.filename)),producer=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')),locked=searchConsumerLock(producer,packs.map((p,i)=>({name:p.name,path:paths[i]})));
writeFileSync(join(consumer,'package.json'),JSON.stringify(locked.manifest));writeFileSync(join(consumer,'package-lock.json'),JSON.stringify(locked.lock));execFileSync(npm,['install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,stdio:'inherit'});
const registryArtifacts=verifySearchConsumerRegistry(producer,JSON.parse(readFileSync(join(consumer,'package-lock.json'),'utf8')));for(const name of names)assert.ok(realpathSync(join(consumer,'node_modules',name)).startsWith(realpathSync(consumer)+'/node_modules/'));
for(const name of ['room-participant-inventory/environment.mjs','room-participant-inventory/generation-participant.mjs','room-participant-inventory/generation-refusals.mjs','review-assets/pixels.mjs','interchange-consumer/pixel.mjs']){const dest=join(consumer,'fixtures',name);mkdirSync(dirname(dest),{recursive:true});cpSync(join(root,'scripts/fixtures',name),dest);}
cpSync(join(root,'scripts/fixtures/editor-consumer/types-room-participant-inventory.ts'),join(consumer,'types-room-participant-inventory.ts'));
execFileSync(node,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','types-room-participant-inventory.ts'],{cwd:consumer,stdio:'inherit'});
const nativeFixtures=buildRoomParticipantInventoryFixtures({saveReport:false}),runtime=join(consumer,'node_modules/@breditor/collaboration/dist/runtime'),probes=[];
for(const name of ['inventory','custody']){
 const original=readFileSync(join(root,`scripts/probe-generation-room-${name}.mjs`),'utf8');let probe=original;
 for(const[from,to]of [["import('../packages/breditor-collaboration/dist/index.js')","import('@breditor/collaboration')"],["import('../packages/breditor-experimental-rich-content/index.js')","import('@breditor/experimental-rich-content')"]]){assert.equal(probe.split(from).length,2,from);probe=probe.replace(from,to);}
 assert.ok(!probe.includes('../packages/')&&!probe.includes('../target/'));const file=`generation-room-${name}.mjs`;writeFileSync(join(consumer,file),probe);
 const result=JSON.parse(execFileSync(node,[file,runtime,nativeFixtures.manifest],{cwd:consumer,encoding:'utf8',maxBuffer:2*1024*1024,timeout:360000}));assert.equal(result.passed,true);assert.equal(result.nativeRooms,10);assert.equal(result.sourceFamilies,30);assert.equal(result.networkCalls,0);
 if(name==='inventory')for(const[key,value]of Object.entries({participants:60,coldParticipants:60,coveredStreams:80,localUnboundReviews:20,documentForkRefusals:10,reviewForkRefusals:10,refusalRetentionComparisons:405}))assert.equal(result[key],value,key);
 else for(const[key,value]of Object.entries({cohorts:240,participants:480,coldParticipants:480,successfulCohorts:60,releaseRetries:30,lastGuardRetirementRefusals:30,lastGuardAuthorityRefusals:30,uploadCloseRefusals:30,changedCutRefusals:30,abandonedCohorts:30,earlyRetirementRefusals:30,duplicateOwnerRefusals:30,duplicateIdRefusals:30}))assert.equal(result[key],value,key);
 probes.push({name,sourceTestSha256:sha(original),consumerTestSha256:sha(probe),acceptance:result});
}
writeFileSync(join(consumer,'entry.mjs'),'export {SharedRoomParticipantInventory,captureSharedGenerationSource,SharedGenerationParticipantRecovery,OperationalSharedGenerationParticipant} from "@breditor/collaboration";');
const output=await build({configFile:false,root:consumer,logLevel:'error',build:{target:'es2022',write:false,minify:false,lib:{entry:join(consumer,'entry.mjs'),formats:['es'],fileName:'generation-room-proof'}}}),modules=(Array.isArray(output)?output:[output]).flatMap(r=>r.output).filter(o=>o.type==='chunk').flatMap(o=>Object.keys(o.modules));
for(const path of ['generation_source/native_read.js','generation_source/admission.js','room_participant_inventory/generation_coverage.js','generation_operation/operation.js'])assert.ok(modules.some(p=>p.includes('/node_modules/@breditor/collaboration/dist/'+path)),path);
assert.ok(!modules.some(p=>p.includes(join(root,'packages'))||p.includes('/node_modules/react/')||p.includes('fake-indexeddb')));assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/generation-room-installed-consumer',formatVersion:1,passed:true,source,sourceUnchanged:true,consumer,workspaceLinks:false,strictPublicTypes:true,registryArtifacts,archives:packs.map((p,i)=>({name:p.name,path:paths[i],sha256:sha(readFileSync(paths[i]))})),nativeFixtures,probes,productionModuleCount:modules.length,noWorkspaceReactOrSyntheticStorageInProduction:true,sharedWasmSha256:sha(readFileSync(join(runtime,'breditor_shared_bg.wasm'))),scope:'Unchanged source assertions in fresh offline public archives and all ten normally built native room fixtures. Genuine generation prefix inventory and internal two-child custody prerequisite, current guard refusals, exact files/records, whole-upload preservation and future native histories. No durable generation room catalog, provider closure, authenticated activation, independent comment/server generations or browser durability.'};
writeFileSync(join(root,'target/generation-room-installed-consumer.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
