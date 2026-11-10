/** Assemble only inside the metadata owner's genuine quiesced capture, after
 * complete source/native admission. Legacy diagnostics remain untouched. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataAssetAvailabilityBundle} from './availability_contract.js';
import type {LocalMetadataReconciliationRead,LocalMetadataReconciliationPending} from './reconciliation_contract.js';
import type {PreparedLocalMetadataReconciliation} from './reconciliation_input.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {independentDeliveryRecords} from '../independent_delivery_source/records.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {localMetadataPendingRecords} from './reconciliation_metadata.js';
import {localMetadataReconciledReviews} from './reconciliation_reviews.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail} from './error.js';
import {MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS} from '../selected_room_reconciliation/generation_heads.js';
const readRecords=PhysicalRoomRecordCutArchive.prototype.records;
export async function captureLocalMetadataReconciliation(scope:SelectedNativeRecoveryScope,sources:readonly RetainedDeliveryClient[],snapshot:LocalMetadataDeliverySnapshot,cut:PhysicalRoomRecordCutArchive,input:PreparedLocalMetadataReconciliation,assets:LocalMetadataAssetAvailabilityBundle,check:()=>void):Promise<LocalMetadataReconciliationRead>{
 check();input.check();
 const legacy=input.handover?await scope.readHandoverDeliveryReconciliation(input.handover.host,input.reader):await scope.readDeliveryReconciliation(input.host,input.reader);check();input.check();
 if(!equal(assets.availability.control,{kind:'native-continuation',selection:legacy.native.control})||!equal(assets.availability.current,legacy.provider.current)||!equal(assets.availability.approval,legacy.provider.approval)||!equal(assets.availability.uploads,legacy.provider.uploads))throw fail('local_metadata_assets_state');
 const local=localMetadataReconciledReviews(sources,snapshot,input,check);
 const pending:LocalMetadataReconciliationPending[]=[];
 const add=(row:LocalMetadataReconciliationPending)=>{if(pending.length>=MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS)throw fail('local_metadata_assets_reference_budget');pending.push(row);};
 const append=(rows:readonly LocalMetadataReconciliationPending[])=>{for(const row of rows)add(row);};
 append(legacy.heads.map(requirement=>({kind:'head' as const,requirement})));append(local.pending);
 const boundActors=new Set(local.reviews.map(row=>row.actor));
 for(const missing of legacy.native.ownStreams.missing){
  if(missing.kind==='unbound_review'&&boundActors.has(missing.actor)||missing.kind==='review'&&boundActors.has(missing.actor))continue;
  add({kind:'registration',participant:'participant'in missing?missing.participant:'',actor:'actor'in missing?missing.actor:null});
 }
 for(const participant of legacy.native.ownStreams.unreconciledParticipants)add({kind:'registration',participant,actor:null});
 for(const source of sources){
  const lane=snapshot.current.lanes.find(row=>row.id===source.id);
  if(lane){append(localMetadataPendingRecords(source.id,lane.records));continue;}
  const live=recordLiveBasis(source.family,await readRecords.call(cut,source.id));check();
  const rows=source.family==='original'||source.family==='generation'?live as readonly {kind:string;json:string}[]:source.family==='independent-delivery'||source.family==='restored-graph'?independentDeliveryRecords(live as SharedIndependentDeliveryRecovery):[];
  const records:SegmentedRetainedRecords={suggestions:null,revisions:null,versions:null};
  for(const row of rows){const kind=row.kind==='suggestions'?'suggestions':row.kind==='revisions'||row.kind==='suggestion-revisions'?'revisions':row.kind==='versions'||row.kind==='version-catalog'?'versions':null;if(kind){if(records[kind]!==null)throw fail('local_metadata_assets_state');records[kind]=JSON.parse(row.json);}}
  append(localMetadataPendingRecords(source.id,records));
 }
 const body=JSON.parse(await Blob.prototype.text.call(assets.references.references.file));check();
 if(body.outcome.kind!=='ready')add({kind:'references'});
 if(assets.availability.kind!=='checked'||legacy.provider.kind!=='checked')add({kind:'provider'});
 await input.port.check(scope.signal);input.check();check();
 return frozen({format:'breditor/selected-local-metadata-reconciliation-read',formatVersion:1,scope:'same-held-native-room-local-review-bindings-all-metadata-and-provider',kind:pending.length?'pending':'checked',legacy,assets,reviews:local.reviews,pending});
}
