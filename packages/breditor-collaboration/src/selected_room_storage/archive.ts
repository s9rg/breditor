/** Portable contiguous typed storage archive with complete nested room data.
 * Whole-file and every binary leaf are independently hashed. Data admission
 * never supplies native custody or permission to edit/connect/activate. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';import {archiveBlob} from '../archive_integrity/policy.js';import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {recordCutJson,parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {detachLocalReviewBundle} from '../selected_local_review_delivery/bundle.js';import {readVerifiedArchiveHeader} from '../archive_integrity/verified_header.js';
import {readStorageReview,readVerifiedStorageText} from './verified_json.js';
import {selectedStoragePlans} from './plans.js';import {storageDatabase} from './database_shape.js';import {encodeStorageValue,decodeStorageValue,type StorageBytePool} from './value_graph.js';
import {fields,rows,integer,hash,fail,MAX_STORAGE_ARCHIVE_BYTES,MAX_STORAGE_GRAPH_BYTES,MAX_STORAGE_HEADER_BYTES,MAX_STORAGE_PIECES,MAX_STORAGE_DATABASES} from './policy.js';
import type {StorageContent,StorageFile,StorageSelection,StorageDatabasePlan} from './contract.js';
const magic='BREDITOR-SELECTED-STORAGE1\n',prefixBytes=magic.length+4,slice=Blob.prototype.slice,key=Object.freeze({});
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,abort=AbortController.prototype.abort;
export function storageSelection(input:unknown):StorageSelection{const r=fields(input,['format','formatVersion','bytes','sha256']);if(r['format']!=='breditor/selected-room-storage-selection'||r['formatVersion']!==1)throw fail();return Object.freeze({format:r['format'],formatVersion:1,bytes:integer(r['bytes'],MAX_STORAGE_ARCHIVE_BYTES,1),sha256:hash(r['sha256'])});}
async function content(input:unknown,options:SharedArchiveIntegrityOptions){
 const r=fields(input,['format','formatVersion','current','localReview','databases']);
 if(r['format']!=='breditor/selected-room-storage-content'||r['formatVersion']!==1)throw fail();
 const c=fields(r['current'],['selection','file']);
 const current=Object.freeze({selection:selectedRoomCurrentSelection(c['selection']),file:archiveBlob(c['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)});
 const localReview=r['localReview']===null?null:detachLocalReviewBundle(r['localReview']);
 const review=localReview?await readStorageReview(localReview,prepareArchiveIntegrity(options)):null;
 const reviewNames=localReview&&review?{intent:localReview.prepared.choice.database,state:review.choice.database}:null;
 const plans=await selectedStoragePlans(current,reviewNames,options),raw=rows(r['databases'],MAX_STORAGE_DATABASES);
 if(raw.length!==plans.length)throw fail();
 const databases=raw.map((value,i)=>storageDatabase(value,plans[i]!));
 options.checkAuthority();
 return {data:{format:'breditor/selected-room-storage-content' as const,formatVersion:1 as const,current,localReview,databases},plans};
}
interface StoragePiece {
 readonly file:Blob;
 readonly sha256:string;
}

/** A typed buffer is mutable once returned. Materialize a fresh copy directly
 * from the verified bytes, including on later reads of an already-open archive. */
function storagePool(
 pieces:readonly StoragePiece[],
 integrity:ArchiveIntegrityContext,
 used?:Set<number>,
 verified?:Set<number>,
):Pick<StorageBytePool,'get'|'readBuffer'>{
 const select=(id:number)=>{
  integrity.guard();
  const piece=pieces[id];
  if(!piece)throw fail();
  used?.add(id);
  return piece;
 };
 return {
  get:id=>select(id).file,
  async readBuffer(id){
   const piece=select(id);
   const {bytes,sha256}=await integrity.readAndDigest(piece.file,MAX_STORAGE_ARCHIVE_BYTES);
   if(sha256!==piece.sha256)throw fail();
   verified?.add(id);
   return bytes.buffer;
  },
 };
}
interface StorageArchiveLifetime {
 check():void;
 watchClosing(cancel:()=>void):()=>void;
}
interface StorageArchiveOwner extends StorageArchiveLifetime {
 read():Promise<{data:StorageContent;plans:readonly StorageDatabasePlan[]}>;
}
const owners=new WeakMap<SelectedRoomStorageArchive,StorageArchiveOwner>();
function storageArchiveOwner(archive:SelectedRoomStorageArchive):StorageArchiveOwner{
 const owner=owners.get(archive);
 if(!owner)throw fail('room_storage_policy');
 return owner;
}
/** Keep a genuine archive's runtime checks through destination approval and writes. */
export function selectedRoomStorageLifetime(archive:SelectedRoomStorageArchive):StorageArchiveLifetime{
 return storageArchiveOwner(archive);
}
/** Each read decodes a fresh graph from the private archive bytes. */
export function selectedRoomStorageData(archive:SelectedRoomStorageArchive){
 const owner=storageArchiveOwner(archive);
 owner.check();
 return owner.read();
}
export class SelectedRoomStorageArchive{
 readonly #selection;readonly #lifetime=new AbortController();#file:Blob|undefined;#options:SharedArchiveIntegrityOptions|undefined;#graph:string|undefined;#pieces:readonly StoragePiece[]|undefined;#closed=false;
 private constructor(token:object,file:Blob,selection:StorageSelection,graph:string,pieces:readonly StoragePiece[],options:SharedArchiveIntegrityOptions){
  if(token!==key)throw fail('room_storage_policy');
  this.#selection=selection;this.#file=file;this.#graph=graph;this.#pieces=pieces;this.#options={...options};
  owners.set(this,Object.freeze({
   check:()=>this.#check(),
   watchClosing:(cancel:()=>void)=>this.#watchClosing(cancel),
   read:async()=>{
   this.#check();
   const scoped={...this.#options!,checkAuthority:()=>this.#check()},integrity=prepareArchiveIntegrity(scoped);
   const graph=parseRecordCutJson(this.#graph!,MAX_STORAGE_GRAPH_BYTES);
   const value=await decodeStorageValue(graph,storagePool(this.#pieces!,integrity));
   this.#check();
   const result=await content(value,scoped);
   this.#check();
   return result;
  }}));
  Object.freeze(this);
 }
 #check(){if(this.#closed)throw fail('room_storage_closed');if(this.#options!.signal?.aborted)throw fail('room_storage_aborted');this.#options!.checkAuthority();if(this.#closed)throw fail('room_storage_closed');if(this.#options!.signal?.aborted)throw fail('room_storage_aborted');}
 #watchClosing(cancel:()=>void):()=>void{
  this.#check();
  const closed=this.#lifetime.signal,external=this.#options!.signal;
  add.call(closed,'abort',cancel,{once:true});
  try{if(external)add.call(external,'abort',cancel,{once:true});}
  catch(error){remove.call(closed,'abort',cancel);throw error;}
  if(closed.aborted||external?.aborted)cancel();
  return ()=>{
   remove.call(closed,'abort',cancel);
   if(external)remove.call(external,'abort',cancel);
  };
 }
 selection():StorageSelection{return this.#selection;}
 file():Blob{this.#check();return this.#file!;}
 dispose():void{
  if(this.#closed)return;
  this.#closed=true;
  owners.delete(this);
  this.#file=undefined;this.#options=undefined;this.#graph=undefined;this.#pieces=undefined;
  abort.call(this.#lifetime);
 }
 static async read(input:Blob,expected:StorageSelection,options:SharedArchiveIntegrityOptions):Promise<SelectedRoomStorageArchive>{
  const selection=storageSelection(expected),file=archiveBlob(input,MAX_STORAGE_ARCHIVE_BYTES),context=prepareArchiveIntegrity(options);
  if(file.size!==selection.bytes)throw fail();
  const {text,offset:bodyOffset}=await readVerifiedArchiveHeader(file,selection.sha256,context,{
   magic,maximumHeaderBytes:MAX_STORAGE_HEADER_BYTES,invalid:fail,diverged:fail,budget:()=>fail('room_storage_budget'),
  });
  const header=fields(parseRecordCutJson(text,MAX_STORAGE_HEADER_BYTES),['format','formatVersion','graph','pieces']);
  if(header['format']!=='breditor/selected-room-storage'||header['formatVersion']!==1)throw fail();
  const declarations=rows(header['pieces'],MAX_STORAGE_PIECES),pieces:StoragePiece[]=[];
  const graphId=integer(header['graph'],declarations.length-1);
  let offset=bodyOffset,graphText:string|undefined;
  for(const [index,raw] of declarations.entries()){
   const r=fields(raw,['bytes','sha256']),bytes=integer(r['bytes'],MAX_STORAGE_ARCHIVE_BYTES),sha256=hash(r['sha256']);
   if(offset+bytes>file.size)throw fail();
   const part=slice.call(file,offset,offset+bytes);
   if(index===graphId)graphText=await readVerifiedStorageText(part,sha256,MAX_STORAGE_GRAPH_BYTES,context);
   pieces.push({file:part,sha256});
   offset+=bytes;
  }
  if(offset!==file.size||graphText===undefined)throw fail();
  const used=new Set([graphId]),verified=new Set([graphId]),graph=parseRecordCutJson(graphText,MAX_STORAGE_GRAPH_BYTES);
  const data=await decodeStorageValue(graph,storagePool(pieces,context,used,verified));
  if(used.size!==pieces.length)throw fail();
  for(const [id,piece] of pieces.entries()){
   if(!verified.has(id)&&await context.digest(piece.file)!==piece.sha256)throw fail();
  }
  await content(data,options);
  context.guard();
  return new SelectedRoomStorageArchive(key,file,selection,graphText,pieces,options);
 }
}
/** Trusted capture composition supplies real selected records; this helper
 * produces DATA and read-admits the exact emitted complete file before return. */
export async function encodeSelectedRoomStorage(input:StorageContent,options:SharedArchiveIntegrityOptions):Promise<StorageFile>{const context=prepareArchiveIntegrity(options),selected=await content(input,options),pieces:Blob[]=[],declarations:{bytes:number;sha256:string}[]=[],ids=new Map<string,number>();let bytes=0;const add=async(file:Blob)=>{context.guard();const sha256=await context.digest(file),id=JSON.stringify([file.size,sha256]),old=ids.get(id);if(old!==undefined)return old;if(pieces.length>=MAX_STORAGE_PIECES||bytes+file.size>MAX_STORAGE_ARCHIVE_BYTES)throw fail('room_storage_budget');const index=pieces.length;ids.set(id,index);pieces.push(file);declarations.push({bytes:file.size,sha256});bytes+=file.size;return index;};const graph=await encodeStorageValue(selected.data,{add}),graphText=recordCutJson(graph,MAX_STORAGE_GRAPH_BYTES),graphId=await add(new Blob([graphText])),header=recordCutJson({format:'breditor/selected-room-storage',formatVersion:1,graph:graphId,pieces:declarations},MAX_STORAGE_HEADER_BYTES),encoded=new TextEncoder().encode(header),prefix=new Uint8Array(prefixBytes);prefix.set(new TextEncoder().encode(magic));new DataView(prefix.buffer).setUint32(magic.length,encoded.length,true);const file=new Blob([prefix,encoded,...pieces],{type:'application/vnd.breditor.selected-room-storage'});if(file.size>MAX_STORAGE_ARCHIVE_BYTES)throw fail('room_storage_budget');const selection=storageSelection({format:'breditor/selected-room-storage-selection',formatVersion:1,bytes:file.size,sha256:await context.digest(file)}),verified=await SelectedRoomStorageArchive.read(file,selection,options);verified.dispose();context.guard();return Object.freeze({selection,file});}
