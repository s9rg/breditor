/** Module-initialized canonical reads keep mutable public facades out of custody decisions. */
import {SharedIndependentDeliveryParticipantBackup as Owner} from '../independent_delivery_participant/backup.js';
export const deliveryRecoveryArchive=Object.freeze({
 read:Owner.read,file:Owner.prototype.file,metadata:Owner.prototype.metadata,records:Owner.prototype.records,recovery:Owner.prototype.sourceRecovery,
 uploadBackup:Owner.prototype.uploadBackup,uploadEntries:Owner.prototype.uploadEntries,
 verifySource:Owner.prototype.verifySource,verifyRecovered:Owner.prototype.verifyRecovered,dispose:Owner.prototype.dispose,
});
