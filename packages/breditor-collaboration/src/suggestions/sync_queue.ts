/** Narrow transport dependency. This shape alone supplies no native, source,
 * storage, server or recovery authority. Normal public constructors stay nominal. */
import type {SharedSuggestionQueue} from './queue.js';import type {SharedSelectionPolicy} from '../types.js';
export type SuggestionSyncQueue<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Pick<SharedSuggestionQueue<P>,'core'|'identity'|'state'|'proposals'|'packet'|'status'|'subscribe'|'flush'|'retry'|'receiveVerifiedPublication'|'receiveVerifiedDecision'|'cacheVerifiedProposal'>;
