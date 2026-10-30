/** Transport DATA tests only. These do not fabricate Native admission evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {metadataPacketQuery} from '../packages/breditor-collaboration/dist/server_metadata_read/packet_query.js';
import {prepareMetadataPacketRequest,metadataPacketEndpoint} from '../packages/breditor-collaboration/dist/server_metadata_read/packet_request.js';
import {readMetadataPacketResponse,verifyMetadataPacketBytes} from '../packages/breditor-collaboration/dist/server_metadata_read/packet_response.js';

const family='server-log-generation-recovery',selection={data:'transport selection only'},packet=' {"unicode":"🙂 日本", "literal":true}\n';
const hash=text=>createHash('sha256').update(text).digest('hex');
const query=metadataPacketQuery({kind:'version',expected:{id:'sha256:'+'a'.repeat(64),bytes:Buffer.byteLength(packet),sha256:'sha256:'+hash(packet)}});
const body=(overrides={})=>JSON.stringify({format:`breditor/${family}-metadata-packet-read`,formatVersion:1,selection,requestSha256:'b'.repeat(64),scope:'selected-server-original-accepted-metadata-packet-bytes',packet:{kind:query.kind,fingerprint:query.expected,text:packet},...overrides});
const read=(text=body())=>readMetadataPacketResponse(text,family,selection,'b'.repeat(64),query,input=>input);
const policy=error=>error.code==='metadata_read_policy',protocol=error=>error.code==='metadata_read_protocol';

test('literal UTF-8 packet survives without canonicalizing its text; Native content ID differs from byte digest',async()=>{
 const result=read();assert.equal(result.packet.text,packet);assert.notEqual(query.expected.id,query.expected.sha256);assert.ok(Object.isFrozen(result.packet.fingerprint));await verifyMetadataPacketBytes(result);
});
test('packet query detaches both levels without invoking accessor callbacks',()=>{
 let getters=0;const hostile={kind:'version',get expected(){getters++;return query.expected;}};
 assert.throws(()=>metadataPacketQuery(hostile),policy);
 assert.throws(()=>metadataPacketQuery({kind:'version',expected:{...query.expected,get bytes(){getters++;return 1;}}}),policy);
 assert.equal(getters,0);const source=structuredClone(query),detached=metadataPacketQuery(source);source.expected.bytes++;assert.equal(detached.expected.bytes,query.expected.bytes);
});
test('closed kinds, exact fields, lowercase digests and bounded nonzero packet sizes are mandatory',()=>{
 for(const input of [{...query,extra:true},{...query,kind:'prepare'},{...query,expected:{...query.expected,extra:true}},...[0,-1,1.5,4*1024*1024+1].map(bytes=>({...query,expected:{...query.expected,bytes}})),{...query,expected:{...query.expected,sha256:'sha256:'+'B'.repeat(64)}}])assert.throws(()=>metadataPacketQuery(input),policy);
});
test('request digest binds the separately named action, exact selection and fingerprint',async()=>{
 const prepared=await prepareMetadataPacketRequest(family,selection,query);assert.equal(prepared.sha256,hash(prepared.body));assert.deepEqual(JSON.parse(prepared.body),{format:`breditor/${family}-metadata-packet-request`,formatVersion:1,selection,packet:query});
 assert.equal(metadataPacketEndpoint('http://127.0.0.1:1/recovery/generations/v1/check'),'http://127.0.0.1:1/recovery/generations/v1/metadata/packet/read');assert.throws(()=>metadataPacketEndpoint('http://127.0.0.1:1/metadata/read'),policy);
});
test('foreign family, selection, request digest, scope and unknown fields cannot cross envelopes',()=>{
 for(const delta of [{format:'breditor/physical-room-recovery-metadata-packet-read'},{selection:{data:'different'}},{requestSha256:'c'.repeat(64)},{scope:'checked'},{extra:true}])assert.throws(()=>read(body(delta)),protocol);
 assert.throws(()=>read(body()+'\n'),protocol);
});
test('wrong packet kind, ID, digest, length or text shape is refused before success',()=>{
 const original=JSON.parse(body()).packet;
 for(const changed of [{...original,kind:'revision'},{...original,fingerprint:{...query.expected,id:'sha256:'+'d'.repeat(64)}},{...original,fingerprint:{...query.expected,sha256:'sha256:'+'d'.repeat(64)}},{...original,text:packet+'x'},{...original,text:null}])assert.throws(()=>read(body({packet:changed})),protocol);
});
test('same-size tampering is caught by the independent SHA-256 check',async()=>{
 const tampered=read(body({packet:{kind:query.kind,fingerprint:query.expected,text:packet.replace('true','fals')}}));await assert.rejects(verifyMetadataPacketBytes(tampered),protocol);
});
