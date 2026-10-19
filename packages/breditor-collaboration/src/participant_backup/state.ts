import type {RichAssetArchive} from "@breditor/experimental-rich-content";
import type {SharedAssetBytesArchive} from "../asset_bytes/read_backup.js";
import type {ParticipantHeader} from "./format.js";
import type {SharedParticipantBackupSelection} from "./types.js";
export interface ParticipantState {file:Blob;header:ParticipantHeader;selection:SharedParticipantBackupSelection;selected:SharedAssetBytesArchive;uploads:RichAssetArchive}
