/** Complete selected storage DATA at original names. Runtime actors, writer
 * grants and activation are never deserialized. Normal cold constructors and
 * fresh native/editing/delivery admission remain separate mandatory steps. */
import type {SelectedRoomCurrentFile,SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
export interface StorageSelection{readonly format:'breditor/selected-room-storage-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface StorageFile{readonly selection:StorageSelection;readonly file:Blob}
export type StorageRowSelection=Readonly<{kind:'whole'}>|Readonly<{kind:'prefix';prefix:readonly[string,string]}>|Readonly<{kind:'keys';keys:readonly IDBValidKey[]}>;
export interface StorageDatabasePlan{readonly database:string;readonly stores:readonly string[];readonly selection:StorageRowSelection}
export interface StorageIndex{readonly name:string;readonly keyPath:string|readonly string[];readonly unique:boolean;readonly multiEntry:boolean}
export interface StorageStore{readonly name:string;readonly keyPath:string|readonly string[]|null;readonly autoIncrement:false;readonly indexes:readonly StorageIndex[];readonly keys:readonly IDBValidKey[];readonly values:readonly unknown[]}
export interface StorageDatabase{readonly database:string;readonly version:1;readonly stores:readonly StorageStore[]}
export interface StorageContent{readonly format:'breditor/selected-room-storage-content';readonly formatVersion:1;readonly current:SelectedRoomCurrentFile;readonly localReview:LocalReviewRoomBundle|null;readonly databases:readonly StorageDatabase[]}
export interface StorageDestination{readonly database:string;readonly kind:'absent'|'missing'|'partial'|'identical';readonly present:number;readonly missing:number;readonly sha256:string}
export interface StorageRestoreChoice{readonly format:'breditor/selected-room-storage-restore';readonly formatVersion:1;readonly archive:StorageSelection;readonly current:SelectedRoomCurrentSelection;readonly destinations:readonly StorageDestination[]}
export interface StorageRestoreResult{readonly format:'breditor/selected-room-storage-restored';readonly formatVersion:1;readonly choice:StorageRestoreChoice}
