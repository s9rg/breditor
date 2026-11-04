/** Explicit forensic DATA replay. The independently selected archive family
 * stays fixed; no actor factory, storage writer, host control or grant is supplied.
 * A flattened saved Blob cannot reproduce its original physical construction. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {PacketRasterFixtureImage} from './fixtures/local-metadata/packet-raster.mjs';

const args=process.argv.slice(2),fixtureRaster=args.length===4&&args[3]==='--fixture-raster';
if(args.length!==3&&!fixtureRaster)throw Error('Expected selection.json archive runtime-directory [--fixture-raster]');
const [selectionPath,archivePath,runtimeDirectory]=args,selection=JSON.parse(fs.readFileSync(selectionPath,'utf8'));
assert.equal(selection.format,'breditor/selected-room-current-selection');assert.equal(selection.formatVersion,1);
const stat=fs.statSync(archivePath);assert.ok(stat.isFile());assert.ok(stat.size>0&&stat.size<=128*1024*1024,'Diagnostic saved-input budget is 128 MiB; protocol limits are unchanged');
assert.equal(stat.size,selection.bytes);
const bytes=fs.readFileSync(archivePath),sha=value=>createHash('sha256').update(value).digest('hex');assert.equal(sha(bytes),selection.sha256);
const image=Object.getOwnPropertyDescriptor(globalThis,'Image'),fetch=globalThis.fetch;
if(fixtureRaster)Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
globalThis.fetch=(url,...options)=>{if(!String(url).startsWith('blob:'))throw Error('Forensic DATA replay forbids external requests');return fetch(url,...options);};
let loaded;
try{
 const runtimeBytes=fs.readFileSync(resolve(runtimeDirectory,'breditor_shared_bg.wasm'));
 const runtime=await import(pathToFileURL(resolve(runtimeDirectory,'breditor_shared.js')));await runtime.default({module_or_path:runtimeBytes});
 // Expose only the bounded digest capability, never the module's editor factories.
 loaded=await Loaded.read({selection,file:new Blob([bytes])},{wasm:{SharedArchiveDigest:runtime.SharedArchiveDigest},checkAuthority(){}});
 const fact=async(file)=>{const data=new Uint8Array(await file.arrayBuffer());assert.equal(data.byteLength,file.size,'Saved payload read must be complete');return{bytes:data.byteLength,mime:file.type,sha256:sha(data)};};
 const participants=[];
 for(const entry of loaded.nativeCut().root().participants){
  const inputs=[];for(const input of loaded.nativeCut().inputs(entry.id))inputs.push({role:input.role,...await fact(input.file)});
  const records=await loaded.records(entry.id);
  participants.push({id:entry.id,family:entry.family,catalog:await fact(loaded.participantFile(entry.id)),inputs,recordFields:Object.keys(records),parsedRecordsJsonBytes:Buffer.byteLength(JSON.stringify(records))});
 }
 assert.equal(sha(fs.readFileSync(archivePath)),selection.sha256,'Original saved input changed');
 console.log(JSON.stringify({format:'breditor/selected-current-data-probe',formatVersion:1,passed:true,selection,wasmSha256:sha(runtimeBytes),fixtureRaster,participants,actorFactoryProvided:false,storageWriterProvided:false,externalRequestsAllowed:false,originalInputUnchanged:true,physicalBlobConstructionRetained:false,scope:'Saved complete selected-current DATA, bounded native digests and original archive readers. Optional controlled packet-raster fixture is explicit. No native actor, editing, process recovery, physical raster/browser qualification or short-read repair.'},null,2));
}finally{
 loaded?.dispose();globalThis.fetch=fetch;
 if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;
}
