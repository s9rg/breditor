/** Public DATA from an actual seven-family Pending capture. No saved credential,
 * mutable journal, operational owner or old filesystem location is restored. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readPendingSourceReplayFixture(){
 const bytes=readFileSync(new URL('./pending-source-packet-recovery.archive',import.meta.url));assert.equal(sha(bytes),'f49c7ed524d513b34c214fc41b7d7452eaa8cd1100d4b2817cb5afb79883ff99');const input=JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}));assert.equal(input.format,'breditor/test-pending-source-packet-recovery');assert.equal(input.formatVersion,1);const seen=new Set(),objects=new Map();
 function load(value){if(value?.packetRecoveryTestBlob){const row=value.packetRecoveryTestBlob;assert.match(row.object,/^[a-f0-9]{64}\.bin$/);seen.add(row.object);let file=objects.get(row.object);if(!file){const bytes=Buffer.from(input.objects[row.object],'base64');assert.equal(bytes.toString('base64'),input.objects[row.object]);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);file=new Blob([bytes],{type:row.type});objects.set(row.object,file);}return file;}if(Array.isArray(value))return value.map(load);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,load(v)]));return value;}
 const bundle=load(input.bundle);assert.equal(seen.size,Object.keys(input.objects).length);return{bundle,fixture:input.fixture,provenance:input.provenance};
}
