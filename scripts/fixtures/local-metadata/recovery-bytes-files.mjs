/** Fixture-only multi-file save/read-back. The public bundle remains ordinary
 * selected data; this manifest is not a controller or activation protocol. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function saveAndReloadRecoveryBytes(directory,bundle){
 const refs=bundle.recoverable.references,parts=[
  ['recovery-data-prepared.archive',refs.parent.parent.prepared.file],['recovery-data-current.archive',refs.parent.parent.current.file],['recovery-data-review.json',refs.parent.parent.delivery.file],['recovery-data-metadata.json',refs.parent.metadata.file],['recovery-data-references.json',refs.references.file],
  ['recovery-client-rasters.archive',bundle.recoverable.rasters.file],['recovery-selected-server.backup',bundle.server.file],['recovery-selected-inventory.json',bundle.inventory.file]
 ],names=new Map(),files=[],allowed=new Map();
 for(const [name,file]of parts){const bytes=Buffer.from(await file.arrayBuffer());writeFileSync(join(directory,name),bytes,{mode:0o600,flag:'wx'});const row={name,bytes:bytes.length,sha256:sha(bytes)};files.push(row);names.set(file,{name,type:file.type});allowed.set(name,row);}
 const manifest=Buffer.from(JSON.stringify(bundle,(_key,value)=>{if(value instanceof Blob){const selected=names.get(value);assert.ok(selected,'Every bundle Blob must be saved in its own explicit role');return{$fixtureBlob:selected.name,type:selected.type};}return value;}));
 writeFileSync(join(directory,'recovery-bytes-files.json'),manifest,{mode:0o600,flag:'wx'});files.push({name:'recovery-bytes-files.json',bytes:manifest.length,sha256:sha(manifest)});
 const reloaded=JSON.parse(readFileSync(join(directory,'recovery-bytes-files.json'),'utf8'),(_key,value)=>{if(value&&typeof value==='object'&&Object.hasOwn(value,'$fixtureBlob')){assert.deepEqual(Object.keys(value),['$fixtureBlob','type']);const expected=allowed.get(value.$fixtureBlob);assert.ok(expected);const bytes=readFileSync(join(directory,expected.name));assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256);return new Blob([bytes],{type:value.type});}return value;});
 assert.notEqual(reloaded.server.file,bundle.server.file);assert.notEqual(reloaded.recoverable.references.parent.metadata.file,bundle.recoverable.references.parent.metadata.file);
 return{bundle:reloaded,files};
}
