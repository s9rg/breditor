/** Complete retained data, never an incoming source owner, approval receipt or
 * writer grant. A durable handoff must independently bind the exact selection
 * and re-admit native continuation before exposing an editable successor. */
import type {PhysicalOperationV3Record} from '../physical_room_operation_v3/record.js';
import type {PhysicalOperationV3HistoryRead} from '../physical_room_operation_v3/history_read_contract.js';
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
import type {RecordPayloadFamily,SourceRecordPayload} from '../operation_read/record_payload.js';
export interface PhysicalRoomRecordCutRoot{readonly operationDatabase:string;readonly catalogDatabase:string;readonly record:PhysicalOperationV3Record;readonly files:readonly Readonly<{name:string;file:Blob}>[]}
export interface PhysicalRoomRecordCutParticipant{readonly id:string;readonly family:RecordPayloadFamily;readonly payload:SourceRecordPayload}
export interface PhysicalRoomRecordCutCapture{readonly root:PhysicalRoomRecordCutRoot;readonly history:PhysicalOperationV3HistoryRead;readonly participants:readonly PhysicalRoomRecordCutParticipant[];readonly uploads:readonly Readonly<{id:string;family:RecordPayloadFamily;file:Blob}>[]}
export interface PhysicalRoomRecordCutSelection{readonly format:'breditor/physical-room-record-cut-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface PhysicalRoomRecordCutFile{readonly selection:PhysicalRoomRecordCutSelection;readonly file:Blob}
export interface PhysicalRoomRecordCutMetadata{readonly format:'breditor/physical-room-record-cut';readonly formatVersion:1;readonly scope:'complete-selected-client-payloads-and-literal-room-inputs';readonly selection:PhysicalRoomRecordCutSelection;readonly operationDatabase:string;readonly catalogDatabase:string;readonly catalog:PhysicalRoomCatalogV3Selection;readonly participants:readonly Readonly<{id:string;family:RecordPayloadFamily;inputFiles:number}>[];readonly unreconciledParticipants:readonly string[];readonly catalogFiles:number;readonly archiveEntries:number}
