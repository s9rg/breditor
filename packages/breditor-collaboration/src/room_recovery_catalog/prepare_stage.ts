import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {prepareRecovery,type PreparedRecovery} from "../participant_recovery/prepare.js";
import {stagedReadOnlyFactory} from "../native_restore_factory.js";
import type {SharedParticipantRecoveryOptions} from "../participant_recovery/types.js";
import type {SharedSelectionPolicy} from "../types.js";
import {id,object,failure,known} from "./policy.js";
import {MAX_CATALOG_PLAN_BYTES} from "./storage.js";
import type {CatalogArchiveState} from "./archive.js";
import type {SharedRoomRecoveryCatalogParticipant} from "./types.js";
export interface StagedPolicy {readonly id:string;readonly options:SharedParticipantRecoveryOptions<SharedSelectionPolicy>;readonly prepared:PreparedRecovery<SharedSelectionPolicy>}
/** Snapshot all nonsecret policy values before awaiting; ports/functions remain explicit trusted host code. */
export function snapshotCatalogParticipant(input:SharedRoomRecoveryCatalogParticipant):SharedRoomRecoveryCatalogParticipant {
 const r=object(input,"id,recovery"),raw=r["recovery"] as SharedRoomRecoveryCatalogParticipant["recovery"];
 if(!raw||typeof raw!=="object"||!raw.session||!raw.destinations)throw failure("catalog_policy");
 const o=raw.session.options as unknown as Record<string,unknown>,copy={...o};
 for(const key of ["review","relay","reviewedHistory","editor"])if(o[key]&&typeof o[key]==="object")copy[key]={...o[key] as Record<string,unknown>};
 return{id:id(r["id"]),recovery:{...raw,destinations:{...raw.destinations},session:{kind:raw.session.kind,options:inheritActorLeaseInput(o,copy)} as SharedRoomRecoveryCatalogParticipant["recovery"]["session"],...(raw.suggestions?{suggestions:{...raw.suggestions,identity:{...raw.suggestions.identity}}}:{}),...(raw.revisions?{revisions:{...raw.revisions}}:{}),...(raw.versions?{versions:{...raw.versions,identity:{...raw.versions.identity}}}:{}),...(raw.limits?{limits:{...raw.limits}}:{})}};
}
/** No executable factory, authority callback or credential is read from the durable plan. */
export async function prepareStage(input:readonly SharedRoomRecoveryCatalogParticipant[],archive:CatalogArchiveState,database:string,guard:()=>void,signal?:AbortSignal):Promise<{plan:string;policies:StagedPolicy[]}>{
 if(!Array.isArray(input)||input.length>1024)throw failure("catalog_policy");const rows=input.map(snapshotCatalogParticipant).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),names=new Set([database]),writers=new Set<string>(),policies:StagedPolicy[]=[];
 for(let index=0;index<rows.length;index++){
  const row=rows[index]!;if(index&&row.id===rows[index-1]!.id)throw failure("catalog_policy");const backup=archive.participants.get(row.id);if(!backup)throw failure("catalog_policy");
  const identity=backup.selection().identity,native=archive.inventory.metadata(),registration=native.writers.find(w=>w.clock.writer===identity.source.writer);
  if(identity.source.room!==native.room.document||identity.source.richLanguage!==native.richLanguage||!registration||registration.principal!==identity.principal)throw failure("catalog_source");
  if(writers.has(identity.source.writer))throw failure("catalog_source");writers.add(identity.source.writer);
  const chosen=row.recovery,kind=chosen.session.kind,key=kind==="document-selection"?"restoreDocument":kind==="search-document"||kind==="search-paired"?"restoreSearch":kind==="reviewed-paired"?"restoreReviewed":"restore",o={...chosen.session.options} as unknown as Record<string,unknown>,restore=o[key];
  if(typeof restore!=="function")throw failure("catalog_policy");
  inheritActorLeaseInput(chosen.session.options,o);o[key]=stagedReadOnlyFactory(restore,o,guard);
  if("review" in o)o["review"]={...o["review"] as Record<string,unknown>,access:"read_only"};
  const options={...chosen,backup,expected:backup.selection(),session:{kind,options:o},checkAuthority:guard,...(signal?{signal}:{})} as SharedParticipantRecoveryOptions<SharedSelectionPolicy>;
  for(const name of [options.database,...Object.values(options.destinations)]){if(names.has(name))throw failure("catalog_policy");names.add(name);}
  guard();try{const prepared=await prepareRecovery(options);guard();policies.push({id:row.id,options,prepared});}catch(error){throw known(error,"catalog_policy");}
 }
 const plan=JSON.stringify({participants:policies.map(row=>({id:row.id,plan:row.prepared.record.plan}))});if(new TextEncoder().encode(plan).length>MAX_CATALOG_PLAN_BYTES)throw failure("catalog_budget");return{plan,policies};
}
