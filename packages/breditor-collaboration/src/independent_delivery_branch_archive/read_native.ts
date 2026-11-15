/** Hold one privately restored exact archive under the caller's current read policy. */
import type {SharedRichEditor} from '../core.js';
import {SharedIndependentDeliveryParticipantBackup as Participant} from '../independent_delivery_participant/backup.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryBranchArchiveReadOptions, SharedIndependentDeliveryBranchFile} from './contract.js';
import {BranchArchiveScope} from './scope.js';

const participantRead = Participant.read;
const {sourceRecovery, dispose} = Participant.prototype;

export async function withArchivedBranch<T>(
  source: SharedIndependentDeliveryBranchFile,
  options: SharedIndependentDeliveryBranchArchiveReadOptions,
  inspect: (core: SharedRichEditor<SharedSelectionPolicy>, backup: Participant) => T,
  checkTarget = () => {},
): Promise<T> {
  const scope = new BranchArchiveScope(options);
  const check = () => { scope.check(); checkTarget(); };
  try {
    check();
    const backup = await participantRead.call(Participant, source.file, source.selection, {
      signal: scope.signal, limits: scope.limits,
    });
    try {
      check();
      const selected = await replayPortableRecovery(scope.session(source.selection.identity.source), sourceRecovery.call(backup), check);
      try {
        selected.check();
        const result = inspect(selected.core, backup);
        selected.check();
        return result;
      } finally {
        selected.dispose();
      }
    } finally {
      dispose.call(backup);
    }
  } finally {
    scope.close();
  }
}
