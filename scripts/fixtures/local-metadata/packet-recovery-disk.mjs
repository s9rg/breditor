
/** Exact test-only multi-file save/readback. Blob bytes are content-addressed;
 * public evidence never includes private host tokens or reconstructed owners. */
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function savePacketRecoveryBundle(directory,bundle){
 mkdirSync(directory,{recursive:false});const objects=join(directory,'objects');mkdirSync(objects);const written=new Set();let logical=0,occurrences=0;
 async function save(value){
  if(value instanceof Blob){const data=Buffer.from(await value.arrayBuffer()),digest=sha(data),name=digest+'.bin';if(!written.has(name)){writeFileSync(join(objects,name),data,{flag:'wx',mode:0o600});written.add(name);}logical+=data.length;occurrences++;return {packetRecoveryTestBlob:{object:name,bytes:data.length,sha256:digest,type:value.type}};}
  if(Array.isArray(value))return Promise.all(value.map(save));if(value&&typeof value==='object'){const out={};for(const[k,v]of Object.entries(value))out[k]=await save(v);return out;}return value;
 }
 const selected=await save(bundle),index=Buffer.from(JSON.stringify(selected,null,2)+'\n'),indexPath=join(directory,'bundle.json');writeFileSync(indexPath,index,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(indexPath),index);
 function load(value){if(value?.packetRecoveryTestBlob){const row=value.packetRecoveryTestBlob;assert.match(row.object,/^[a-f0-9]{64}\.bin$/);const data=readFileSync(join(objects,row.object));assert.equal(data.length,row.bytes);assert.equal(sha(data),row.sha256);return new Blob([data],{type:row.type});}if(Array.isArray(value))return value.map(load);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,load(v)]));return value;}
 return {bundle:load(JSON.parse(readFileSync(indexPath,'utf8'))),evidence:{index:indexPath,indexSha256:sha(index),logicalBytes:logical,blobOccurrences:occurrences,uniqueObjects:written.size}};
}
