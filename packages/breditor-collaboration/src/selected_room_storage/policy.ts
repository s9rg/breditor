/** New bounded complete-storage family. Old native, component and archive
 * limits remain unchanged. Refusal never truncates history or replaces data. */
export const MAX_STORAGE_ARCHIVE_BYTES=1024*1024*1024;
export const MAX_STORAGE_HEADER_BYTES=16*1024*1024;
export const MAX_STORAGE_GRAPH_BYTES=256*1024*1024;
export const MAX_STORAGE_PIECES=65536;
export const MAX_STORAGE_DATABASES=16384;
export const MAX_STORAGE_RECORDS=16384;
export const MAX_STORAGE_NODES=1000000;
export class SelectedRoomStorageError extends Error{constructor(readonly code:string='room_storage_integrity'){super('Retain complete selected storage and native data without overwriting records or granting editing');this.name='SelectedRoomStorageError';}}
export const fail=(code='room_storage_integrity')=>new SelectedRoomStorageError(code);
export const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export {fields,integer,rows,hash} from '../physical_room_record_cut/policy.js';
