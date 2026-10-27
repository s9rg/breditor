/** Complete native output queues, not a projection of current image references.
 * The caller has independently admitted the actual seven-family archive. */
import {physicalCatalogV3ArchiveState,type PhysicalRoomCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {RestoredOperationGraphArchive} from '../restored_graph/archive.js';
import {FlatLocalArchive} from '../flat_local_operation/archive.js';
import {fail} from './policy.js';
const methods={original:SharedParticipantBackup.prototype.uploadBackup,generation:SharedGenerationParticipantBackup.prototype.uploadBackup,'independent-local':SharedIndependentParticipantBackup.prototype.uploadBackup,'independent-delivery':SharedIndependentDeliveryParticipantBackup.prototype.uploadBackup,'restored-graph':RestoredOperationGraphArchive.prototype.uploadBackup,'local-operation-flat':FlatLocalArchive.prototype.uploads};
export function preparedNativeUploads(catalog:PhysicalRoomCatalogV3Archive,id:string):Blob{const row=physicalCatalogV3ArchiveState(catalog).clients.get(id);if(!row||row.family==='local-operation-snapshot')throw fail('room_execution_policy');const read=methods[row.family] as (this:object)=>Blob;return read.call(row.backup);}
