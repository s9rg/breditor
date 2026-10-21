/** Actual client source + whole-upload snapshots under both native reservation families.
 * No upload, receipt promotion, file replacement, native mutation, release or activation. */
import {RichAssetStore,RichAssetArchive,type RichAssetArchiveEntry,type AssetLimits} from '@breditor/experimental-rich-content';
import {reserveOperationalParticipantGroup} from '../participant_operation/operation.js';
import {reserveOperationalGenerationGroup} from '../generation_operation/operation.js';
import {ownerSources} from '../participant_recovery/components.js';
import {generationOwnerSource} from '../generation_participant/recovery_components.js';
import {SharedAssetReferenceCapture,type SharedAssetCapturePending} from '../asset_references_capture.js';
import {SharedGenerationSourceCapture} from '../generation_source/capture.js';
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import {assetReferenceKey,compareAssetReference,compareAssetText} from '../physical_recovery_control/asset_requirements.js';
import {MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS,type SharedPhysicalRecoveryAssetReference,type SharedPhysicalRecoveryAssetRead} from '../physical_recovery_control/asset_contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {SharedPhysicalRoomNativeCheckError} from './native_check.js';
import {physicalOperationFailure as fail} from './policy.js';
import {physicalOperationalCoverage} from './native_coverage.js';
import type {PhysicalCatalogArchiveState} from '../physical_room_catalog/archive.js';
import type {SharedPhysicalRoomRecoveryCatalogSource} from '../physical_room_catalog/contract.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {V2OperationChild} from '../room_operation_v2/children.js';
import type {SharedPhysicalRoomNativeAssetsCheck,SharedPhysicalClientUploadSnapshot} from './native_assets_contract.js';
const captureOriginal=SharedAssetReferenceCapture.capture,captureGeneration=SharedGenerationSourceCapture.capture;
const original={check:SharedAssetReferenceCapture.prototype.check,metadata:SharedAssetReferenceCapture.prototype.metadata,dispose:SharedAssetReferenceCapture.prototype.dispose};
const generation={check:SharedGenerationSourceCapture.prototype.check,metadata:SharedGenerationSourceCapture.prototype.metadata,dispose:SharedGenerationSourceCapture.prototype.dispose};
const captureUploads=RichAssetStore.prototype.captureBackup,exportUploads=RichAssetStore.prototype.exportBackup,readUploads=RichAssetArchive.read,uploadEntries=RichAssetArchive.prototype.entries,disposeUploads=RichAssetArchive.prototype.dispose;
interface Snapshot {id:string;family:'original'|'generation';store:RichAssetStore;bytes:number;sha256:string;entries:readonly RichAssetArchiveEntry[]}
const checkCapture=(row:SharedPhysicalRoomRecoveryCatalogSource)=>row.family==='original'?original.check.call(row.source):generation.check.call(row.source);
const metadata=(row:SharedPhysicalRoomRecoveryCatalogSource)=>row.family==='original'?original.metadata.call(row.source):generation.metadata.call(row.source);
export async function checkPhysicalRoomNativeAssets(children:readonly V2OperationChild[],source:PhysicalCatalogArchiveState,host:SharedPhysicalRoomRecoveryHost,context:ArchiveIntegrityContext,retained:()=>Promise<void>,guard:()=>void,signal?:AbortSignal):Promise<SharedPhysicalRoomNativeAssetsCheck>{
 const originals=children.filter(row=>row.family==='original'),generations=children.filter(row=>row.family==='generation'),captures:SharedPhysicalRoomRecoveryCatalogSource[]=[],snapshots:Snapshot[]=[],groups:{verify():Promise<void>;abandon():void}[]=[];
 const check=()=>{guard();for(const row of captures)checkCapture(row);guard();};
 try{
  const a=reserveOperationalParticipantGroup(originals.map(row=>{if(!row.operation)throw fail('physical_operation_restore');return row.operation;}));groups.push(a);
  const b=reserveOperationalGenerationGroup(generations.map(row=>{if(!row.operation)throw fail('physical_operation_restore');return row.operation;}));groups.push(b);
  const native=physicalRecoveryHostPort(host),selected=native.selection.source;
  if(JSON.stringify(selected.ancestor)!==JSON.stringify(source.metadata.origin.identity)||JSON.stringify(selected.server)!==JSON.stringify(source.metadata.current.server.identity)||JSON.stringify(selected.participants)!==JSON.stringify(source.metadata.current.participants.identity))throw new SharedPhysicalRoomNativeCheckError();
  check();await retained();for(const group of groups)await group.verify();check();
  const snapshot=async(id:string,family:'original'|'generation',store:RichAssetStore|undefined,limits:Partial<AssetLimits>|undefined,capture:()=>SharedPhysicalRoomRecoveryCatalogSource)=>{
   if(!store)throw new SharedPhysicalRoomNativeCheckError();
   const actual=await captureUploads.call(store,()=>{check();const row=capture();captures.push(row);check();return row;},signal?{signal}:{});check();
   const archive=await readUploads.call(RichAssetArchive,actual.backup,{...(limits?{limits}:{}),...(signal?{signal}:{})});
   try{check();const sha256=await context.digest(actual.backup);check();snapshots.push({id,family,store,bytes:actual.backup.size,sha256,entries:uploadEntries.call(archive)});}
   finally{disposeUploads.call(archive);}
  };
  for(const[index,state]of a.states.entries())await snapshot(originals[index]!.id,'original',state.owners.uploads,state.p.limits,()=>({id:originals[index]!.id,family:'original',source:captureOriginal.call(SharedAssetReferenceCapture,ownerSources(state.p,state.owners))}));
  for(const[index,state]of b.states.entries())await snapshot(generations[index]!.id,'generation',state.owners.uploads,state.p.options.limits,()=>({id:generations[index]!.id,family:'generation',source:captureGeneration.call(SharedGenerationSourceCapture,generationOwnerSource(state.p,state.owners))}));
  check();const coverage=physicalOperationalCoverage(source,captures),references=new Map<string,SharedPhysicalRecoveryAssetReference>(),uploads=new Map<string,RichAssetArchiveEntry>(),dependencies:{id:string;pending:readonly SharedAssetCapturePending[]}[]=[];
  const bound=()=>{if(references.size+uploads.size>MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS)throw new SharedPhysicalRoomNativeCheckError();};
  for(const row of captures){const outcome=metadata(row).outcome;if(outcome.kind==='pending')dependencies.push({id:row.id,pending:outcome.pending});else for(const reference of outcome.references){references.set(assetReferenceKey(reference),reference);bound();}}
  for(const snapshot of snapshots)for(const entry of snapshot.entries){const before=uploads.get(entry.asset);if(before&&(before.mime!==entry.mime||before.bytes!==entry.bytes||before.width!==entry.width||before.height!==entry.height))throw new SharedPhysicalRoomNativeCheckError();uploads.set(entry.asset,entry);bound();}
  check();let provider:SharedPhysicalRecoveryAssetRead|null=null;
  if(dependencies.length)await native.check(signal);else provider=await native.checkAssets({references:[...references.values()].sort(compareAssetReference),uploads:[...uploads.keys()].sort(compareAssetText)},signal);
  check();await retained();for(const group of groups)await group.verify();check();
  for(const snapshot of snapshots){const now=await exportUploads.call(snapshot.store,signal?{signal}:{});check();if(now.size!==snapshot.bytes||await context.digest(now)!==snapshot.sha256)throw new SharedPhysicalRoomNativeCheckError();check();}
  const after=physicalOperationalCoverage(source,captures);check();if(JSON.stringify(after)!==JSON.stringify(coverage))throw new SharedPhysicalRoomNativeCheckError();
  for(const info of provider?.assets??[]){const local=uploads.get(info.asset);if(local&&(local.mime!==info.mime||local.bytes!==info.bytes||local.width!==info.width||local.height!==info.height))throw new SharedPhysicalRoomNativeCheckError();}
  const currentUploads:SharedPhysicalClientUploadSnapshot[]=snapshots.map(row=>({id:row.id,family:row.family,bytes:row.bytes,sha256:row.sha256,records:row.entries.map(({asset,mime,bytes,width,height,status,epoch,attempts})=>({asset,mime,bytes,width,height,status,epoch,attempts}))}));
  const pendingUploads=currentUploads.flatMap(row=>row.records.flatMap(record=>record.status==='uploaded'?[]:[{id:row.id,asset:record.asset,status:record.status}]));
  const assets={kind:dependencies.length||!provider||provider.missing.length||pendingUploads.length?'pending' as const:'checked' as const,dependencies,provider,uploads:currentUploads,pendingUploads};check();
  return frozen({format:'breditor/shared-physical-room-native-assets-check',formatVersion:1,control:native.selection,catalog:source.selection,scope:'held-client-native-packets-whole-uploads-and-current-provider-bytes',kind:coverage.kind==='checked'&&assets.kind==='checked'?'checked':'pending',coverage,assets});
 }finally{
  for(const row of captures)if(row.family==='original')original.dispose.call(row.source);else generation.dispose.call(row.source);
  for(const group of groups.reverse())group.abandon();
 }
}
