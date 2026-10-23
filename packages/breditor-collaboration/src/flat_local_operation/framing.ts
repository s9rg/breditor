/** Canonical data-only flat framing. The first input retains its original
 * whole-file SHA-256 rule. Later exact files are committed by canonical table
 * prefixes plus verified raw-payload hashes, not aggregate-file rehashes.
 * Native ancestry, uploads and namespace ownership require separate admission. */
import type {FlatLocalBody as Body,FlatLocalStateReference as Capture,FlatLocalEncoded as Encoded,FlatLocalPrefixRecipe as PrefixRecipe,FlatLocalPayload as Payload,FlatLocalRecipe as Recipe,FlatLocalSeedRecipe as SeedRecipe,FlatLocalManifestSelection as Selection,FlatLocalFramingState as State} from './contract.js';
import {MAX_FLAT_LOCAL_STATES,MAX_FLAT_LOCAL_HEADER_BYTES,MAX_FLAT_LOCAL_SEED_PREFIX_BYTES,MAX_FLAT_LOCAL_BYTES,MAX_FLAT_LOCAL_PAYLOAD_BYTES,MAX_FLAT_LOCAL_PAYLOADS} from './limits.js';
import {LOCAL_OPERATION_BACKUP_MIME} from '../independent_local_operation/portable_codec.js';
import {flatLocalFailure} from './failure.js';
const FORMAT='breditor/shared-flat-local-operation-backup' as const;
export const FLAT_LOCAL_MIME='application/vnd.breditor.flat-local-operation-backup';
const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export const FLAT_LOCAL_MAGIC=utf8.encode('BREDITOR-FLAT-LOCAL-OPERATION1\n');
export const FLAT_LOCAL_PREFIX_BYTES=FLAT_LOCAL_MAGIC.length+4;
const owners=new WeakMap<FlatLocalProvenance,State>(),key=Object.freeze({});
function fail():never{throw flatLocalFailure('flat_local_operation_framing');}
function integer(value:unknown,min:number,max:number):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;}
function hash(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function fields(value:unknown,keys:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.split(',').sort().join(','))fail();return value as Record<string,unknown>;}
function guard(provided:()=>void):()=>void{if(typeof provided!=='function')fail();return()=>{if(provided()!==undefined)fail();};}
function owned(owner:FlatLocalProvenance):State{return owners.get(owner)??fail();}
function item<T>(rows:readonly T[],index:number):T{return rows[index]??fail();}
function payloadKey(bytes:number,sha256:string):string{return JSON.stringify([bytes,sha256]);}
function body(payloads:readonly Payload[],recipes:readonly Recipe[],states:readonly Capture[]):Body{return{format:FORMAT,formatVersion:1,payloads,recipes,states,root:states.length-1};}
function prefixBody(state:State,recipe:PrefixRecipe):Body{return body(state.header.payloads.slice(0,recipe.payloads),state.header.recipes.slice(0,recipe.recipes),state.header.states.slice(0,recipe.states));}
function stateValue(encoded:Encoded,header:Body,blobs:readonly Blob[]):State{return{...encoded,header,blobs,recipeFiles:new Map(),payloadIndices:new Map(header.payloads.map((p,i)=>[payloadKey(p["bytes"],p["sha256"]),i]))};}
async function digest(blob:Blob,check:()=>void):Promise<string>{check();if(!(blob instanceof Blob)||blob.size>MAX_FLAT_LOCAL_PAYLOAD_BYTES)fail();const bytes=await blob.arrayBuffer();check();const value=await crypto.subtle.digest('SHA-256',bytes);check();return[...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function encode(header:Body,blobs:readonly Blob[],check:()=>void):Promise<Encoded>{
 check();const raw=JSON.stringify(header),canonical=utf8.encode(FORMAT+'\0'+raw);if(canonical.length>MAX_FLAT_LOCAL_HEADER_BYTES)fail();const manifestSha256=await digest(new Blob([canonical]),check),bytes=utf8.encode(JSON.stringify({...header,manifestSha256}));if(bytes.length>MAX_FLAT_LOCAL_HEADER_BYTES)fail();
 const prefix=new Uint8Array(FLAT_LOCAL_PREFIX_BYTES);prefix.set(FLAT_LOCAL_MAGIC);new DataView(prefix.buffer).setUint32(FLAT_LOCAL_MAGIC.length,bytes.length);const file=new Blob([prefix,bytes,...blobs],{type:FLAT_LOCAL_MIME});if(file.size>MAX_FLAT_LOCAL_BYTES)fail();check();return{file,manifestSha256};
}
/** Only immutable verified data is cached. Every read still invokes its current
 * guard; a cached file never supplies native ownership or permission. */
async function recipeFile(state:State,index:number,check:()=>void):Promise<Blob>{
 const recipe=item(state.header.recipes,index);check();const cached=state.recipeFiles.get(index);if(cached){check();return cached;}
 let file:Blob;
 if(recipe.kind==='snapshot'){file=new Blob([item(state.blobs,recipe.prefix),...recipe.parts.map(i=>item(state.blobs,i))],{type:recipe.mime});if(file.size!==recipe.bytes||await digest(file,check)!==recipe.sha256)fail();}
 else{const encoded=await encode(prefixBody(state,recipe),state.blobs.slice(0,recipe.payloads),check);file=encoded.file;if(file.size!==recipe.bytes||encoded.manifestSha256!==recipe.manifestSha256)fail();}
 check();state.recipeFiles.set(index,file);return file;
}
/** Bounded exact-field parsing precedes cloning. Serialized data never becomes
 * an owner, a caller adapter or a forward-reference to an unverified state. */
function parseHeader(input:unknown,selected:string,bodyBytes:number):Body{
 const h=fields(input,'format,formatVersion,payloads,recipes,states,root,manifestSha256');
 if(h["format"]!==FORMAT||h["formatVersion"]!==1||h["manifestSha256"]!==selected||!Array.isArray(h["payloads"])||!integer(h["payloads"].length,2,MAX_FLAT_LOCAL_PAYLOADS)||!Array.isArray(h["recipes"])||!integer(h["recipes"].length,1,MAX_FLAT_LOCAL_STATES)||!Array.isArray(h["states"])||h["states"].length!==h["recipes"].length||h["root"]!==h["states"].length-1)fail();
 const payloads:Payload[]=[],seen=new Set<string>();let offset=0;
 for(const raw of h["payloads"]){const p=fields(raw,'offset,bytes,sha256');if(p["offset"]!==offset||!integer(p["bytes"],1,MAX_FLAT_LOCAL_PAYLOAD_BYTES)||!hash(p["sha256"]))fail();const id=payloadKey(p["bytes"],p["sha256"]);if(seen.has(id))fail();seen.add(id);payloads.push({offset,bytes:p["bytes"],sha256:p["sha256"]});offset+=p["bytes"];if(offset>MAX_FLAT_LOCAL_BYTES)fail();}
 if(offset!==bodyBytes)fail();const recipes:Recipe[]=[],states:Capture[]=[],used=new Set<number>();
 const use=(value:unknown):number=>{if(!integer(value,0,payloads.length-1))fail();if(!used.has(value)){if(value!==used.size)fail();used.add(value);}return value;};
 for(let i=0;i<h["recipes"].length;i++){
  const raw:unknown=h["recipes"][i];let recipe:Recipe;
  if(i===0){const r=fields(raw,'kind,prefix,parts,mime,bytes,sha256');if(r["kind"]!=='snapshot'||r["prefix"]!==0||item(payloads,0).bytes>MAX_FLAT_LOCAL_SEED_PREFIX_BYTES||!Array.isArray(r["parts"])||!integer(r["parts"].length,1,MAX_FLAT_LOCAL_PAYLOADS-2)||r["mime"]!==LOCAL_OPERATION_BACKUP_MIME||!integer(r["bytes"],1,MAX_FLAT_LOCAL_PAYLOAD_BYTES)||!hash(r["sha256"]))fail();const prefix=use(r["prefix"]),parts=r["parts"].map(use);recipe={kind:'snapshot',prefix,parts,mime:r["mime"],bytes:r["bytes"],sha256:r["sha256"]};}
  else{const r=fields(raw,'kind,payloads,recipes,states,root,bytes,manifestSha256');if(r["kind"]!=='prefix'||r["payloads"]!==used.size||r["recipes"]!==i||r["states"]!==i||r["root"]!==i-1||!integer(r["bytes"],1,MAX_FLAT_LOCAL_BYTES)||!hash(r["manifestSha256"]))fail();recipe={kind:'prefix',payloads:used.size,recipes:i,states:i,root:i-1,bytes:r["bytes"],manifestSha256:r["manifestSha256"]};}
  recipes.push(recipe);const s=fields(h["states"][i],'input,additions,state');if(s["input"]!==i||!Array.isArray(s["additions"])||s["additions"].length>MAX_FLAT_LOCAL_PAYLOADS)fail();const additions=s["additions"].map(use),state=use(s["state"]);states.push({input:i,additions,state});
 }
 if(used.size!==payloads.length)fail();return body(payloads,recipes,states);
}
function builder(before?:State){
 const payloads:Payload[]=before?structuredClone([...before.header.payloads]):[],blobs:Blob[]=before?[...before.blobs]:[],indices=new Map(before?.payloadIndices);let bytes=blobs.reduce((sum,b)=>sum+b.size,0);
 return{payloads,blobs,async add(value:Blob,check:()=>void):Promise<number>{const blob=new Blob([value]),sha256=await digest(blob,check),id=payloadKey(blob.size,sha256),known=indices.get(id);if(known!==undefined)return known;if(payloads.length>=MAX_FLAT_LOCAL_PAYLOADS||bytes+blob.size>MAX_FLAT_LOCAL_BYTES)fail();const at=payloads.length;payloads.push({offset:bytes,bytes:blob.size,sha256});blobs.push(blob);indices.set(id,at);bytes+=blob.size;return at;}};
}
export class FlatLocalProvenance{
 readonly #constructorKey=key;
 private constructor(token:object,state:State){if(token!==this.#constructorKey)fail();owners.set(this,state);Object.freeze(this);}
 file():Blob{return owned(this).file;}
 selection():Selection{return{manifestSha256:owned(this).manifestSha256};}
 metadata():Body{return structuredClone(owned(this).header);}
 statePart(index=owned(this).header.root):Blob{const s=owned(this);if(!integer(index,0,s.header.states.length-1))fail();return item(s.blobs,item(s.header.states,index).state);}
 payload(sha256:string,bytes:number):Blob|undefined{const s=owned(this);if(!hash(sha256)||!integer(bytes,1,MAX_FLAT_LOCAL_PAYLOAD_BYTES))fail();const at=s.payloadIndices.get(payloadKey(bytes,sha256));return at===undefined?undefined:item(s.blobs,at);}
 async incomingFile(index=owned(this).header.root,provided:()=>void=()=>{}):Promise<Blob>{const s=owned(this),check=guard(provided);if(!integer(index,0,s.header.states.length-1))fail();const file=await recipeFile(s,index,check);check();if(owned(this)!==s)fail();return file;}
 incomingSelection(index:number):Selection{const s=owned(this);if(!integer(index,1,s.header.states.length-1))fail();const recipe=item(s.header.recipes,index);if(recipe.kind!=='prefix')fail();return{manifestSha256:recipe.manifestSha256};}
 dispose():void{owners.delete(this);}
 static async seed(prefix:Blob,parts:readonly Blob[],mime:string,initial:Blob,provided:()=>void=()=>{},extras:readonly Blob[]=[]):Promise<FlatLocalProvenance>{
  const check=guard(provided);if(this!==FlatLocalProvenance||!(prefix instanceof Blob)||prefix.size<1||prefix.size>MAX_FLAT_LOCAL_SEED_PREFIX_BYTES||!Array.isArray(parts)||parts.length<1||parts.length>MAX_FLAT_LOCAL_PAYLOADS-2||!Array.isArray(extras)||parts.length+extras.length>MAX_FLAT_LOCAL_PAYLOADS-2||mime!==LOCAL_OPERATION_BACKUP_MIME||!(initial instanceof Blob))fail();
  check();for(const p of[prefix,...parts,...extras,initial])if(!(p instanceof Blob)||p.size<1||p.size>MAX_FLAT_LOCAL_PAYLOAD_BYTES)fail();let seedBytes=prefix.size;for(const p of parts){seedBytes+=p.size;if(seedBytes>MAX_FLAT_LOCAL_PAYLOAD_BYTES)fail();}const table=builder(),prefixIndex=await table.add(prefix,check),partIndices:number[]=[];for(const p of parts)partIndices.push(await table.add(p,check));const input=new Blob([prefix,...parts],{type:mime});if(input.size>MAX_FLAT_LOCAL_PAYLOAD_BYTES)fail();
  const recipe:SeedRecipe={kind:'snapshot',prefix:prefixIndex,parts:partIndices,mime,bytes:input.size,sha256:await digest(input,check)},additions:number[]=[];for(const extra of extras)additions.push(await table.add(extra,check));const state=await table.add(initial,check),header=body(table.payloads,[recipe],[{input:0,additions,state}]),encoded=await encode(header,table.blobs,check);check();return new FlatLocalProvenance(key,stateValue(encoded,header,table.blobs));
 }
 static async append(owner:FlatLocalProvenance,next:Blob,provided:()=>void=()=>{},extras:readonly Blob[]=[]):Promise<FlatLocalProvenance>{
  const check=guard(provided);if(this!==FlatLocalProvenance||!(next instanceof Blob)||next.size<1||next.size>MAX_FLAT_LOCAL_PAYLOAD_BYTES||!Array.isArray(extras)||extras.length>MAX_FLAT_LOCAL_PAYLOADS)fail();for(const extra of extras)if(!(extra instanceof Blob)||extra.size<1||extra.size>MAX_FLAT_LOCAL_PAYLOAD_BYTES)fail();const old=owned(owner);check();if(old.header.states.length>=MAX_FLAT_LOCAL_STATES)fail();
  const table=builder(old),recipes=[...old.header.recipes],states=[...old.header.states];recipes.push({kind:'prefix',payloads:table.payloads.length,recipes:recipes.length,states:states.length,root:states.length-1,bytes:old.file.size,manifestSha256:old.manifestSha256});
  const additions:number[]=[];for(const extra of extras)additions.push(await table.add(extra,check));const state=await table.add(next,check);states.push({input:recipes.length-1,additions,state});const header=body(table.payloads,recipes,states),encoded=await encode(header,table.blobs,check);check();if(owned(owner)!==old)fail();return new FlatLocalProvenance(key,stateValue(encoded,header,table.blobs));
 }
 static async read(input:Blob,expected:Selection,provided:()=>void=()=>{}):Promise<FlatLocalProvenance>{
  const check=guard(provided),selection=fields(expected,'manifestSha256');if(this!==FlatLocalProvenance||!hash(selection["manifestSha256"])||!(input instanceof Blob)||input.size<FLAT_LOCAL_PREFIX_BYTES||input.size>MAX_FLAT_LOCAL_BYTES)fail();const selected=selection["manifestSha256"];check();
  const file=new Blob([input],{type:FLAT_LOCAL_MIME}),prefix=new Uint8Array(await file.slice(0,FLAT_LOCAL_PREFIX_BYTES).arrayBuffer());check();if(FLAT_LOCAL_MAGIC.some((b,i)=>b!==prefix[i]))fail();const length=new DataView(prefix.buffer).getUint32(FLAT_LOCAL_MAGIC.length),start=FLAT_LOCAL_PREFIX_BYTES+length;if(!integer(length,1,MAX_FLAT_LOCAL_HEADER_BYTES)||start>file.size)fail();
  const raw=decoder.decode(await file.slice(FLAT_LOCAL_PREFIX_BYTES,start).arrayBuffer());check();const parsed:unknown=JSON.parse(raw),header=parseHeader(parsed,selected,file.size-start),encoded=await encode(header,[],check);if(encoded.manifestSha256!==selected||JSON.stringify({...header,manifestSha256:selected})!==raw)fail();
  const blobs:Blob[]=[];for(const p of header.payloads){const blob=file.slice(start+p["offset"],start+p["offset"]+p["bytes"]);if(await digest(blob,check)!==p["sha256"])fail();blobs.push(blob);}const state=stateValue({file,manifestSha256:selected},header,blobs);for(let i=0;i<header.recipes.length;i++){await recipeFile(state,i,check);check();}return new FlatLocalProvenance(key,state);
 }
}
const p=FlatLocalProvenance.prototype;
export const flatLocalFraming=Object.freeze({read:FlatLocalProvenance.read,seed:FlatLocalProvenance.seed,append:FlatLocalProvenance.append,file:p.file,selection:p.selection,metadata:p.metadata,statePart:p.statePart,payload:p.payload,incomingFile:p.incomingFile,incomingSelection:p.incomingSelection,dispose:p.dispose});
