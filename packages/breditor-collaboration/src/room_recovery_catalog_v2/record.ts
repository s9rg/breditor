/** Durable intent only. Actual native/file verification is required on every stage/reopen. */
import {object,id,failure} from "../room_recovery_catalog/policy.js";
import {parseCatalogV2Manifest} from "./manifest.js";
export const MAX_CATALOG_V2_PLAN_BYTES=257*1024*1024;
export interface CatalogV2Progress {readonly phase:"retained"|"staging"|"checked";readonly participants:readonly Readonly<{id:string;state:"reserved"|"started"|"complete"}>[]}
export interface CatalogV2Record extends CatalogV2Progress{readonly format:"breditor/shared-room-recovery-state";readonly formatVersion:2;readonly manifest:string;readonly plan:string|null}
export const initialCatalogV2Record=(manifest:string):CatalogV2Record=>({format:"breditor/shared-room-recovery-state",formatVersion:2,manifest,plan:null,phase:"retained",participants:[]});
export function checkCatalogV2Record(input:unknown,manifest?:string):CatalogV2Record{
 try{
  const r=object(input,"format,formatVersion,manifest,participants,phase,plan") as unknown as CatalogV2Record,m=parseCatalogV2Manifest(r.manifest);
  if(r.format!=="breditor/shared-room-recovery-state"||r.formatVersion!==2||manifest!==undefined&&r.manifest!==manifest||!Array.isArray(r.participants)||r.participants.length>1024||!["retained","staging","checked"].includes(r.phase))throw failure("catalog_diverged");
  if(r.plan===null){if(r.phase!=="retained"||r.participants.length)throw failure("catalog_diverged");}
  else{
   if(typeof r.plan!=="string"||r.plan.length>MAX_CATALOG_V2_PLAN_BYTES||new TextEncoder().encode(r.plan).length>MAX_CATALOG_V2_PLAN_BYTES||r.phase==="retained")throw failure("catalog_diverged");
   const plan=object(JSON.parse(r.plan),"participants");if(!Array.isArray(plan["participants"])||plan["participants"].length!==r.participants.length)throw failure("catalog_diverged");
   let tail=false,previous="";for(let at=0;at<r.participants.length;at++){
    const row=object(r.participants[at],"id,state"),chosen=object(plan["participants"][at],"family,id,plan"),entry=id(row["id"]),selected=m.participants.find(p=>p.id===entry),state=row["state"];
    if(entry<=previous||!selected||chosen["id"]!==entry||chosen["family"]!==selected.family||typeof chosen["plan"]!=="string"||new TextEncoder().encode(chosen["plan"]).length>(selected.family==="generation"?128:64)*1024||typeof state!=="string"||!["reserved","started","complete"].includes(state)||tail&&state!=="reserved")throw failure("catalog_diverged");
    previous=entry;if(state!=="complete")tail=true;
   }
   if(r.phase==="checked"&&r.participants.some(row=>row.state!=="complete"))throw failure("catalog_diverged");
  }
  return structuredClone(r);
 }catch{throw failure("catalog_diverged");}
}
