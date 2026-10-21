/** Consistent owner + selected retained packet capture; no provider fetch, save, finality or GC. */
import type {RichRetainedAssetReference} from "@breditor/experimental-rich-content";
import type {SharedRichEditor} from "./core.js";
import type {SharedSelectionPolicy} from "./types.js";
import type {SharedReviewPersistentSession} from "./persistence/review_session.js";
import type {VersionCatalogStore} from "./versions/store.js";
import type {SharedDocumentVersions} from "./versions/catalog.js";
import type {SharedSuggestionQueue} from "./suggestions/queue.js";
import type {SharedSuggestionRevisions} from "./suggestion_revisions/outbox.js";
import type {SharedPacketAssetIdentity,SharedPacketAssetReferencesRead} from "./packet_asset_references.js";
import {SharedGenerationSourceError} from "./generation_source/identity.js";
import {sourceCoreMethods as nativeCore,sourceNativeRecoveryRead} from './source_native_read.js';

export type SharedAssetCaptureSourceKind="document"|"paired-session"|"version-catalog"|"suggestions"|"suggestion-revisions";
export interface SharedAssetCaptureRecord {readonly kind:SharedAssetCaptureSourceKind;readonly json:string}
export interface SharedAssetReferenceCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;
 readonly session?:SharedReviewPersistentSession<P>;
 readonly versions?:SharedDocumentVersions<P>|VersionCatalogStore<P>;
 readonly suggestions?:SharedSuggestionQueue<P>;
 readonly revisions?:SharedSuggestionRevisions<P>;
}
export type SharedAssetCapturePending=
 |Readonly<{kind:"source";packet:SharedPacketAssetIdentity;missing:readonly Readonly<{writer:string;counter:string}>[]}>
 |Readonly<{kind:"uncached_version";id:string}>;
export interface SharedAssetReferenceCaptureMetadata {
 readonly format:"breditor/shared-asset-reference-capture";readonly formatVersion:1;
 readonly document:string;readonly revision:string;
 readonly scope:"native-and-selected-retained-packets";
 readonly sources:readonly Readonly<{kind:SharedAssetCaptureSourceKind;utf8Bytes:number}>[];
 readonly packets:readonly SharedPacketAssetIdentity[];
 readonly outcome:Readonly<{kind:"ready";references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:"pending";pending:readonly SharedAssetCapturePending[]}>;
}
/** Separate optional read budgets; they do not expand persisted store admission. */
// Four current 32 MiB record families plus the 16 MiB native journal fit without truncation.
export const MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES=160*1024*1024;
export const MAX_SHARED_ASSET_CAPTURE_PACKETS=1024;
/** Internal borrowed canonical facade reads; no editing, connection or owner transfer. */
export type SharedCapturedRecoveryRead=Pick<SharedRichEditor,"descriptor"|"checkpointJson"|"writerClock"|"writerClockV2"|"writerGroups"|"writerGroupsV2"|"reviewWriterClock"|"reviewCheckpoint"|"localReviewClock">;
const key=Object.freeze({}),proofs=new WeakMap<SharedAssetReferenceCapture,{records:readonly SharedAssetCaptureRecord[];check:()=>void;native:SharedCapturedRecoveryRead}>();
const failed=()=>new Error("The selected asset capture source is closed, replaced or no longer current");
/** Internal canonical record readers, used after native/record admission of a retained archive. */
export type SharedAssetRecordReader=
 |Readonly<{kind:"paired-session";read:()=>ReturnType<SharedReviewPersistentSession["exportRecovery"]>}>
 |Readonly<{kind:"version-catalog";read:()=>ReturnType<VersionCatalogStore["exportRecovery"]>}>
 |Readonly<{kind:"suggestions";read:()=>ReturnType<SharedSuggestionQueue["exportRecovery"]>}>
 |Readonly<{kind:"suggestion-revisions";read:()=>ReturnType<SharedSuggestionRevisions["exportRecovery"]>}>;
let captureRecorded:<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,readers:readonly SharedAssetRecordReader[],guard:()=>void)=>SharedAssetReferenceCapture;
/** @internal Reuse native dependency reads, never a detached metadata/proof constructor. */
export function captureRecordedAssetReferences<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,readers:readonly SharedAssetRecordReader[],guard:()=>void):SharedAssetReferenceCapture{return captureRecorded(core,readers,guard);}
export class SharedAssetReferenceCapture {
 readonly #metadata:SharedAssetReferenceCaptureMetadata;
 private constructor(token:object,metadata:SharedAssetReferenceCaptureMetadata,records:readonly SharedAssetCaptureRecord[],check:()=>void,native:SharedCapturedRecoveryRead){if(token!==key)throw failed();this.#metadata=metadata;proofs.set(this,{records,check,native});Object.freeze(this);}
 /** Frozen detached dependency metadata remains readable after disposal, but grants no authority. */
 metadata():SharedAssetReferenceCaptureMetadata{return this.#metadata;}
 /** Exact captured recovery JSON, not current credentials or a server/writer grant. */
 records():readonly SharedAssetCaptureRecord[]{const value=proofs.get(this);if(!value)throw failed();return value.records;}
 /** Recheck after every async byte resolution/capture step; no producer is flushed or mutated. */
 check():void{const value=proofs.get(this);if(!value)throw failed();value.check();if(proofs.get(this)!==value)throw failed();}
 /** Release retained source bytes/borrowed producers; never closes a session, queue or native owner. */
 dispose():void{proofs.delete(this);}
 static{captureRecorded=(core,readers,guard)=>SharedAssetReferenceCapture.#capture(core,readers,guard);}
 static capture<P extends SharedSelectionPolicy>(input:SharedAssetReferenceCaptureOptions<P>):SharedAssetReferenceCapture {
  const {core,session,versions,suggestions,revisions}=input;
  if(revisions&&!suggestions)throw Error("A revision source requires its exact retained proposal queue");
  const readers:SharedAssetRecordReader[]=[];
  if(session)readers.push({kind:"paired-session",read:()=>{if(session.core!==core)throw failed();return session.exportRecovery();}});
  if(versions)readers.push({kind:"version-catalog",read:()=>{versions.checkSource(core);return versions.exportRecovery();}});
  if(suggestions)readers.push({kind:"suggestions",read:()=>{if(suggestions.core!==core)throw failed();return suggestions.exportRecovery();}});
  if(revisions)readers.push({kind:"suggestion-revisions",read:()=>{revisions.checkQueue(suggestions!);if(suggestions!.core!==core)throw failed();return revisions.exportRecovery();}});
  return SharedAssetReferenceCapture.#capture(core,readers,()=>{});
 }
 static #capture<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,input:readonly SharedAssetRecordReader[],guard:()=>void):SharedAssetReferenceCapture {
  if(nativeCore.segmentedHistoryPolicy.call(core)!==null)throw new SharedGenerationSourceError("generation_source_policy","Use the explicitly selected generation source capture, not the original bounded record family");
  const readers=input.map(reader=>Object.freeze({...reader}));guard();const kinds=["paired-session","version-catalog","suggestions","suggestion-revisions"],selected=readers.map(reader=>reader.kind);let previous=-1;
  for(const kind of selected){const at=kinds.indexOf(kind);if(at<=previous)throw failed();previous=at;}
  if(selected.includes("suggestion-revisions")&&!selected.includes("suggestions"))throw failed();
  if(!nativeCore.supportsRetainedAssetReferences.call(core)||!nativeCore.supportsPacketAssetReferences.call(core))throw Error("Use complete matching native owner and packet dependency reads");
  const base=nativeCore.retainedAssetReferences.call(core),revision=base.revision,records:SharedAssetCaptureRecord[]=[],checks:(()=>void)[]=[],sources:{kind:SharedAssetCaptureSourceKind;utf8Bytes:number}[]=[];
  let sourceBytes=0,packetCount=0;
  const record=<T>(kind:SharedAssetCaptureSourceKind,read:()=>T):T=>{
   const value=read(),json=typeof value==="string"?value:JSON.stringify(value),bytes=new TextEncoder().encode(json).byteLength;
   sourceBytes+=bytes;if(sourceBytes>MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES)throw Error("Asset capture source byte budget exceeded");
   records.push(Object.freeze({kind,json}));sources.push(Object.freeze({kind,utf8Bytes:bytes}));checks.push(()=>{const next=read(),encoded=typeof next==="string"?next:JSON.stringify(next);if(encoded!==json)throw failed();});return value;
  };
  record("document",()=>nativeCore.checkpointJson.call(core));
  const pairs=new Map<string,RichRetainedAssetReference>(),packets:SharedPacketAssetIdentity[]=[],pending:SharedAssetCapturePending[]=[],seen=new Map<string,SharedPacketAssetIdentity>();
  const add=(references:readonly RichRetainedAssetReference[])=>{for(const reference of references){pairs.set(`${reference.asset}/${reference.generation}`,reference);if(pairs.size>100000)throw Error("Asset capture complete reference budget exceeded");}};
  add(base.references);
  const consume=(cacheKey:string,read:()=>SharedPacketAssetReferencesRead):SharedPacketAssetIdentity=>{
   const known=seen.get(cacheKey);if(known)return known;if(++packetCount>MAX_SHARED_ASSET_CAPTURE_PACKETS)throw Error("Asset capture packet budget exceeded");
   const value=read();nativeCore.checkPacketAssetReferences.call(core,value,revision);packets.push(value.packet);seen.set(cacheKey,value.packet);
   if(value.outcome.kind==="ready")add(value.outcome.references);else pending.push(Object.freeze({kind:"source",packet:value.packet,missing:value.outcome.missing}));return value.packet;
  };
  const snapshot=(packet:string)=>consume(`version:${packet}`,()=>nativeCore.versionAssetReferences.call(core,packet,revision));
  for(const reader of readers)switch(reader.kind){
   case"paired-session":{const value=record(reader.kind,reader.read);for(const packet of value.versions)snapshot(packet);break;}
   case"version-catalog":{const value=record(reader.kind,reader.read),cached=new Set<string>();for(const row of value.packets)cached.add(snapshot(row.packet).id);for(const entry of value.catalog?.entries??[])if(!cached.has(entry.version.id))pending.push(Object.freeze({kind:"uncached_version",id:entry.version.id}));break;}
   case"suggestions":{const value=record(reader.kind,reader.read);for(const row of value.retained)consume(`suggestion:${row.packet}`,()=>nativeCore.suggestionAssetReferences.call(core,row.packet,revision));break;}
   case"suggestion-revisions":{const value=record(reader.kind,reader.read);for(const row of value.retained)consume(`revision:${JSON.stringify([row.previousPacket,row.packet])}`,()=>nativeCore.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));break;}
  }
  const check=()=>{guard();nativeCore.checkRetainedAssetReferences.call(core,base,revision);for(const read of checks)read();nativeCore.checkRetainedAssetReferences.call(core,base,revision);guard();};check();
  const references=Object.freeze([...pairs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0));
  const outcome=pending.length?Object.freeze({kind:"pending" as const,pending:Object.freeze(pending)}):Object.freeze({kind:"ready" as const,references});
  const metadata:SharedAssetReferenceCaptureMetadata=Object.freeze({format:"breditor/shared-asset-reference-capture",formatVersion:1,document:base.document,revision,scope:"native-and-selected-retained-packets",sources:Object.freeze(sources),packets:Object.freeze(packets),outcome});
  seen.clear();pairs.clear();
  const native=sourceNativeRecoveryRead(core);
  return new SharedAssetReferenceCapture(key,metadata,Object.freeze(records),check,native);
 }
}
/** Explicit source list; omitted stores, server state, SDK remote queues and extensions are excluded. */
export function captureSharedAssetReferences<P extends SharedSelectionPolicy>(input:SharedAssetReferenceCaptureOptions<P>):SharedAssetReferenceCapture{return SharedAssetReferenceCapture.capture(input);}
/** Internal only: a detached record or lookalike handle cannot obtain native read closures. */
export function capturedRecoveryRead(source:SharedAssetReferenceCapture):SharedCapturedRecoveryRead{const value=proofs.get(source);if(!value)throw failed();value.check();if(proofs.get(source)!==value)throw failed();return value.native;}
