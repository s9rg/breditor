/** Genuine flat recovery ancestry. Exact incoming files remain reconstructible while common
 * native files, original archives and raster bytes occupy one shared literal part each.
 * This is a data archive, never a restored source, upload owner or authority grant. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {IndependentOperationBackup,portableOperationArchive as snapshot} from './portable_backup.js';
import type {IndependentOperationBackupSelection} from './portable_contract.js';
import {operationBackupSelection} from './portable_identity.js';
import {portableReadPolicy,type IndependentOperationReadOptions} from './portable_policy.js';
import {portableCutRecovery} from './portable_cut.js';
import {replayPortableRecovery,verifyPortableContinuation} from './portable_replay.js';
import {MAX_OPERATION_BACKUP_HEADER_BYTES} from './portable_codec.js';
import {captureLineageSnapshot,readLineageSnapshot} from './lineage_snapshot.js';
import {OPERATION_LINEAGE_MAGIC,OPERATION_LINEAGE_PREFIX_BYTES,OPERATION_LINEAGE_MIME,MAX_OPERATION_LINEAGE_BYTES,MAX_OPERATION_LINEAGE_PARTS,lineageNodeDigest,lineageChain,readLineageHeader,encodeOperationLineage} from './lineage_codec.js';
import type {OperationLineageHeader,OperationLineageNode,OperationLineageNodeBody,OperationLineageState,OperationLineageReference} from './lineage_contract.js';
import {operationJournalFailure as fail} from './journal_failure.js';
interface State {file:Blob;selection:IndependentOperationBackupSelection;header:OperationLineageHeader;payloads:ReadonlyMap<string,Blob>;latest:IndependentOperationBackup;limits:ReturnType<typeof portableReadPolicy>['options']['limits']}
const key=Object.freeze({}),states=new WeakMap<IndependentOperationLineageBackup,State>(),state=(owner:IndependentOperationLineageBackup)=>{const s=states.get(owner);if(!s)throw fail('independent_operation_lineage_closed');return s;};
const missing=()=>{throw fail('independent_operation_lineage_factory');};
function conserveUploads(before:ReturnType<IndependentOperationBackup['uploadEntries']>,after:ReturnType<IndependentOperationBackup['uploadEntries']>):void{
 const next=new Map(after.map(r=>[r.asset,r]));for(const old of before){const now=next.get(old.asset);if(!now||now.mime!==old.mime||now.bytes!==old.bytes||now.width!==old.width||now.height!==old.height||now.epoch<old.epoch||now.attempts<old.attempts||old.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==old.storageRef))throw fail('independent_operation_lineage_uploads');}
}
/** Exact reachable state/link subset for reconstructing an earlier graph file. */
function subset(header:OperationLineageHeader,root:string){
 const map=new Map(header.nodes.map(n=>[n.manifestSha256,n])),nodes:OperationLineageNode[]=[],wanted=new Set<string>();let ref:OperationLineageReference={kind:'lineage',manifestSha256:root};while(ref.kind==='lineage'){const n=map.get(ref.manifestSha256);if(!n||nodes.includes(n))throw fail('independent_operation_lineage_closure');nodes.push(n);wanted.add(n.snapshot);ref=n.previous;}wanted.add(ref.manifestSha256);return{nodes,states:header.states.filter(s=>wanted.has(s.manifestSha256))};
}
export class IndependentOperationLineageBackup {
 private constructor(token:object,value:State){if(token!==key)throw fail();states.set(this,value);Object.freeze(this);}
 selection():IndependentOperationBackupSelection{return structuredClone(state(this).selection);}
 file():Blob{return state(this).file;}
 metadata():OperationLineageHeader{return structuredClone(state(this).header);}
 originalFile():Blob{return snapshot.originalFile.call(state(this).latest);}
 currentCut(){return snapshot.current.call(state(this).latest);}
 pendingCut(){return snapshot.pending.call(state(this).latest);}
 liveSource(){return snapshot.live.call(state(this).latest);}
 uploadBackup():Blob{return snapshot.uploads.call(state(this).latest);}
 uploadEntries(){return snapshot.entries.call(state(this).latest);}
 /** Immediate immutable restore input, byte for byte. Not a source-owner transfer. */
 async inputFile():Promise<Blob>{
  const s=state(this),check=()=>{if(state(this)!==s)throw fail();},root=s.header.nodes.find(n=>n.manifestSha256===s.header.root)!,previous=root.previous;
  if(previous.kind==='snapshot'){const entry=s.header.states.find(v=>v.manifestSha256===previous.manifestSha256)!;return(await readLineageSnapshot(entry,s.payloads,s.selection.original,s.limits,check)).file;}
  const selected=subset(s.header,previous.manifestSha256),payloads=new Map<string,Blob>();for(const entry of selected.states){const view=await readLineageSnapshot(entry,s.payloads,s.selection.original,s.limits,check);for(const hash of view.used)payloads.set(hash,s.payloads.get(hash)!);}check();return(await encodeOperationLineage(previous.manifestSha256,selected.states,selected.nodes,payloads,check)).file;
 }
 /** Exact predecessor raster lookup; older pending-only pixels are not inferred from the AST. */
 async blob(asset:string,generation:string):Promise<Blob|undefined>{
  const s=state(this),check=()=>{if(state(this)!==s)throw fail();};for(const step of [...lineageChain(s.header)].reverse()){const entry=s.header.states.find(v=>v.manifestSha256===step.state)!,view=await readLineageSnapshot(entry,s.payloads,s.selection.original,s.limits,check),binding=view.header.bindings.find(r=>r.asset===asset&&r.generation===generation);if(binding){const data=view.header.assets.find(r=>r.contentAsset===binding.contentAsset)!;check();return new Blob([s.payloads.get(view.header.parts[data.part]!.sha256)!],{type:data.mime});}}check();return undefined;
 }
 dispose():void{const s=states.get(this);if(!s)return;states.delete(this);snapshot.dispose.call(s.latest);Map.prototype.clear.call(s.payloads);}
 static async append<P extends SharedSelectionPolicy>(input:IndependentOperationBackup|IndependentOperationLineageBackup,latest:IndependentOperationBackup,options:IndependentOperationReadOptions<P>):Promise<IndependentOperationLineageBackup>{
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['session','checkAuthority','signal','limits'].includes(k)))throw fail('independent_operation_lineage_policy');
  const inherited=states.get(input as IndependentOperationLineageBackup);if(!inherited&&!snapshot.owns(input)||!snapshot.owns(latest))throw fail('independent_operation_lineage_source');const first=inherited?.selection??snapshot.selection.call(input as IndependentOperationBackup),policy=portableReadPolicy(first.original,options),check=policy.guard;check();const nextSelection=snapshot.selection.call(latest);if(JSON.stringify(nextSelection.original)!==JSON.stringify(first.original))throw fail('independent_operation_lineage_selection');
  const entries=new Map<string,OperationLineageState>(),nodes=new Map<string,OperationLineageNode>(),payloads=new Map<string,Blob>();let previous:OperationLineageReference;
  if(inherited){for(const row of inherited.header.states)entries.set(row.manifestSha256,row);for(const row of inherited.header.nodes)nodes.set(row.manifestSha256,row);for(const[hash,blob]of inherited.payloads)payloads.set(hash,blob);previous={kind:'lineage',manifestSha256:inherited.selection.manifestSha256};}
  else{const selected=await captureLineageSnapshot(input as IndependentOperationBackup,check);entries.set(selected.state.manifestSha256,selected.state);for(const[hash,blob]of selected.payloads)payloads.set(hash,blob);previous={kind:'snapshot',manifestSha256:selected.selection.manifestSha256};}
  const newest=await captureLineageSnapshot(latest,check);entries.set(newest.state.manifestSha256,newest.state);for(const[hash,blob]of newest.payloads){const old=payloads.get(hash);if(old&&old.size!==blob.size)throw fail('independent_operation_lineage_integrity');payloads.set(hash,blob);}const body:OperationLineageNodeBody={format:'breditor/shared-independent-operation-lineage-node',formatVersion:1,previous,snapshot:newest.selection.manifestSha256},manifestSha256=await lineageNodeDigest(body);check();nodes.set(manifestSha256,{...body,manifestSha256});const encoded=await encodeOperationLineage(manifestSha256,[...entries.values()],[...nodes.values()],payloads,check);check();return readLineage.call(IndependentOperationLineageBackup,encoded.file,{original:first.original,manifestSha256},{session:policy.options.session,checkAuthority:policy.guard,limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});
 }
 static async read<P extends SharedSelectionPolicy>(input:Blob,expected:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>):Promise<IndependentOperationLineageBackup>{
  try{return await IndependentOperationLineageBackup.#read(input,expected,options);}catch(error){if(error instanceof SyntaxError)throw fail('independent_operation_lineage_format');throw error;}
 }
 static async #read<P extends SharedSelectionPolicy>(input:Blob,expected:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>):Promise<IndependentOperationLineageBackup>{
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['session','checkAuthority','signal','limits'].includes(k)))throw fail('independent_operation_lineage_policy');
  const selected=operationBackupSelection(expected),policy=portableReadPolicy(selected.original,options),check=policy.guard;
  check();if(!(input instanceof Blob)||input.size<OPERATION_LINEAGE_PREFIX_BYTES||input.size>MAX_OPERATION_LINEAGE_BYTES)throw fail('independent_operation_lineage_budget');
  const file=new Blob([input],{type:OPERATION_LINEAGE_MIME}),prefix=new Uint8Array(await file.slice(0,OPERATION_LINEAGE_PREFIX_BYTES).arrayBuffer());check();
  if(OPERATION_LINEAGE_MAGIC.some((v,i)=>prefix[i]!==v))throw fail('independent_operation_lineage_format');
  const length=new DataView(prefix.buffer).getUint32(OPERATION_LINEAGE_MAGIC.length),start=OPERATION_LINEAGE_PREFIX_BYTES+length;
  if(length<1||length>MAX_OPERATION_BACKUP_HEADER_BYTES||start>file.size)throw fail('independent_operation_lineage_budget');
  const json=new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(OPERATION_LINEAGE_PREFIX_BYTES,start).arrayBuffer());check();
  const header=await readLineageHeader(JSON.parse(json),file.size-start,selected.manifestSha256,check);check();
  if(JSON.stringify(header)!==json)throw fail('independent_operation_lineage_format');
  const payloads=new Map<string,Blob>();for(const part of header.parts){const blob=file.slice(start+part.offset,start+part.offset+part.bytes);if(await independentDeliveryParticipantDigest(blob,policy.options.signal)!==part.sha256)throw fail('independent_operation_lineage_integrity');check();payloads.set(part.sha256,blob);}
  // Validate every snapshot envelope and the complete literal closure before a factory runs.
  const used=new Set<string>(),byState=new Map(header.states.map(s=>[s.manifestSha256,s]));for(const entry of header.states){const view=await readLineageSnapshot(entry,payloads,selected.original,policy.options.limits,check);for(const hash of view.used)used.add(hash);}if(used.size!==payloads.size)throw fail('independent_operation_lineage_closure');check();
  const factory={...policy.options.session,database:'operation-lineage-readonly',create:missing} as SharedIndependentDeliveryOptions<P>,identities=new Map<string,string>();let previous:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined,before:SharedIndependentDeliveryRecovery|undefined,uploads:ReturnType<IndependentOperationBackup['uploadEntries']>|undefined,latest:IndependentOperationBackup|undefined,complete=false;
  try{for(const step of lineageChain(header)){const view=await readLineageSnapshot(byState.get(step.state)!,payloads,selected.original,policy.options.limits,check),backup=await snapshot.read.call(IndependentOperationBackup,view.file,view.selection,{session:policy.options.session,checkAuthority:policy.guard,limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});let retained=false;
    try{check();if(previous){const cut=snapshot.current.call(backup);if(!cut)throw fail('independent_operation_lineage_continuation');const data=await portableCutRecovery(factory,snapshot.metadata.call(backup).operation,cut),current=await replayPortableRecovery(factory,data,check);try{verifyPortableContinuation(current,data,previous,before!);}finally{current.dispose();}check();conserveUploads(uploads!,snapshot.entries.call(backup));}
     for(const row of snapshot.metadata.call(backup).bindings){const old=identities.get(row.asset);if(old&&old!==row.contentAsset)throw fail('independent_operation_lineage_rasters');identities.set(row.asset,row.contentAsset);if(identities.size>MAX_OPERATION_LINEAGE_PARTS)throw fail('independent_operation_lineage_budget');}
     const data=snapshot.live.call(backup),next=await replayPortableRecovery(factory,data,check);try{check();previous?.dispose();previous=next;before=data;uploads=snapshot.entries.call(backup);}catch(error){next.dispose();throw error;}if(latest)snapshot.dispose.call(latest);latest=backup;retained=true;
    }finally{if(!retained)snapshot.dispose.call(backup);}check();
   }previous?.dispose();previous=undefined;check();const result=new IndependentOperationLineageBackup(key,{file,selection:selected,header,payloads,latest:latest!,limits:policy.options.limits});complete=true;return result;
  }finally{previous?.dispose();if(!complete){if(latest)snapshot.dispose.call(latest);payloads.clear();}}
 }
}
const p=IndependentOperationLineageBackup.prototype;
const readLineage=IndependentOperationLineageBackup.read;
export const operationLineageArchive=Object.freeze({owns:(value:unknown):value is IndependentOperationLineageBackup=>states.has(value as IndependentOperationLineageBackup),read:IndependentOperationLineageBackup.read,append:IndependentOperationLineageBackup.append,file:p.file,selection:p.selection,metadata:p.metadata,latestMetadata:(owner:IndependentOperationLineageBackup)=>snapshot.metadata.call(state(owner).latest),originalRecovery:(owner:IndependentOperationLineageBackup)=>snapshot.originalRecovery(state(owner).latest),input:p.inputFile,original:p.originalFile,current:p.currentCut,pending:p.pendingCut,live:p.liveSource,uploads:p.uploadBackup,entries:p.uploadEntries,blob:p.blob,dispose:p.dispose});
