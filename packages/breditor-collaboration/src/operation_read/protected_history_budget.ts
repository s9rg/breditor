/** Aggregate report ceiling, not an incoming metadata/custody admission API.
 * Count per-participant references even when addresses repeat across writers. */
import {SharedEditorError} from '../core.js';
export const MAX_PROTECTED_HISTORY_GROUP_REFERENCES=100000;
export const MAX_PROTECTED_HISTORY_GROUP_METADATA_BYTES=64*1024*1024;
export function protectedHistoryGroupBudget(){let references=0,bytes=0;return{add(metadata:{readonly references:readonly unknown[]}){const count=references+metadata.references.length;if(count>MAX_PROTECTED_HISTORY_GROUP_REFERENCES)throw fail();const length=new TextEncoder().encode(JSON.stringify(metadata)).byteLength;if(length>MAX_PROTECTED_HISTORY_GROUP_METADATA_BYTES-bytes)throw fail();references=count;bytes+=length;},counts(){return Object.freeze({references,bytes});}};}
const fail=()=>new SharedEditorError('protected_history_group_budget','Complete protected history report exceeds 100,000 per-participant references or 64 MiB; no report is truncated');
