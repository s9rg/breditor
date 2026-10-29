/** Lossless closed IndexedDB value algebra. Snapshot every descriptor and
 * byte buffer synchronously BEFORE awaiting a blob hash or host callback.
 * Graph IDs preserve aliases/cycles; undefined, -0, dates, files and binary
 * views cannot disappear through JSON.stringify. No executable object is read. */
import {recordCutJson} from '../physical_room_record_cut/json.js';
import {fields,integer,rows,fail,MAX_STORAGE_GRAPH_BYTES,MAX_STORAGE_NODES} from './policy.js';
export interface StorageValueGraph{readonly format:'breditor/storage-value-graph';readonly formatVersion:1;readonly root:number;readonly nodes:readonly (readonly unknown[])[]}
export interface StorageBytePool{add(file:Blob):Promise<number>;get(id:number):Blob}
const arraySlice=ArrayBuffer.prototype.slice,blobSlice=Blob.prototype.slice,blobArrayBuffer=Blob.prototype.arrayBuffer,dateTime=Date.prototype.getTime;
const blobSize=Object.getOwnPropertyDescriptor(Blob.prototype,'size')!.get!,blobType=Object.getOwnPropertyDescriptor(Blob.prototype,'type')!.get!;
const typedBase=Object.getPrototypeOf(Uint8Array.prototype) as object,viewBuffer=Object.getOwnPropertyDescriptor(typedBase,'buffer')!.get!,viewOffset=Object.getOwnPropertyDescriptor(typedBase,'byteOffset')!.get!,viewLength=Object.getOwnPropertyDescriptor(typedBase,'byteLength')!.get!;
const dataBuffer=Object.getOwnPropertyDescriptor(DataView.prototype,'buffer')!.get!,dataOffset=Object.getOwnPropertyDescriptor(DataView.prototype,'byteOffset')!.get!,dataLength=Object.getOwnPropertyDescriptor(DataView.prototype,'byteLength')!.get!;
const views={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,DataView} as const;
/** Node exposes implementation-owned Blob/File symbols. Browser instances
 * ordinarily expose none. Only symbols from genuine empty native instances
 * are intrinsic slots; a same-description user symbol is still extra data. */
const resizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const blobSlots=new Set(Reflect.ownKeys(new Blob()).filter(key=>typeof key==='symbol'));
const fileSlots=typeof File==='function'?new Set(Reflect.ownKeys(new File([],'' )).filter(key=>typeof key==='symbol')):blobSlots;
function noExtraProperties(value:object,slots:ReadonlySet<PropertyKey>=new Set(),elements=0):void{
 for(const key of Reflect.ownKeys(value)){
  if(slots.has(key))continue;
  if(typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<elements)continue;
  throw fail('room_storage_value');
 }
}
const tuple=(value:unknown)=>rows(value,MAX_STORAGE_NODES),numeric=(value:number)=>Object.is(value,-0)?'-0':String(value);
function readNumber(value:unknown):number{if(typeof value!=='string')throw fail();const n=value==='-0'?-0:Number(value);if(numeric(n)!==value)throw fail();return n;}
function entries(value:object,skipLength=false){const result:readonly [string,unknown][]=[];const out=result as [string,unknown][];for(const key of Reflect.ownKeys(value)){if(skipLength&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d?.enumerable||!('value'in d))throw fail('room_storage_value');out.push([key,d.value]);}return out;}
export async function encodeStorageValue(value:unknown,pool:Pick<StorageBytePool,'add'>):Promise<StorageValueGraph>{
 const nodes:unknown[][]=[],seen=new WeakMap<object,number>(),leaves:{node:number;position:number;file:Blob}[]=[];
 const put=(v:unknown,depth:number):number=>{if(v&&typeof v==='object'){const old=seen.get(v);if(old!==undefined)return old;}if(depth>64||nodes.length>=MAX_STORAGE_NODES)throw fail('room_storage_budget');const id=nodes.length;nodes.push([]);if(v&&typeof v==='object')seen.set(v,id);const set=(...node:unknown[])=>{nodes[id]=node;return id;};
  if(v===null)return set('null');if(v===undefined)return set('undefined');if(typeof v==='string')return set('string',v);if(typeof v==='boolean')return set('boolean',v);if(typeof v==='number')return set('number',numeric(v));if(typeof v==='bigint')return set('bigint',String(v));if(typeof v!=='object')throw fail('room_storage_value');
  if(v instanceof Blob){const isFile=typeof File==='function'&&Object.getPrototypeOf(v)===File.prototype;if(Object.getPrototypeOf(v)!==Blob.prototype&&!isFile)throw fail('room_storage_value');noExtraProperties(v,isFile?fileSlots:blobSlots);const type=blobType.call(v) as string,size=blobSize.call(v) as number,file=blobSlice.call(v,0,size);if(isFile){const name=Object.getOwnPropertyDescriptor(File.prototype,'name')!.get!.call(v) as string,last=Object.getOwnPropertyDescriptor(File.prototype,'lastModified')!.get!.call(v) as number;set('file',-1,type,name,numeric(last));}else set('blob',-1,type);leaves.push({node:id,position:1,file});return id;}
  if(Object.getPrototypeOf(v)===ArrayBuffer.prototype){noExtraProperties(v);if(resizable?.call(v))throw fail('room_storage_value');set('buffer',-1);leaves.push({node:id,position:1,file:new Blob([arraySlice.call(v,0)])});return id;}
  if(ArrayBuffer.isView(v)){const kind=Object.entries(views).find(([,ctor])=>Object.getPrototypeOf(v)===ctor.prototype)?.[0];if(!kind)throw fail('room_storage_value');const data=kind==='DataView',buffer=(data?dataBuffer:viewBuffer).call(v) as ArrayBuffer,offset=(data?dataOffset:viewOffset).call(v) as number,length=(data?dataLength:viewLength).call(v) as number;noExtraProperties(v,undefined,data?0:length/(views[kind as keyof typeof views] as typeof Uint8Array).BYTES_PER_ELEMENT);return set('view',kind,put(buffer,depth+1),offset,length);}
  if(Object.getPrototypeOf(v)===Date.prototype){noExtraProperties(v);return set('date',numeric(dateTime.call(v)));}
  if(Object.getPrototypeOf(v)===Map.prototype){noExtraProperties(v);const pairs=[...Map.prototype.entries.call(v) as MapIterator<[unknown,unknown]>].map(([k,item])=>[put(k,depth+1),put(item,depth+1)]);return set('map',pairs);}
  if(Object.getPrototypeOf(v)===Set.prototype){noExtraProperties(v);return set('set',[...Set.prototype.values.call(v) as SetIterator<unknown>].map(item=>put(item,depth+1)));}
  if(Array.isArray(v)){if(Object.getPrototypeOf(v)!==Array.prototype)throw fail('room_storage_value');return set('array',integer(v.length,MAX_STORAGE_NODES),entries(v,true).map(([key,item])=>[key,put(item,depth+1)]));}
  const proto=Object.getPrototypeOf(v);if(proto!==null&&proto!==Object.prototype)throw fail('room_storage_value');return set('object',proto===null?'null':'object',entries(v).map(([key,item])=>[key,put(item,depth+1)]));
 };
 const root=put(value,0);for(const leaf of leaves)nodes[leaf.node]![leaf.position]=await pool.add(leaf.file);const result:StorageValueGraph={format:'breditor/storage-value-graph',formatVersion:1,root,nodes};recordCutJson(result,MAX_STORAGE_GRAPH_BYTES);return result;
}
export async function decodeStorageValue(input:unknown,pool:Pick<StorageBytePool,'get'>):Promise<unknown>{
 const r=fields(input,['format','formatVersion','root','nodes']);if(r['format']!=='breditor/storage-value-graph'||r['formatVersion']!==1)throw fail();const nodes=rows(r['nodes'],MAX_STORAGE_NODES).map(tuple);if(!nodes.length)throw fail();const ref=(v:unknown)=>integer(v,nodes.length-1),root=ref(r['root']),values:unknown[]=new Array(nodes.length),edges:number[][]=nodes.map(()=>[]);
 const text=(v:unknown)=>{if(typeof v!=='string')throw fail();return v;},piece=(v:unknown)=>pool.get(integer(v,65535));
 const shape=(node:unknown[],length:number)=>{if(node.length!==length)throw fail();};
 for(let id=0;id<nodes.length;id++){const n=nodes[id]!,tag=n[0];switch(tag){
  case'null':case'undefined':shape(n,1);values[id]=tag==='null'?null:undefined;break;
  case'string':shape(n,2);values[id]=text(n[1]);break;case'boolean':shape(n,2);if(typeof n[1]!=='boolean')throw fail();values[id]=n[1];break;
  case'number':shape(n,2);values[id]=readNumber(n[1]);break;case'bigint':shape(n,2);try{values[id]=BigInt(text(n[1]));if(String(values[id])!==n[1])throw fail();}catch{throw fail();}break;
  case'date':shape(n,2);values[id]=new Date(readNumber(n[1]));if(numeric(dateTime.call(values[id]))!==n[1])throw fail();break;
  case'buffer':shape(n,2);values[id]=await blobArrayBuffer.call(piece(n[1]));break;
  case'blob':shape(n,3);values[id]=new Blob([piece(n[1])],{type:text(n[2])});if(blobType.call(values[id])!==n[2])throw fail();break;
  case'file':shape(n,5);if(typeof File!=='function')throw fail('room_storage_file_unavailable');values[id]=new File([piece(n[1])],text(n[3]),{type:text(n[2]),lastModified:readNumber(n[4])});if((values[id] as File).name!==n[3]||(values[id] as File).lastModified!==readNumber(n[4])||blobType.call(values[id])!==n[2])throw fail();break;
  case'array':shape(n,3);values[id]=new Array(integer(n[1],MAX_STORAGE_NODES));break;
  case'object':shape(n,3);if(n[1]!=='null'&&n[1]!=='object')throw fail();values[id]=n[1]==='null'?Object.create(null):{};break;
  case'map':case'set':shape(n,2);values[id]=tag==='map'?new Map():new Set();break;
  case'view':shape(n,5);edges[id]!.push(ref(n[2]));break;
  default:throw fail('room_storage_value');
 }}
 for(let id=0;id<nodes.length;id++){const n=nodes[id]!;if(n[0]!=='view')continue;const kind=text(n[1]);if(!Object.hasOwn(views,kind)||nodes[ref(n[2])]![0]!=='buffer')throw fail();const bytes=values[ref(n[2])] as ArrayBuffer,offset=integer(n[3],bytes.byteLength),length=integer(n[4],bytes.byteLength-offset);try{const ctor=views[kind as keyof typeof views];values[id]=kind==='DataView'?new DataView(bytes,offset,length):new (ctor as typeof Uint8Array)(bytes,offset,length/(ctor as typeof Uint8Array).BYTES_PER_ELEMENT);if((values[id] as ArrayBufferView).byteLength!==length)throw fail();}catch{throw fail();}}
 for(let id=0;id<nodes.length;id++){const n=nodes[id]!,tag=n[0],to=(v:unknown)=>{const i=ref(v);edges[id]!.push(i);return values[i];};
  if(tag==='array'||tag==='object'){const pairs=rows(n[2],MAX_STORAGE_NODES),used=new Set<string>();for(const raw of pairs){const p=tuple(raw);shape(p,2);const key=text(p[0]);if(used.has(key)||tag==='array'&&(key==='length'||/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<4294967295&&Number(key)>=Number(n[1])))throw fail();used.add(key);Object.defineProperty(values[id],key,{value:to(p[1]),writable:true,enumerable:true,configurable:true});}}
  if(tag==='map'){for(const raw of rows(n[1],MAX_STORAGE_NODES)){const p=tuple(raw);shape(p,2);const map=values[id] as Map<unknown,unknown>,key=to(p[0]);if(map.has(key))throw fail();map.set(key,to(p[1]));}}
  if(tag==='set'){for(const raw of rows(n[1],MAX_STORAGE_NODES)){const set=values[id] as Set<unknown>,value=to(raw);if(set.has(value))throw fail();set.add(value);}}
 }
 const reached=new Set<number>(),visit=(id:number,depth:number)=>{if(reached.has(id))return;if(depth>64)throw fail('room_storage_budget');reached.add(id);for(const edge of edges[id]!)visit(edge,depth+1);};visit(root,0);if(reached.size!==nodes.length)throw fail();return values[root];
}
