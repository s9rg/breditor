/** Reopen existing current owners only; native ancestry must pass before the source can autosave. */
import {RichAssetStore,readRichAssetBackup} from "@breditor/experimental-rich-content";
import {SharedSegmentedPersistentSession} from "../persistence/segmented_session.js";
import {SharedSegmentedRelaySession} from "../segmented_relay/session.js";
import {captureSharedGenerationSource} from "../generation_source/capture.js";
import {generationSource} from "../generation_source/admission.js";
import {generationOwnerSource,type GenerationRecoveryOwners} from "../generation_participant/recovery_components.js";
import {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {inspectUploads} from "../participant_recovery/inspect.js";
import type {PreparedGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import type {SharedSelectionPolicy} from "../types.js";
import {withGenerationOperationOrigin} from "./admission.js";
import type {NativeGenerationOperationOrigin} from "./origin.js";
import {generationOperationFailure as fail} from "./policy.js";
import {nativeRestoreBinding} from "../native_restore_factory.js";
const captureUploads=RichAssetStore.prototype.captureBackup;
/** Every original immutable upload and acknowledged receipt remains; legitimate retries advance. */
async function verifyUploads<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,check:()=>void):Promise<void>{
 if(!owners.uploads)throw fail("generation_operation_missing");check();const cut=await captureUploads.call(owners.uploads,()=>{check();return undefined;},p.options.signal?{signal:p.options.signal}:{});check();const archive=await readRichAssetBackup(cut.backup,{...(p.options.limits?{limits:p.options.limits}:{}),...(p.options.signal?{signal:p.options.signal}:{})});try{check();const current=new Map(archive.entries().map(r=>[r.asset,r]));for(const before of SharedGenerationParticipantBackup.prototype.uploadEntries.call(p.backup)){const now=current.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==="uploaded"&&(now.status!=="uploaded"||now.storageRef!==before.storageRef))throw fail("generation_operation_diverged");}check();}finally{archive.dispose();}
}
export async function verifyOperationalGenerationOwners<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,origin:NativeGenerationOperationOrigin):Promise<void>{
 p.guard();const source=generationOwnerSource(p,owners);generationSource(source.session).checkManaged();origin.verifySource(source);const capture=captureSharedGenerationSource(source);try{await verifyUploads(p,owners,()=>{p.guard();capture.check();origin.verifySource(source);});origin.verifySource(source);p.guard();capture.check();generationSource(source.session).checkManaged();RichAssetStore.prototype.checkOpen.call(owners.uploads!);}finally{capture.dispose();}
}
export async function openOperationalGenerationOwners<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,origin:NativeGenerationOperationOrigin):Promise<void>{
 p.guard();const name=p.options.destinations.uploads;if(await inspectUploads(name)==="missing")throw fail("generation_operation_missing");p.guard();owners.uploads=await RichAssetStore.openRetained(name,p.options.limits?{limits:p.options.limits}:{});await verifyUploads(p,owners,p.guard);p.guard();
 const database=p.options.destinations.source,s=p.session,binding=nativeRestoreBinding(s.options.restoreSegmented,s.options),common={database,initialGenerations:{root:"unused",active:"unused-2"},create:()=>{throw fail("generation_operation_missing");},restoreSegmented:(checkpoint:string)=>binding.factory.call(binding.receiver,checkpoint)};
 switch(s.kind){case"local":owners.session=await SharedSegmentedPersistentSession.open(withGenerationOperationOrigin({...s.options,...common},origin));break;case"relay":owners.session=await SharedSegmentedRelaySession.open(withGenerationOperationOrigin({...s.options,...common},origin));break;case"retained":owners.session=await SharedSegmentedRelaySession.openRetained(withGenerationOperationOrigin({...s.options,...common},origin));break;}
 p.guard();await verifyOperationalGenerationOwners(p,owners,origin);
}
