/** Complete snapshot-input local ownership. Current factories/permissions are
 * selected by the host; literal incoming files supply no activation grant. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {RestoredLocalInputOptions} from './policy.js';
export type RestoredLocalParticipantOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<RestoredLocalInputOptions<P>,'cohort'>&{
 readonly cohort:Readonly<{parentDatabase:string;uploadsDatabase:string}>;
};
export interface RestoredLocalParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly source:Readonly<{session:SharedIndependentHistoryPersistentSession<P>}>;
 readonly uploads:RichAssetStore;
 /** Literal imported provenance and provider pixels, not a new backup of the
  * editor's later current/pending work. The source owns this provider lifetime. */
 readonly input:Readonly<{file():Blob;blob(asset:string,generation:string):Blob|undefined}>;
}
