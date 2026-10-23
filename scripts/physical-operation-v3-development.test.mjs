/** Functional durable recovery using synthetic IDB and genuine normal native
 * owners. Does not claim physical-browser durability, authenticated activation,
 * seven distinct simultaneous writers, installed packaging or release readiness. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalV3Manifest} from './fixtures/physical-operation-v3/manifest.mjs';
import {PhysicalRoomCatalogV3 as Catalog} from '../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {currentV3Participant,v3CatalogReadOptions,closeV3FixtureWriters,verifyV3RecoveredParticipant} from './fixtures/physical-operation-v3/participants.mjs';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';
const sourceFactory=options=>Object.fromEntries(Object.entries(options).filter(([key])=>!['database','create'].includes(key)));
const flatChoice=(source,local,checkAuthority=()=>{},signal)=>({id:'local-flat',family:'local-operation-flat',options:{kind:'flat-local-v1',expected:source.clients.get('local-flat').backup.selection(),database:'selected flat journal 日本',sourceDatabase:'selected flat source 日本',sourceFactory:sourceFactory(local.options),writerRecovery:'host-reacquired',checkAuthority,...(signal?{signal}:{}),cohort:{parentDatabase:'selected flat parent 日本',uploadsDatabase:'selected flat uploads 日本'}}});
async function retire(parts){for(const row of parts?.participants??[]){if(row.family==='original'){await row.parts.sources.revisions?.close();await row.parts.sources.suggestions?.close();await row.parts.sources.versions?.close();await row.parts.session.discardAndClose();}else await row.parts.source.session.discardAndClose();row.parts.uploads.close();}}
test('V3 flat recovery cold reopens exact native state and outlives its finite job',async()=>operationalV3Manifest(async({source,archive,h,local})=>{
 const baseline=source.clients.get('local-flat').backup.live(),file=await source.clients.get('local-flat').backup.file().arrayBuffer(),rows=[flatChoice(source,local)],controller=new AbortController();let jobOpen=true,owner,parts,catalog;
 const read={...h.options,localPolicies:source.metadata.participants.filter(r=>r.family==='local-operation-flat'||r.family==='local-operation-snapshot').map(row=>({id:row.id,family:row.family,original:row.selection.original,options:local.readOptions}))},options={...read,database:'whole room intent 日本',expected:archive.selection(),participants:rows,signal:controller.signal,checkAuthority(){assert.equal(jobOpen,true);}};
 try{
  await local.close();catalog=await Catalog.begin({...read,database:'whole room catalog 日本',archive,expected:archive.selection()});owner=await Operation.begin({...options,catalog});assert.equal((await owner.progress()).phase,'prepared');assert.equal((await owner.finish()).phase,'operational');await owner.close();
  owner=await Operation.resume({...options,catalogDatabase:'whole room catalog 日本'});assert.equal((await owner.progress()).phase,'operational');await owner.finish();parts=await owner.intoParts();assert.equal(parts.participants.length,1);assert.equal(parts.participants[0].family,'local-operation-flat');
  const part=parts.participants[0].parts;assert.deepEqual(part.source.session.exportRecovery(),baseline);assert.deepEqual(new Uint8Array(await part.input.file().arrayBuffer()),new Uint8Array(file));
  jobOpen=false;controller.abort();insertCleanupText(part.source.session.core,'Client continues after finite recovery job ');await part.source.session.flush();assert.match(part.source.session.core.documentJson(),/Client continues after finite recovery job/);
  await assert.rejects(owner.check(),e=>e.code==='physical_operation_v3_closed');
 }finally{await retire(parts);await owner?.discardAndClose();await catalog?.close();}
}));
for(const family of ['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot'])test('V3 '+family+' retains native histories, complete uploads and cold continuation',async()=>operationalV3Manifest(async fixture=>{
 const{source,archive}=fixture,job=new AbortController();let jobOpen=true,owner,parts,catalog;
 try{
  await closeV3FixtureWriters(fixture);const selected=await currentV3Participant(fixture,family),read=v3CatalogReadOptions(fixture),options={...read,database:'whole room '+family,expected:archive.selection(),participants:[selected],signal:job.signal,checkAuthority(){assert.equal(jobOpen,true);}};
  catalog=await Catalog.begin({...read,database:'retained room '+family,archive,expected:archive.selection()});owner=await Operation.begin({...options,catalog});assert.equal((await owner.finish()).phase,'operational');await owner.close();
  owner=await Operation.resume({...options,catalogDatabase:'retained room '+family});await owner.finish();parts=await owner.intoParts();assert.equal(parts.participants.length,1);assert.equal(parts.participants[0].family,family);await verifyV3RecoveredParticipant(selected,source,parts.participants[0].parts);
  jobOpen=false;job.abort();const session=family==='original'?parts.participants[0].parts.session:parts.participants[0].parts.source.session;if(session.core.view().readOnly)assert.throws(()=>insertCleanupText(session.core,'No reader escalation '));else{insertCleanupText(session.core,'Current client independent from recovery job ');assert.match(session.core.documentJson(),/Current client independent from recovery job/);}await session.flush();assert.equal(fixture.h.counts.networkCalls,0);
 }catch(error){console.error('V3 native development chain',family,internalFailureChain(error).map(value=>({name:value.name,code:value.code,message:value.message,stack:value.stack})));throw error;}finally{await retire(parts);await owner?.discardAndClose();await catalog?.close();}
}));
