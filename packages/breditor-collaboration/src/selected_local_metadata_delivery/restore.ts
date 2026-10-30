/** Non-overwriting DATA restore under a genuine current parent. It creates no
 * metadata runtime, transport, actor grant or whole-room activation. */
import {lendLocalReviewMetadata,type SelectedLocalReviewDelivery} from '../selected_local_review_delivery/coordinator.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {detachLocalMetadataBundle} from './bundle.js';
import {metadataChoice,metadataJson,equal,fail} from './policy.js';
import {metadataData} from './data.js';
import {readMetadataBundle} from './resume_inspection.js';
import {admitMetadataContinuation} from './native_continuation.js';
import {LocalMetadataRestoreResources} from './restore_resources.js';
import {metadataRestoreChoice} from './restore_policy.js';
import type {LocalMetadataRestoreInspectionInput,LocalMetadataRestoreInput,LocalMetadataRestoreChoice,LocalMetadataRestoreResult} from './restore_contract.js';
async function operate(owner:SelectedLocalReviewDelivery,provided:LocalMetadataRestoreInspectionInput|LocalMetadataRestoreInput,restore:boolean):Promise<LocalMetadataRestoreChoice>{
 const parent=lendLocalReviewMetadata(owner);let resources:LocalMetadataRestoreResources|undefined,task:Promise<LocalMetadataRestoreChoice>|undefined,stopped=false,ending:Promise<void>|undefined;const cancels=new Set<()=>void>();let authority=()=>{};
 const check=()=>{if(stopped)throw fail('local_metadata_restore_closed');parent.check();authority();resources?.check();parent.check();if(stopped)throw fail('local_metadata_restore_closed');};
 const stop=()=>{stopped=true;for(const cancel of cancels)cancel();cancels.clear();if(resources)void resources.close().catch(()=>{});};
 const close=()=>{if(ending)return ending;stop();ending=(async()=>{await resources?.close();await task?.catch(()=>{});parent.release();})().finally(()=>{ending=undefined;});return ending;};
 try{const r=fields(provided,['choice','bundle','checkAuthority',...(restore?['expected','approve']:[])]),choice=metadataChoice(metadataData(r['choice'])),bundle=detachLocalMetadataBundle(r['bundle']),expected=restore?metadataRestoreChoice(metadataData(r['expected'])):undefined,approve=r['approve'] as LocalMetadataRestoreInput['approve'];authority=participantAuthority(r['checkAuthority'] as ()=>void);check();if(!equal(parent.choice,choice.parent)||restore&&typeof approve!=='function')throw fail('local_metadata_restore_policy');
  task=Promise.resolve().then(async()=>{check();const portable=await readMetadataBundle(parent,bundle,choice,check);await admitMetadataContinuation(parent,bundle,portable,portable,check);check();const actual=await parent.scope.retainCurrent();resources=new LocalMetadataRestoreResources(choice,bundle,portable,{wasm:actual.integrity.wasm,checkAuthority:check,signal:parent.scope.signal});await resources.reserve();check();
   const inspect=async()=>{check();const current=await parent.scope.retainCurrent(),destination=await resources!.inspect();check();return metadataRestoreChoice({format:'breditor/selected-local-metadata-data-restore',formatVersion:1,delivery:choice,bundle:{prepared:bundle.parent.prepared.choice,current:bundle.parent.current.selection,review:{bytes:bundle.parent.delivery.bytes,sha256:bundle.parent.delivery.sha256},metadata:{bytes:bundle.metadata.bytes,sha256:bundle.metadata.sha256}},current:current.current.selection,destination});};
   const before=await inspect();if(!restore)return before;if(!equal(before,expected))throw fail('local_metadata_restore_stale');await decideFreshAssetChoice(before,approve,{check,signal:parent.scope.signal,watchClosing:cancel=>{cancels.add(cancel);return()=>cancels.delete(cancel);}});check();if(!equal(await inspect(),before))throw fail('local_metadata_restore_stale');parent.bind(await segmentedDigest(metadataJson(choice)));check();await resources.restore(before.destination);check();const after=await parent.scope.retainCurrent();if(!equal(after.current.selection,before.current))throw fail('local_metadata_restore_stale');return before;
  });parent.install(stop,close);return await task;
 }finally{await close();}
}
export function previewSelectedLocalMetadataRestore(owner:SelectedLocalReviewDelivery,input:LocalMetadataRestoreInspectionInput):Promise<LocalMetadataRestoreChoice>{return operate(owner,input,false);}
export async function restoreSelectedLocalMetadataData(owner:SelectedLocalReviewDelivery,input:LocalMetadataRestoreInput):Promise<LocalMetadataRestoreResult>{const choice=await operate(owner,input,true);return Object.freeze({format:'breditor/selected-local-metadata-data-restored',formatVersion:1,choice});}
