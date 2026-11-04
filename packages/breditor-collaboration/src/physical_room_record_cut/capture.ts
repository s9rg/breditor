/** Internal complete-data encoder. The genuine root holds/re-admits sources
 * before and after this work. This encoder itself never manufactures custody. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {PhysicalRoomRecordCutCapture,PhysicalRoomRecordCutFile} from './contract.js';
import type {RecordCutEntry,RecordCutManifest} from './manifest.js';
import {readRecordCutManifest} from './manifest.js';
import {prepareRecordCutCapture} from './prepare_capture.js';
import {recordCutJson} from './json.js';
import {recordCutPrefix,ROOM_RECORD_CUT_MIME} from './framing.js';
import {fail,MAX_ROOM_RECORD_CUT_BYTES,MAX_ROOM_RECORD_CUT_HEADER_BYTES} from './policy.js';
export async function encodePhysicalRoomRecordCut(input:PhysicalRoomRecordCutCapture,context:Pick<ArchiveIntegrityContext,'guard'|'digest'>):Promise<PhysicalRoomRecordCutFile>{
 const plan=prepareRecordCutCapture(input);context.guard();const entries:RecordCutEntry[]=[],files:Blob[]=[];
 for(const row of plan.entries){context.guard();const sha256=await context.digest(row.file);context.guard();entries.push({kind:row.kind,bytes:row.file.size,mime:row.file.type,sha256});files.push(row.file);}
 const manifest:RecordCutManifest={format:'breditor/physical-room-record-cut',formatVersion:1,root:plan.root,history:plan.history,catalog:plan.catalog,participants:plan.participants,entries},header=recordCutJson(manifest,MAX_ROOM_RECORD_CUT_HEADER_BYTES);readRecordCutManifest(header);const bytes=new TextEncoder().encode(header),file=new Blob([recordCutPrefix(bytes.length),bytes,...files],{type:ROOM_RECORD_CUT_MIME});if(file.size>MAX_ROOM_RECORD_CUT_BYTES)throw fail('record_cut_budget');const sha256=await context.digest(file);context.guard();return Object.freeze({selection:frozen({format:'breditor/physical-room-record-cut-selection' as const,formatVersion:1 as const,bytes:file.size,sha256}),file});
}
