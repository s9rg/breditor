/** Consistent owner + selected retained packet capture; no provider fetch, save, finality or GC. */
import type {RichRetainedAssetReference} from "@breditor/experimental-rich-content";
import {SharedRichEditor} from "./core.js";
import type {SharedSelectionPolicy} from "./types.js";
import type {SharedReviewPersistentSession} from "./persistence/review_session.js";
import type {VersionCatalogStore} from "./versions/store.js";
import type {SharedDocumentVersions} from "./versions/catalog.js";
import type {SharedSuggestionQueue} from "./suggestions/queue.js";
import type {SharedSuggestionRevisions} from "./suggestion_revisions/outbox.js";
import type {SharedPacketAssetIdentity,SharedPacketAssetReferencesRead} from "./packet_asset_references.js";

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
export class SharedAssetReferenceCapture {
 readonly #metadata:SharedAssetReferenceCaptureMetadata;
 private constructor(token:object,metadata:SharedAssetReferenceCaptureMetadata,records:readonly SharedAssetCaptureRecord[],check:()=>void,native:SharedCapturedRecoveryRead){if(token!==key)throw failed();this.#metadata=metadata;proofs.set(this,{records,check,native});Object.freeze(this);}
 /** Frozen detached dependency metadata remains readable after disposal, but grants no authority. */
 metadata():SharedAssetReferenceCaptureMetadata{return this.#metadata;}
 /** Exact captured recovery JSON, not current credentials or a server/writer grant. */
 records():readonly SharedAssetCaptureRecord[]{const value=proofs.get(this);if(!value)throw failed();return value.records;}
 /** Recheck after every async byte resolution/capture step; no producer is flushed or mutated. */
 check():void{const value=proofs.get(this);if(!value)throw failed();value.check();}
 /** Release retained source bytes/borrowed producers; never closes a session, queue or native owner. */
 dispose():void{proofs.delete(this);}
 static capture<P extends SharedSelectionPolicy>(input:SharedAssetReferenceCaptureOptions<P>):SharedAssetReferenceCapture {
  const {core,session,versions,suggestions,revisions}=input;
  if(revisions&&!suggestions)throw Error("A revision source requires its exact retained proposal queue");
  if(!core.supportsRetainedAssetReferences()||!core.supportsPacketAssetReferences())throw Error("Use complete matching native owner and packet dependency reads");
  const base=core.retainedAssetReferences(),revision=base.revision,records:SharedAssetCaptureRecord[]=[],checks:(()=>void)[]=[],sources:{kind:SharedAssetCaptureSourceKind;utf8Bytes:number}[]=[];
  let sourceBytes=0,packetCount=0;
  const record=(kind:SharedAssetCaptureSourceKind,read:()=>unknown):unknown=>{
   const value=read(),json=typeof value==="string"?value:JSON.stringify(value),bytes=new TextEncoder().encode(json).byteLength;
   sourceBytes+=bytes;if(sourceBytes>MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES)throw Error("Asset capture source byte budget exceeded");
   records.push(Object.freeze({kind,json}));sources.push(Object.freeze({kind,utf8Bytes:bytes}));checks.push(()=>{const next=read(),encoded=typeof next==="string"?next:JSON.stringify(next);if(encoded!==json)throw failed();});return value;
  };
  record("document",()=>core.checkpointJson());
  const pairs=new Map<string,RichRetainedAssetReference>(),packets:SharedPacketAssetIdentity[]=[],pending:SharedAssetCapturePending[]=[],seen=new Map<string,SharedPacketAssetIdentity>();
  const add=(references:readonly RichRetainedAssetReference[])=>{for(const reference of references){pairs.set(`${reference.asset}/${reference.generation}`,reference);if(pairs.size>100000)throw Error("Asset capture complete reference budget exceeded");}};
  add(base.references);
  const consume=(cacheKey:string,read:()=>SharedPacketAssetReferencesRead):SharedPacketAssetIdentity=>{
   const known=seen.get(cacheKey);if(known)return known;if(++packetCount>MAX_SHARED_ASSET_CAPTURE_PACKETS)throw Error("Asset capture packet budget exceeded");
   const value=read();core.checkPacketAssetReferences(value,revision);packets.push(value.packet);seen.set(cacheKey,value.packet);
   if(value.outcome.kind==="ready")add(value.outcome.references);else pending.push(Object.freeze({kind:"source",packet:value.packet,missing:value.outcome.missing}));return value.packet;
  };
  const snapshot=(packet:string)=>consume(`version:${packet}`,()=>core.versionAssetReferences(packet,revision));
  if(session){const read=()=>{if(session.core!==core)throw failed();return session.exportRecovery();};const value=record("paired-session",read) as ReturnType<typeof session.exportRecovery>;for(const packet of value.versions)snapshot(packet);}
  if(versions){const read=()=>{versions.checkSource(core);return versions.exportRecovery();};const value=record("version-catalog",read) as ReturnType<typeof versions.exportRecovery>,cached=new Set<string>();for(const row of value.packets)cached.add(snapshot(row.packet).id);for(const entry of value.catalog?.entries??[])if(!cached.has(entry.version.id))pending.push(Object.freeze({kind:"uncached_version",id:entry.version.id}));}
  if(suggestions){const read=()=>{if(suggestions.core!==core)throw failed();return suggestions.exportRecovery();};const value=record("suggestions",read) as ReturnType<typeof suggestions.exportRecovery>;for(const row of value.retained)consume(`suggestion:${row.packet}`,()=>core.suggestionAssetReferences(row.packet,revision));}
  if(revisions){const queue=suggestions!;const read=()=>{revisions.checkQueue(queue);if(queue.core!==core)throw failed();return revisions.exportRecovery();};const value=record("suggestion-revisions",read) as ReturnType<typeof revisions.exportRecovery>;for(const row of value.retained)consume(`revision:${JSON.stringify([row.previousPacket,row.packet])}`,()=>core.suggestionRevisionAssetReferences(row.previousPacket,row.packet,revision));}
  const check=()=>{core.checkRetainedAssetReferences(base,revision);for(const read of checks)read();core.checkRetainedAssetReferences(base,revision);};check();
  const references=Object.freeze([...pairs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0));
  const outcome=pending.length?Object.freeze({kind:"pending" as const,pending:Object.freeze(pending)}):Object.freeze({kind:"ready" as const,references});
  const metadata:SharedAssetReferenceCaptureMetadata=Object.freeze({format:"breditor/shared-asset-reference-capture",formatVersion:1,document:base.document,revision,scope:"native-and-selected-retained-packets",sources:Object.freeze(sources),packets:Object.freeze(packets),outcome});
  seen.clear();pairs.clear();
  const {descriptor,checkpointJson,writerClock,writerClockV2,writerGroups,writerGroupsV2,reviewWriterClock,reviewCheckpoint,localReviewClock}=SharedRichEditor.prototype,native:SharedCapturedRecoveryRead=Object.freeze({
   descriptor:()=>descriptor.call(core),checkpointJson:()=>checkpointJson.call(core),
   writerClock:(writer:string)=>writerClock.call(core,writer),writerClockV2:(writer:string)=>writerClockV2.call(core,writer),
   writerGroups:(after:string)=>writerGroups.call(core,after),writerGroupsV2:(after:string)=>writerGroupsV2.call(core,after),
   reviewWriterClock:(actor:string,principal:string,through?:string)=>reviewWriterClock.call(core,actor,principal,through),
   reviewCheckpoint:()=>reviewCheckpoint.call(core),localReviewClock:()=>localReviewClock.call(core),
  });
  return new SharedAssetReferenceCapture(key,metadata,Object.freeze(records),check,native);
 }
}
/** Explicit source list; omitted stores, server state, SDK remote queues and extensions are excluded. */
export function captureSharedAssetReferences<P extends SharedSelectionPolicy>(input:SharedAssetReferenceCaptureOptions<P>):SharedAssetReferenceCapture{return SharedAssetReferenceCapture.capture(input);}
/** Internal only: a detached record or lookalike handle cannot obtain native read closures. */
export function capturedRecoveryRead(source:SharedAssetReferenceCapture):SharedCapturedRecoveryRead{const value=proofs.get(source);if(!value)throw failed();value.check();return value.native;}
