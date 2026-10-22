/** Canonical genuine complete local archive methods, captured before public
 * facade replacement. The original stays owned through actual handoff. */
import {SharedIndependentParticipantBackup as Owner} from '../independent_participant/backup.js';
export const independentRecoveryArchive=Object.freeze({read:Owner.read,file:Owner.prototype.file,metadata:Owner.prototype.metadata,records:Owner.prototype.records,recovery:Owner.prototype.sourceRecovery,blob:Owner.prototype.blob,uploadBackup:Owner.prototype.uploadBackup,verifySource:Owner.prototype.verifySource,verifyRecovered:Owner.prototype.verifyRecovered,dispose:Owner.prototype.dispose});
