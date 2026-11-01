/** Public immutable output of a previously qualified genuine owner. This
 * fixture supplies readonly Native data, never credentials or current custody. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readSavedPacketReplayFixture(){
 const bytes=readFileSync(new URL('./seven-family-packet-recovery.archive',import.meta.url));assert.equal(sha(bytes),'652339b7f700ee3483db93ba18398640608d84fc6c6e065398c723466cd41ecf');const text=gunzipSync(bytes,{maxOutputLength:32*1024*1024}),input=JSON.parse(text);assert.equal(input.format,'breditor/test-seven-family-packet-recovery');assert.equal(input.formatVersion,1);
 const seen=new Set(),objects=new Map();
 function load(value){
  if(value?.packetRecoveryTestBlob){const row=value.packetRecoveryTestBlob;assert.match(row.object,/^[a-f0-9]{64}\.bin$/);seen.add(row.object);let file=objects.get(row.object);if(!file){const bytes=Buffer.from(input.objects[row.object],'base64');assert.equal(bytes.toString('base64'),input.objects[row.object]);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);file=new Blob([bytes],{type:row.type});objects.set(row.object,file);}return file;}
  if(Array.isArray(value))return value.map(load);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,load(v)]));return value;
 }
 const bundle=load(input.bundle);assert.equal(seen.size,Object.keys(input.objects).length);return{bundle,fixture:input.fixture,provenance:input.provenance};
}
