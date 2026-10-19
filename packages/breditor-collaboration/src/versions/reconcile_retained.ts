/** All-or-refuse local merge. No native edit, receipt fabrication, eviction or format upgrade. */
import {SharedRelayError} from "../relay/validation.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {checkCatalogRecord} from "./database.js";
import {admitVersionRecord} from "./record_admission.js";
import {sameEntry} from "./validation.js";
import type {SharedVersionCatalogRecord,VersionCatalogSnapshot,RetainedVersionPacket,SharedDocumentVersionEntry} from "./types.js";
import type {SharedRetainedVersionRecoveryResult} from "./reconcile_types.js";
const conflict=()=>new SharedRelayError("version_recovery_conflict");
function prefix(a:VersionCatalogSnapshot,b:VersionCatalogSnapshot):boolean{return BigInt(a.through)<=BigInt(b.through)&&a.entries.length<=b.entries.length&&a.entries.every((entry,i)=>sameEntry(entry,b.entries[i]!));}
function catalog(a:VersionCatalogSnapshot|null,b:VersionCatalogSnapshot|null):VersionCatalogSnapshot|null{if(!a)return b;if(!b)return a;if(prefix(a,b))return b;if(prefix(b,a))return a;throw conflict();}
function receipt(values:readonly (SharedDocumentVersionEntry|null|undefined)[]):SharedDocumentVersionEntry|null{let result:SharedDocumentVersionEntry|null=null;for(const value of values)if(value){if(result&&!sameEntry(result,value))throw conflict();result=value;}return result;}
/** Both exact records are admitted by the actual current native owner before any mutation. */
export function reconcileRetainedVersionRecord<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,before:SharedVersionCatalogRecord,input:SharedVersionCatalogRecord):{record:SharedVersionCatalogRecord;result:SharedRetainedVersionRecoveryResult}{
 const current=checkCatalogRecord(before,before.identity),source=checkCatalogRecord(input,current.identity),a=admitVersionRecord(core,current),b=admitVersionRecord(core,source),chosen=catalog(current.catalog,source.catalog),packets:RetainedVersionPacket[]=[];
 const sequences=new Map(chosen?.entries.map(entry=>[entry.sequence,entry.version.id]));let added=0,updated=0,unchanged=0;
 for(const id of new Set([...a.keys(),...b.keys()])){
  const left=a.get(id)?.value,right=b.get(id)?.value,value=left??right!,listed=chosen?.entries.find(entry=>entry.version.id===id);
  if(left&&right&&left.packet!==right.packet)throw conflict();const accepted=receipt([left?.accepted,right?.accepted,listed]);
  if(accepted){const prior=sequences.get(accepted.sequence);if(prior!==undefined&&prior!==id)throw conflict();sequences.set(accepted.sequence,id);}
  // Opposite retry choices have no cross-copy ordering. Preserve both original files
  // and refuse, rather than resurrecting cancellation or silently dropping an intent.
  if(!accepted&&left&&right&&left.publish!==right.publish)throw new SharedRelayError("version_recovery_intent_conflict");
  const merged:RetainedVersionPacket={packet:value.packet,origin:left?.origin==="local"||right?.origin==="local"?"local":"remote",publish:accepted?false:value.publish,accepted};packets.push(merged);
  if(!left)added++;else if(JSON.stringify(left)===JSON.stringify(merged))unchanged++;else updated++;
 }
 const record=checkCatalogRecord({...current,catalog:chosen,packets},current.identity);admitVersionRecord(core,record);
 return{record,result:Object.freeze({added,updated,unchanged,retained:packets.length,queued:packets.filter(p=>p.publish).length,accepted:packets.filter(p=>p.accepted!==null).length,catalogAdvanced:JSON.stringify(chosen)!==JSON.stringify(current.catalog)})};
}
