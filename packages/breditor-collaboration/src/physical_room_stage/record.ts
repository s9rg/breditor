/** Durable intent only. Complete markers never manufacture native owners or activation authority. */
import {object,id,databaseName} from "../room_recovery_catalog/policy.js";
import {physicalCatalogSelection} from "../physical_room_catalog/policy.js";
import {parsePhysicalCatalogManifest} from "../physical_room_catalog/manifest.js";
import type {SharedPhysicalRoomRecoveryCatalogSelection} from "../physical_room_catalog/contract.js";
import {physicalStageFailure as fail,MAX_PHYSICAL_ROOM_STAGE_PARTICIPANTS,MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES} from "./policy.js";
export interface PhysicalStageRecord {
 readonly format:"breditor/shared-physical-room-participant-stage";readonly formatVersion:1;
 readonly catalogDatabase:string;readonly catalog:SharedPhysicalRoomRecoveryCatalogSelection;readonly manifest:string;
 readonly plan:string|null;readonly phase:"retained"|"staging"|"staged";
 readonly participants:readonly Readonly<{id:string;state:"reserved"|"started"|"complete"}>[];
}
export interface PhysicalStageSource {readonly database:string;readonly manifest:string;readonly selection:SharedPhysicalRoomRecoveryCatalogSelection}
export function initialPhysicalStageRecord(source:PhysicalStageSource):PhysicalStageRecord{return checkPhysicalStageRecord({format:"breditor/shared-physical-room-participant-stage",formatVersion:1,catalogDatabase:source.database,catalog:source.selection,manifest:source.manifest,plan:null,phase:"retained",participants:[]},source);}
export function checkPhysicalStageRecord(input:unknown,source?:PhysicalStageSource):PhysicalStageRecord{
 try{
  const r=object(input,"catalog,catalogDatabase,format,formatVersion,manifest,participants,phase,plan") as unknown as PhysicalStageRecord,metadata=parsePhysicalCatalogManifest(r.manifest),selection=physicalCatalogSelection(r.catalog);
  if(r.format!=="breditor/shared-physical-room-participant-stage"||r.formatVersion!==1||metadata.catalog!==selection.catalog||databaseName(r.catalogDatabase)!==r.catalogDatabase||!["retained","staging","staged"].includes(r.phase)||!Array.isArray(r.participants)||r.participants.length>MAX_PHYSICAL_ROOM_STAGE_PARTICIPANTS)throw fail("physical_stage_diverged");
  if(source&&(r.catalogDatabase!==source.database||r.manifest!==source.manifest||JSON.stringify(selection)!==JSON.stringify(source.selection)))throw fail("physical_stage_diverged");
  if(r.plan===null){if(r.phase!=="retained"||r.participants.length)throw fail("physical_stage_diverged");}
  else{
   if(typeof r.plan!=="string"||r.plan.length>MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES||new TextEncoder().encode(r.plan).length>MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES||r.phase==="retained")throw fail("physical_stage_diverged");
   const plan=object(JSON.parse(r.plan),"participants");if(!Array.isArray(plan["participants"])||plan["participants"].length!==r.participants.length)throw fail("physical_stage_diverged");
   let tail=false,previous="";const canonical=[];
   for(const[at,value]of r.participants.entries()){
    const row=object(value,"id,state"),chosen=object(plan["participants"][at],"family,id,plan"),entry=id(row["id"]),selected=metadata.participants.find(p=>p.id===entry),state=row["state"];
    if(entry<=previous||!selected||chosen["id"]!==entry||chosen["family"]!==selected.family||typeof chosen["plan"]!=="string"||new TextEncoder().encode(chosen["plan"]).length>(selected.family==="generation"?128:64)*1024||typeof state!=="string"||!["reserved","started","complete"].includes(state)||tail&&state!=="reserved")throw fail("physical_stage_diverged");
    canonical.push({id:entry,family:selected.family,plan:chosen["plan"]});previous=entry;if(state!=="complete")tail=true;
   }
   if(JSON.stringify({participants:canonical})!==r.plan||r.phase==="staged"&&r.participants.some(row=>row.state!=="complete"))throw fail("physical_stage_diverged");
  }
  return structuredClone(r);
 }catch{throw fail("physical_stage_diverged");}
}
/** Every write advances one native child, or the final phase, under an exact compare-and-set. */
export function checkPhysicalStageTransition(before:PhysicalStageRecord,next:PhysicalStageRecord):void{
 const source={database:before.catalogDatabase,manifest:before.manifest,selection:before.catalog};checkPhysicalStageRecord(before,source);checkPhysicalStageRecord(next,source);
 if(before.plan===null){if(next.plan===null||next.phase!=="staging"||next.participants.some(row=>row.state!=="reserved"))throw fail("physical_stage_diverged");return;}
 if(before.plan!==next.plan||before.phase==="staged"||next.participants.length!==before.participants.length)throw fail("physical_stage_diverged");
 if(next.phase!==before.phase){if(before.phase!=="staging"||next.phase!=="staged"||JSON.stringify(before.participants)!==JSON.stringify(next.participants))throw fail("physical_stage_diverged");return;}
 const at=before.participants.findIndex(row=>row.state!=="complete");if(at<0)throw fail("physical_stage_diverged");
 for(const[index,row]of before.participants.entries()){const after=next.participants[index]!;if(row.id!==after.id||index!==at&&row.state!==after.state||index===at&&(row.state==="reserved"?after.state!=="started":row.state!=="started"||after.state!=="complete"))throw fail("physical_stage_diverged");}
}
