/** Create the entire selected backup in one upgrade transaction, only at an absent name. */
import {SharedEditorError} from "../core.js";
import type {SegmentedCut} from "./segmented_contract.js";

export function createContinuedDatabase(
 factory:IDBFactory,name:string,key:readonly [string,string],cut:SegmentedCut,predecessor:string,check:()=>void,
):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,1);
  let created=false,blocked=false,failure:unknown;
  request.onblocked=()=>{blocked=true;reject(new SharedEditorError("continued_history_destination_exists","The restore destination is in use"));};
  request.onupgradeneeded=event=>{
   try{
    check();
    if(blocked||event.oldVersion!==0)throw new SharedEditorError("continued_history_destination_exists","Use an absent restore destination");
    const db=request.result;
    const files=db.createObjectStore("generation_files");
    const heads=db.createObjectStore("generation_heads");
    for(const file of cut.files)files.add(JSON.stringify(file),[...key,file.generation]);
    heads.add(predecessor,[...key,"continued-from"]);
    heads.add(cut.head,[...key]);
    created=true;
   }catch(error){failure=error;request.transaction!.abort();}
  };
  request.onerror=()=>reject(failure??request.error??new SharedEditorError("continued_history_storage","The restore transaction did not complete"));
  request.onsuccess=()=>{
   const db=request.result;
   if(blocked||!created){
    db.close();
    reject(new SharedEditorError("continued_history_destination_exists","Use an absent restore destination"));
    return;
   }
   try{check();resolve(db);}catch(error){db.close();reject(error);}
  };
 });
}
