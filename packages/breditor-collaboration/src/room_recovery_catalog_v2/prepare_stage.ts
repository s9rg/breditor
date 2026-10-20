/** Host-selected factories and initial readonly policy. No factory or credential comes from the manifest. */
import {prepareRecovery} from "../participant_recovery/prepare.js";
import {snapshotCatalogParticipant,type StagedPolicy} from "../room_recovery_catalog/prepare_stage.js";
import {stagedReadOnlyFactory} from "../native_restore_factory.js";
import {snapshotGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import type {SharedGenerationParticipantRecoveryOptions} from "../generation_participant/recovery_contract.js";
import type {SharedSelectionPolicy} from "../types.js";
import {id,object,failure} from "../room_recovery_catalog/policy.js";
import {MAX_CATALOG_V2_PLAN_BYTES} from "./record.js";
import type {CatalogV2ArchiveState} from "./archive.js";
import type {SharedRoomRecoveryCatalogV2Participant} from "./contract.js";
export type V2StagedPolicy=Readonly<{id:string;family:"original";value:StagedPolicy}>|Readonly<{id:string;family:"generation";options:SharedGenerationParticipantRecoveryOptions<SharedSelectionPolicy>;plan:string}>;
function snapshot(input:SharedRoomRecoveryCatalogV2Participant):SharedRoomRecoveryCatalogV2Participant{
 object(input,"family,id,recovery");if(input.family==="original")return{...snapshotCatalogParticipant({id:input.id,recovery:input.recovery}),family:"original"};
 if(input.family!=="generation")throw failure("catalog_policy");
 const chosen=input.recovery;if(!chosen||typeof chosen!=="object"||!chosen.session||!chosen.session.options)throw failure("catalog_policy");
 const o=chosen.session.options,extra=o as typeof o&{binding?:unknown;retained?:unknown};return{id:id(input.id),family:"generation",recovery:{...chosen,destinations:{...chosen.destinations},session:{kind:chosen.session.kind,options:{...o,readOnly:true,...(o.review?{review:{...o.review,access:"read_only"}}:{}),...(o.editor?{editor:{...o.editor}}:{}),...(extra.binding!==undefined?{binding:structuredClone(extra.binding)}:{}),...(extra.retained!==undefined?{retained:structuredClone(extra.retained)}:{})}} as typeof chosen.session,...(chosen.limits?{limits:{...chosen.limits}}:{})}};
}
export async function prepareCatalogV2Stage(input:readonly SharedRoomRecoveryCatalogV2Participant[],state:CatalogV2ArchiveState,database:string,guard:()=>void,signal?:AbortSignal):Promise<{plan:string;policies:V2StagedPolicy[]}>{
 if(!Array.isArray(input)||input.length>1024)throw failure("catalog_policy");const rows=input.map(snapshot).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),names=new Set([database]),writers=new Set<string>(),actors=new Set<string>(),policies:V2StagedPolicy[]=[];
 for(const[index,row]of rows.entries()){
  if(index&&row.id===rows[index-1]!.id)throw failure("catalog_policy");const saved=state.participants.get(row.id);if(!saved||saved.family!==row.family)throw failure("catalog_policy");
  const identity=saved.backup.selection().identity,source=identity.source,native="native" in source?source.native:source,metadata=state.inventory.metadata(),registered=metadata.writers.find(w=>w.clock.writer===native.writer);
  if(native.room!==metadata.room.document||native.richLanguage!==metadata.richLanguage||!registered||registered.principal!==identity.principal||writers.has(native.writer))throw failure("catalog_source");writers.add(native.writer);
  let policy:V2StagedPolicy;
  if(row.family==="generation"){
   if(saved.family!=="generation")throw failure("catalog_policy");const backup=saved.backup,options:SharedGenerationParticipantRecoveryOptions<SharedSelectionPolicy>={...row.recovery,backup,expected:backup.selection(),checkAuthority:guard,...(signal?{signal}:{})},base=snapshotGenerationRecovery(options,true);policy={id:row.id,family:"generation",options:{...base.options,backup},plan:base.record.plan};
  }else{
   if(saved.family!=="original")throw failure("catalog_policy");const chosen=row.recovery,kind=chosen.session.kind,key=kind==="document-selection"?"restoreDocument":kind==="search-document"||kind==="search-paired"?"restoreSearch":kind==="reviewed-paired"?"restoreReviewed":"restore",o={...chosen.session.options} as unknown as Record<string,unknown>,restore=o[key];if(typeof restore!=="function")throw failure("catalog_policy");o[key]=stagedReadOnlyFactory(restore,o,guard);if("review" in o)o["review"]={...o["review"] as Record<string,unknown>,access:"read_only"};
   const options={...chosen,backup:saved.backup,expected:saved.backup.selection(),session:{kind,options:o},checkAuthority:guard,...(signal?{signal}:{})} as StagedPolicy["options"],prepared=await prepareRecovery(options);policy={id:row.id,family:"original",value:{id:row.id,options,prepared}};
  }
  guard();const options=policy.family==="generation"?policy.options:policy.value.options;
  for(const name of [options.database,...Object.values(options.destinations)]){if(names.has(name))throw failure("catalog_policy");names.add(name);}
  const o=options.session.options as unknown as Record<string,unknown>,review=o["review"] as {actor?:unknown}|undefined;
  if(review){if(typeof review.actor!=="string"||actors.has(review.actor))throw failure("catalog_source");actors.add(review.actor);}
  policies.push(policy);
 }
 const plan=JSON.stringify({participants:policies.map(row=>({id:row.id,family:row.family,plan:row.family==="generation"?row.plan:row.value.prepared.record.plan}))});if(new TextEncoder().encode(plan).length>MAX_CATALOG_V2_PLAN_BYTES)throw failure("catalog_budget");return{plan,policies};
}
