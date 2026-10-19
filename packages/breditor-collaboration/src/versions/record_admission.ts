/** Pure original immutable packet/receipt admission; opens no cache and saves no source. */
import {SharedRelayError} from "../relay/validation.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import type {RetainedVersionPacket,SharedVersionCatalogRecord} from "./types.js";
import {sameEntry,sameInfo} from "./validation.js";
export interface AdmittedVersionRecord{info:SharedDocumentVersionInfo;value:RetainedVersionPacket}
export function admitVersionRecord<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,record:SharedVersionCatalogRecord):Map<string,AdmittedVersionRecord>{
 const result=new Map<string,AdmittedVersionRecord>();
 for(const value of record.packets){const info=core.readVersion(value.packet);if(result.has(info.id))throw new SharedRelayError("version_cache_duplicate");
  const source=core.verifyVersionSource(value.packet);if(value.origin==="local"&&(info.author!==record.identity.principal||source.kind!=="verified"))throw new SharedRelayError("version_local_source_missing");
  if(value.accepted){if(!sameInfo(value.accepted.version,info))throw new SharedRelayError("version_receipt_mismatch");const listed=record.catalog?.entries.find(entry=>entry.version.id===info.id);if(listed&&!sameEntry(listed,value.accepted)||record.catalog&&BigInt(record.catalog.through)>=BigInt(value.accepted.sequence)&&!listed)throw new SharedRelayError("version_cache_acceptance");}
  result.set(info.id,{info,value});
 }return result;
}
