/** Genuine new-format DATA archive. It cannot impersonate an old completed restore,
 * open a native writer, choose a destination or grant current room permission. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import {portableReadPolicy} from '../independent_operation/portable_policy.js';
import {operationBackupSelection} from '../independent_operation/portable_identity.js';
import type {IndependentOperationBackupSelection} from '../independent_operation/portable_contract.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {IndependentOperationBackup,portableOperationArchive as old} from '../independent_operation/portable_backup.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import {replayPortableRecovery,verifyPortableContinuation} from '../independent_operation/portable_replay.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import {MAX_OPERATION_LINEAGE_PARTS} from '../independent_operation/lineage_codec.js';
import {readGraphEnvelope} from './graph_envelope.js';import {readNativeState} from './native_state.js';
type Envelope=Awaited<ReturnType<typeof readGraphEnvelope>>;
type NativeState=Awaited<ReturnType<typeof readNativeState>>;
type Latest=Readonly<{kind:'snapshot-v1';owner:IndependentOperationBackup}>|Readonly<{kind:'state-v2';owner:NativeState}>;
interface State{readonly file:Blob;readonly selection:IndependentOperationBackupSelection;readonly envelope:Envelope;readonly latest:Latest}
const key=Object.freeze({}),states=new WeakMap<RestoredOperationGraphArchive,State>(),state=(owner:RestoredOperationGraphArchive)=>{const s=states.get(owner);if(!s)throw fail('restored_graph_closed');return s;},missing=()=>{throw fail('restored_graph_factory');};
const dispose=(s:Latest)=>{if(s.kind==='snapshot-v1')old.dispose.call(s.owner);else s.owner.dispose();};
const live=(s:Latest)=>s.kind==='snapshot-v1'?old.live.call(s.owner):structuredClone(s.owner.live);
const current=(s:Latest)=>s.kind==='snapshot-v1'?old.current.call(s.owner):s.owner.current&&structuredClone(s.owner.current);
const pending=(s:Latest)=>s.kind==='snapshot-v1'?old.pending.call(s.owner):s.owner.pending&&structuredClone(s.owner.pending);
const metadata=(s:Latest)=>s.kind==='snapshot-v1'?old.metadata.call(s.owner):structuredClone(s.owner.header);
const entries=(s:Latest)=>s.kind==='snapshot-v1'?old.entries.call(s.owner):s.owner.uploadEntries();
function conserve(before:ReturnType<typeof entries>,after:ReturnType<typeof entries>){const next=new Map(after.map(r=>[r.asset,r]));for(const old of before){const now=next.get(old.asset);if(!now||now.mime!==old.mime||now.bytes!==old.bytes||now.width!==old.width||now.height!==old.height||now.epoch<old.epoch||now.attempts<old.attempts||old.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==old.storageRef))throw fail('restored_graph_uploads');}}
export class RestoredOperationGraphArchive{
 private constructor(token:object,value:State){if(token!==key)throw fail();states.set(this,value);Object.freeze(this);}
 static async read<P extends SharedSelectionPolicy>(file:Blob,input:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>):Promise<RestoredOperationGraphArchive>{
  if(this!==RestoredOperationGraphArchive)throw fail('restored_graph_factory');
  try{return await RestoredOperationGraphArchive.#read(file,input,options);}catch(error){if(error instanceof SyntaxError)throw fail('restored_graph_format');throw error;}
 }
 static async #read<P extends SharedSelectionPolicy>(file:Blob,input:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>):Promise<RestoredOperationGraphArchive>{
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['session','checkAuthority','signal','limits'].includes(k)))throw fail('restored_graph_policy');const selection=operationBackupSelection(input),policy=portableReadPolicy(selection.original,options),check=policy.guard;check();const envelope=await readGraphEnvelope(file,selection,policy.options.limits,check),factory={...policy.options.session,database:'restored-graph-readonly',create:missing} as SharedIndependentDeliveryOptions<P>,identities=new Map<string,string>();let previous:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined,before:SharedIndependentDeliveryRecovery|undefined,uploads:ReturnType<typeof entries>|undefined,latest:Latest|undefined,complete=false;
  try{for(const step of envelope.chain){const view=envelope.views.get(step.kind+':'+step.state);if(!view)throw fail('restored_graph_closure');const selected:Latest=view.kind==='snapshot-v1'?{kind:'snapshot-v1',owner:await old.read.call(IndependentOperationBackup,view.file,view.selection,{session:policy.options.session,checkAuthority:check,limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})})}:{kind:'state-v2',owner:await readNativeState(view.header,view.selection,envelope.payloads,{session:policy.options.session,checkAuthority:check,limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})})};let retained=false;
    try{check();if(previous){const cut=current(selected);if(!cut)throw fail('restored_graph_continuation');const data=await portableCutRecovery(factory,metadata(selected).operation,cut),replica=await replayPortableRecovery(factory,data,check);try{verifyPortableContinuation(replica,data,previous,before!);}finally{replica.dispose();}conserve(uploads!,entries(selected));check();}for(const row of metadata(selected).bindings){const prior=identities.get(row.asset);if(prior&&prior!==row.contentAsset)throw fail('restored_graph_rasters');identities.set(row.asset,row.contentAsset);if(identities.size>MAX_OPERATION_LINEAGE_PARTS)throw fail("restored_graph_budget");}const data=live(selected),next=await replayPortableRecovery(factory,data,check);try{check();previous?.dispose();previous=next;before=data;uploads=entries(selected);}catch(e){next.dispose();throw e;}if(latest)dispose(latest);latest=selected;retained=true;
    }finally{if(!retained)dispose(selected);}check();
   }previous?.dispose();previous=undefined;if(!latest||latest.kind!=='state-v2')throw fail('restored_graph_closure');check();const result=new RestoredOperationGraphArchive(key,{file:envelope.file,selection,envelope,latest});complete=true;return result;
  }finally{previous?.dispose();if(!complete){if(latest)dispose(latest);envelope.payloads.clear();envelope.views.clear();}}
 }
 selection(){return structuredClone(state(this).selection);}
 file(){return state(this).file;}
 metadata(){return structuredClone(state(this).envelope.header);}
 latestMetadata(){return metadata(state(this).latest);}
 liveSource(){return live(state(this).latest);}
 currentCut(){return current(state(this).latest);}
 pendingCut(){return pending(state(this).latest);}
 uploadEntries(){return entries(state(this).latest);}
 uploadBackup(){const s=state(this).latest;return s.kind==='snapshot-v1'?old.uploads.call(s.owner):s.owner.uploadBackup();}
 originalFile(){const s=state(this).latest;return s.kind==='snapshot-v1'?old.originalFile.call(s.owner):s.owner.originalFile();}
 originalRecovery(){const s=state(this).latest;return s.kind==='snapshot-v1'?old.originalRecovery(s.owner):structuredClone(s.owner.original);}
 async inputFile(){const s=state(this),root=s.envelope.header.nodes.find(n=>n.kind==='lineage-v2'&&n.node.manifestSha256===s.envelope.header.root);if(!root||root.kind!=='lineage-v2')throw fail();const check=()=>{if(state(this)!==s)throw fail('restored_graph_closed');},file=await s.envelope.reconstruct(root.node.previous,check);check();return file;}
 blob(asset:string,generation:string){const s=state(this);for(const step of [...s.envelope.chain].reverse()){const view=s.envelope.views.get(step.kind+':'+step.state)!,binding=view.header.bindings.find(r=>r.asset===asset&&r.generation===generation);if(binding){const asset=view.header.assets.find(r=>r.contentAsset===binding.contentAsset)!;return new Blob([s.envelope.payloads.get(view.header.parts[asset.part]!.sha256)!],{type:asset.mime});}}return undefined;}
 dispose(){const s=states.get(this);if(!s)return;states.delete(this);try{dispose(s.latest);}finally{s.envelope.payloads.clear();s.envelope.views.clear();}}
}
const p=RestoredOperationGraphArchive.prototype;
/** Canonical methods and actual brand admission; no serialized data selects an owner. */
export const restoredGraphArchive=Object.freeze({owns:(value:unknown):value is RestoredOperationGraphArchive=>!!value&&typeof value==='object'&&states.has(value as RestoredOperationGraphArchive),read:RestoredOperationGraphArchive.read,file:p.file,selection:p.selection,metadata:p.metadata,latestMetadata:p.latestMetadata,original:p.originalFile,originalRecovery:p.originalRecovery,current:p.currentCut,pending:p.pendingCut,live:p.liveSource,uploads:p.uploadBackup,entries:p.uploadEntries,input:p.inputFile,blob:p.blob,dispose:p.dispose});
