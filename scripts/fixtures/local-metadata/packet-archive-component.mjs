/** Real Rust core + real selected server. Local envelopes are comparison DATA,
 * never fabricated operational owners, Native factories or ACKs. */
import assert from 'node:assert/strict';
import {SharedServerLogGenerationDeliveryRecoveryHost as Delivery,generationDeliveryRecoveryHostPort} from '../../../packages/breditor-collaboration/dist/generation_delivery_control/host.js';
import {SharedServerLogGenerationRecoveryHost as Current} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {withCheckedServerMetadataCatalog} from '../../../packages/breditor-collaboration/dist/server_metadata_read/collect.js';
import {MetadataPacketBodyStore} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/body_store.js';
import {MetadataPacketArchive,encodeMetadataPacketArchive} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {readRetainedMetadataPacketReferences} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/native_references.js';
import {testPacketAssetComponents} from './packet-assets-component.mjs';
import {prepareArchiveIntegrity} from '../../../packages/breditor-collaboration/dist/archive_integrity/context.js';
import {countPacketReads} from './count-packet-reads.mjs';
export async function testPacketArchiveComponents({host,selected,reader,core,records,catalog,wasm,http,signal}){
 let allowed=true,tokens=0,wrapper;const cases=[],options={wasm,checkAuthority(){if(!allowed)throw Error('Archive authority ended');}},integrity=prepareArchiveIntegrity(options),store=new MetadataPacketBodyStore(integrity,()=>integrity.guard()),local=[],server=[],parents=new Map(),serverTexts=new Map();
 try{
  wrapper=await Delivery.open({endpoint:selected.deliveryEndpoint,expected:selected.deliverySelection,current:reader,principal:'operator',getToken:()=>{tokens++;return host.operatorToken(selected);},checkAuthority(){if(!allowed)throw Error('Current operator authority ended');}});const port=generationDeliveryRecoveryHostPort(wrapper),index=await withCheckedServerMetadataCatalog(catalog,async value=>value);
  let getter=0;const beforeTokens=tokens;await assert.rejects(port.readMetadataPacket({kind:'version',get expected(){getter++;return index.fingerprints.versions[0];}}),error=>error.code==='delivery_control_policy');assert.equal(getter,0);assert.equal(tokens,beforeTokens);cases.push('query-data-detached-before-getters-or-token-callbacks');
  const oldWrapper=Delivery.prototype.readMetadataPacket,oldCurrent=Current.prototype.readMetadataPacket;let received;
  try{Delivery.prototype.readMetadataPacket=()=>{throw Error('Public wrapper shadow');};Current.prototype.readMetadataPacket=()=>{throw Error('Public current shadow');};received=await port.readMetadataPacket({kind:'version',expected:index.fingerprints.versions[0]});}finally{Delivery.prototype.readMetadataPacket=oldWrapper;Current.prototype.readMetadataPacket=oldCurrent;}
  assert.equal(received.packet.fingerprint.id,index.fingerprints.versions[0].id);cases.push('private-packet-port-ignores-both-public-prototype-shadows');
  for(const[kind,list]of [['version',index.fingerprints.versions],['suggestion',index.fingerprints.suggestions],['revision',index.fingerprints.revisions]])for(const expected of list){
   const read=await port.readMetadataPacket({kind,expected}),receipt=kind==='revision'?index.revisions.find(row=>row.revision.id===expected.id):undefined,previous=receipt?serverTexts.get('suggestion:'+receipt.revision.previousSuggestionId):undefined,body=await store.retain(kind,read.packet.text,core,previous);assert.deepEqual(body.fingerprint,expected);server.push({kind,id:expected.id,body:body.key});serverTexts.set(kind+':'+expected.id,read.packet.text);if(receipt)parents.set(body.key,server.find(row=>row.kind==='suggestion'&&row.id===receipt.revision.previousSuggestionId).body);
  }
  const row=records.versions.packets[0],variant=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(row.packet)).reverse()),null,2),canonical=await store.retain('version',row.packet,core),localVersion=await store.retain('version',variant,core);assert.equal(canonical.native.id,localVersion.native.id);assert.notEqual(canonical.key,localVersion.key);local.push({participant:'actual-comparison-client',point:'actual-original-receipt-data',store:'versions',index:0,body:canonical.key,previousBody:null},{participant:'actual-comparison-client',point:'actual-original-receipt-data',store:'versions',index:1,body:localVersion.key,previousBody:null});
  const duplicate=await http.publish(variant,signal);assert.equal(duplicate.kind,'durable');assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.entry,row.accepted);cases.push('same-Native-id-retains-first-server-and-different-local-packet-strings');
  const scalar=String.fromCharCode(0xfffd),surrogate=String.fromCharCode(0xd800),original=JSON.stringify(JSON.parse(core.captureVersion('Unpublished replacement '+scalar,records.versions.identity.principal,'900'))),odd=original.replace(scalar,surrogate);assert.notEqual(odd,original);assert.equal(core.readVersion(odd).id,core.readVersion(original).id);
  const originalBody=await store.retain('version',original,core),oddBody=await store.retain('version',odd,core);assert.equal(originalBody.fingerprint.sha256,oddBody.fingerprint.sha256);assert.notEqual(originalBody.key,oddBody.key);local.push({participant:'actual-comparison-client',point:'unpublished-string-data',store:'versions',index:0,body:originalBody.key,previousBody:null},{participant:'actual-comparison-client',point:'unpublished-string-data',store:'versions',index:1,body:oddBody.key,previousBody:null});cases.push('lossless-local-UTF16-strings-never-collapse-on-a-normalized-UTF8-hash');
  for(const[i,row]of records.suggestions.retained.entries()){const body=await store.retain('suggestion',row.packet,core);local.push({participant:'actual-comparison-client',point:'actual-original-receipt-data',store:'suggestions',index:i,body:body.key,previousBody:null});}
  for(const[i,row]of records.revisions.retained.entries()){const previous=await store.retain('suggestion',row.previousPacket,core),body=await store.retain('revision',row.packet,core,row.previousPacket);parents.set(body.key,previous.key);local.push({participant:'actual-comparison-client',point:'actual-original-receipt-data',store:'revisions',index:i,body:body.key,previousBody:previous.key});}
  const requirements=await readRetainedMetadataPacketReferences([{participant:'actual-comparison-client',core,check(){}}],store,parents,()=>{});assert.deepEqual(requirements.pending,[]);assert.ok(requirements.references.length>0);cases.push('genuine-Native-reference-reads-cover-all-original-and-local-bodies');
  const parentFile=new Blob([JSON.stringify({records,localStrings:[variant,original,odd]})]),parent={bytes:parentFile.size,sha256:await integrity.digest(parentFile)},chunks=await store.finish(),header={format:'breditor/original-metadata-packet-retention',formatVersion:1,scope:'exact-first-server-and-original-local-metadata-packet-strings',parent,catalog,bodies:store.bodies(),server,local,chunks:chunks.map(({bytes,sha256})=>({bytes,sha256}))},files=await encodeMetadataPacketArchive(header,chunks,options);
  const selectedHeader={...header,parent:{...parent}},selectedChunks=chunks.map(row=>({...row}));
  const captured=await encodeMetadataPacketArchive(selectedHeader,selectedChunks,{...options,checkAuthority(){
   options.checkAuthority();
   selectedHeader.parent.sha256='0'.repeat(64);
   selectedChunks.length=0;
  }});
  assert.equal(captured.manifest.sha256,files.manifest.sha256,'Keep the selected packet parent and chunks through reentry');
  assert.deepEqual(captured.chunks.map(({bytes,sha256})=>({bytes,sha256})),header.chunks);
  const mutableOptions={...options,checkAuthority(){
   options.checkAuthority();
   mutableOptions.wasm=undefined;
   mutableOptions.checkAuthority=()=>{throw Error('Replaced archive authority');};
  }};
  const readmitted=await encodeMetadataPacketArchive(header,chunks,mutableOptions);
  assert.equal(readmitted.manifest.sha256,files.manifest.sha256);
  const opened=await countPacketReads(files.manifest.file,()=>MetadataPacketArchive.read(files,parent,options)),archive=opened.value;
  try{
   const body=header.bodies.find(row=>row.key===server[0].body);
   const part=files.chunks[body.chunk].file.slice(body.offset,body.offset+body.encodedBytes);
   const read=await countPacketReads(part,()=>archive.body(body.key));
   assert.deepEqual([opened.reads,read.reads],[1,1],'Decode the manifest and packet string from their verified bytes');
   assert.equal(read.value.text,serverTexts.get(server[0].kind+':'+server[0].id));
   for(const row of server)assert.equal((await archive.body(row.body)).text,serverTexts.get(row.kind+':'+row.id));assert.equal((await archive.body(localVersion.key)).text,variant);assert.equal((await archive.body(oddBody.key)).text,odd);assert.equal((await archive.body(originalBody.key)).text,original);cases.push('exact-first-and-local-string-round-trip-after-bounded-Native-hashing');
   await assert.rejects(withCheckedServerMetadataCatalog(archive.header().catalog,async()=>true),error=>error.code==='metadata_read_policy');cases.push('recorded-catalog-data-does-not-register-live-host-provenance');
   const reading=archive.body(server[0].body);archive.dispose();await assert.rejects(reading,error=>error.code==='metadata_packet_retention_closed');assert.throws(()=>archive.header());cases.push('disposed-reader-releases-state-and-refuses-late-body-success');
  }finally{archive.dispose();}
  const corrupt=Buffer.from(await files.chunks[0].file.arrayBuffer());corrupt[corrupt.length-1]^=1;await assert.rejects(MetadataPacketArchive.read({...files,chunks:[{...files.chunks[0],file:new Blob([corrupt])},...files.chunks.slice(1)]},parent,options));cases.push('same-size-chunk-corruption-refuses');
  const changed=JSON.parse(await files.manifest.file.text()),first=changed.server.find(row=>row.kind==='version'&&row.id===localVersion.native.id);first.body=localVersion.key;const manifest=new Blob([JSON.stringify(changed)]);await assert.rejects(MetadataPacketArchive.read({...files,manifest:{file:manifest,bytes:manifest.size,sha256:await integrity.digest(manifest)}},parent,options));cases.push('a-valid-local-variant-cannot-replace-the-declared-first-server-body');
  await testPacketAssetComponents({host,selected,wrapper,core,files,parent,requirements,wasm,signal,integrity});
  allowed=false;await assert.rejects(port.readMetadataPacket({kind:'version',expected:index.fingerprints.versions[0]}),error=>error.code==='delivery_control_authority');allowed=true;await wrapper.check();cases.push('current-authority-loss-refuses-without-closing-the-borrowed-reader');
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(port.readMetadataPacket({kind:'version',expected:index.fingerprints.versions[0]},cancelled.signal),error=>error.code==='delivery_control_cancelled');cases.push('pre-cancelled-packet-request-refuses');
  const publication=await http.publish(core.captureVersion('Actual later metadata invalidates old packet selection',records.versions.identity.principal,'999'),signal);assert.equal(publication.kind,'durable');await assert.rejects(port.readMetadataPacket({kind:'version',expected:index.fingerprints.versions[0]}));cases.push('metadata-only-source-change-invalidates-the-real-continuation');
  wrapper.close();await assert.rejects(port.readMetadataPacket({kind:'version',expected:index.fingerprints.versions[0]}),error=>error.code==='delivery_control_closed');cases.push('closed-real-port-refuses');
  console.log('PACKET_ARCHIVE_NATIVE '+JSON.stringify({cases,bodies:header.bodies.length,serverBodies:server.length,localOccurrences:local.length,chunks:chunks.length,exactPacketStrings:true,sourceOrServingGrant:false}));
 }finally{wrapper?.close();}
}
