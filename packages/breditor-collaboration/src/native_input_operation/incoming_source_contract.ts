/** Private incoming-provenance relation. An unchanged imported file may precede
 * later LIVE edits; it is not required to be a same-point source export. This
 * contract borrows actual native history only, never writer/upload custody. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import type {IndependentLocalOperationBackup} from '../independent_local_operation/portable_backup.js';
import type {FlatLocalArchive} from '../flat_local_operation/archive.js';

export type NativeInputIncomingArchive =
 |Readonly<{kind:'snapshot-v1';backup:IndependentLocalOperationBackup}>
 |Readonly<{kind:'flat-local-v1';backup:FlatLocalArchive}>;

/** Executable read policy is independently selected on every capture. The
 * archive cannot select factories, reuse writer grants or activate a peer. */
export interface NativeInputIncomingSourceOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationReadOptions<P>{
 readonly source:SharedIndependentHistoryPersistentSession<P>;
 readonly input:NativeInputIncomingArchive;
}
