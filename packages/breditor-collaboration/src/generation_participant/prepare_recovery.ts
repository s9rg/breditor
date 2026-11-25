import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Host selects factories and current policy. File/record fields select neither. */
import {makeGenerationCut,makeSegmentedCut} from "../persistence/segmented_head.js";
import type {SegmentedCut} from "../persistence/segmented_contract.js";
import {participantAuthority} from "../participant_backup/policy.js";
import {checkAssetBytesSignal} from "../asset_bytes/guards.js";
import {generationIdentity,generationFields,freezeGeneration} from "../generation_source/identity.js";
import {checkGenerationRecords} from "../generation_source/validate_records.js";
import {SharedGenerationParticipantBackup} from "./backup.js";
import {generationParticipantSelection,generationParticipantFailure as fail} from "./policy.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedGenerationParticipantResumeOptions,SharedGenerationRecoveryFactory} from "./recovery_contract.js";
import type {SharedGenerationParticipantSelection} from './contract.js';
import type {GenerationRecoveryRecord} from "./recovery_database.js";
export interface PreparedGenerationRecovery<P extends SharedSelectionPolicy>{options:SharedGenerationParticipantResumeOptions<P>;session:SharedGenerationRecoveryFactory<P>;record:GenerationRecoveryRecord;backup:SharedGenerationParticipantBackup;cut:SegmentedCut;predecessor?:SegmentedCut;guard:()=>void}
export const generationRecoveryName=(name:unknown):string=>{if(typeof name!=="string"||!name||name.length>200)throw fail("generation_participant_policy");return name;};
export function snapshotGenerationRecovery<P extends SharedSelectionPolicy>(input:SharedGenerationParticipantResumeOptions<P>,begin:boolean):{options:SharedGenerationParticipantResumeOptions<P>;record:GenerationRecoveryRecord;guard:()=>void}{
 if(!input||typeof input!=="object"||Object.keys(input).some(k=>!["database","expected","destinations","session","checkAuthority","signal","limits",...(begin?["backup"]:[])].includes(k)))throw fail("generation_participant_policy");
 const database=generationRecoveryName(input.database),expected=generationParticipantSelection(input.expected),d=input.destinations;if(!generationFields(d,"source,uploads"))throw fail("generation_participant_policy");const destinations={source:generationRecoveryName(d.source),uploads:generationRecoveryName(d.uploads)};if(new Set([database,destinations.source,destinations.uploads]).size!==3)throw fail("generation_participant_policy");
 const session=snapshotGenerationRecoveryFactory(expected,input.session);
 const options={database,expected,destinations:freezeGeneration(destinations),session,checkAuthority:input.checkAuthority,...(input.signal?{signal:input.signal}:{}),...(input.limits?{limits:{...input.limits}}:{})},authority=participantAuthority(input.checkAuthority),guard=()=>{checkAssetBytesSignal(options.signal);authority();};guard();
 const plan=JSON.stringify({format:"breditor/shared-generation-participant-plan",formatVersion:1,expected,destinations,kind:session.kind});if(new TextEncoder().encode(plan).length>128*1024)throw fail("generation_participant_policy");return{options,guard,record:{format:"breditor/shared-generation-participant-recovery",formatVersion:1,plan,phase:"preparing",source:"reserved",uploads:"reserved"}};
}
export function snapshotGenerationRecoveryFactory<P extends SharedSelectionPolicy>(
 expected:SharedGenerationParticipantSelection,selected:SharedGenerationRecoveryFactory<P>,
):SharedGenerationRecoveryFactory<P>{
 if(!generationFields(selected,"kind,options")||selected.kind!==expected.identity.source.kind)throw fail("generation_participant_policy");const o=selected.options;
 const local=selected.kind==="local"||selected.kind==="continued-local";
 const factory=selected.kind==="continued-local"?"profile":"restoreSegmented";
 const allowed=["room","writer","richLanguage","history","rangeEditing","selectionEditing","searchHistory","reviewedHistory","readOnly",factory,"review","editor","onError","onState",...(!local?["binding"]:[]),...(selected.kind==="retained"?["retained"]:[])];
 const required=["room","writer","richLanguage","history","rangeEditing","selectionEditing","searchHistory","reviewedHistory","readOnly",factory,...(!local?["binding"]:[]),...(selected.kind==="retained"?["retained"]:[])];
 if(!o||Object.keys(o).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(o,k))||(selected.kind==="continued-local"?typeof selected.options.profile?.restore_continued_history!=="function"||typeof selected.options.profile.restore_segmented!=="function":typeof selected.options.restoreSegmented!=="function")||typeof o.readOnly!=="boolean"||o.review&&!["read_only","comment","moderate"].includes(o.review.access))throw fail("generation_participant_policy");
 const extra=o as typeof o&{binding?:unknown;retained?:unknown},identity=generationIdentity({kind:selected.kind,native:{room:o.room,writer:o.writer,richLanguage:o.richLanguage,history:o.history,rangeEditing:o.rangeEditing,selectionEditing:o.selectionEditing,searchHistory:o.searchHistory,reviewedHistory:o.reviewedHistory},review:o.review?{actor:o.review.actor,principal:o.review.principal}:null,relay:local?null:extra.binding,retained:selected.kind==="retained"?extra.retained:null});
 if(JSON.stringify(identity)!==JSON.stringify(expected.identity.source)||identity.relay?.review?.reviewEditing==="read_only"&&o.review?.access!=="read_only")throw fail("generation_participant_policy");
 const session={kind:selected.kind,options:inheritActorLeaseInput(o,{...o,...structuredClone(identity.native),...(o.review?{review:{...o.review}}:{}),...(o.editor?{editor:{...o.editor}}:{}),...(identity.relay?{binding:structuredClone(identity.relay)}:{}),...(identity.retained?{retained:structuredClone(identity.retained)}:{})})} as SharedGenerationRecoveryFactory<P>;
 return session;
}
export async function prepareGenerationRecovery<P extends SharedSelectionPolicy>(base:ReturnType<typeof snapshotGenerationRecovery<P>>,file:Blob):Promise<PreparedGenerationRecovery<P>>{
 const {options,guard,record}=base;guard();let backup:SharedGenerationParticipantBackup|undefined,complete=false;try{backup=await SharedGenerationParticipantBackup.read(file,options.expected,{...(options.signal?{signal:options.signal}:{}),...(options.limits?{limits:options.limits}:{})});guard();const cuts=await prepareGenerationRecoveryCuts(options.expected,backup,guard);
  complete=true;return {options,session:options.session,record,backup,...cuts,guard};
 }finally{if(!complete)backup?.dispose();}
}

const records=SharedGenerationParticipantBackup.prototype.records;
export async function prepareGenerationRecoveryCuts(
 expected:SharedGenerationParticipantSelection,backup:SharedGenerationParticipantBackup,guard:()=>void,
):Promise<Pick<PreparedGenerationRecovery<SharedSelectionPolicy>,'cut'|'predecessor'>>{
 const id=expected.identity.source,admitted=checkGenerationRecords(id,records.call(backup)),r=admitted.source;
 const review=(checkpoint:string|null)=>id.review?{...id.review,checkpoint:checkpoint!}:null;
 if(admitted.recovery.format==='breditor/shared-continued-history-backup'){
  const previous=admitted.recovery.predecessor;
  const predecessor=await makeSegmentedCut(previous.checkpoint,id.native,review(previous.reviewCheckpoint),previous.versions);
  guard();
  const cut=await makeGenerationCut(r.checkpoint,id.native,review(r.reviewCheckpoint),r.versions,2);
  guard();return {cut,predecessor};
 }
 const local=await makeSegmentedCut(r.checkpoint,id.native,review(r.reviewCheckpoint),r.versions);guard();
 const companion=admitted.companion;
 return {cut:companion?{head:companion.wrap(JSON.parse(local.head),companion.capture()),files:local.files}:local};
}
