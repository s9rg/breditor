/** The public error keeps optional readonly numerical read observations. */
import type {SharedArchiveIntegrityError,SharedArchiveReadLengthFailure} from '../../../packages/breditor-collaboration/dist/index.js';
declare const error:SharedArchiveIntegrityError;
const observation:SharedArchiveReadLengthFailure|undefined=error.readFailure;
if(observation){
 const kind:'read-length'=observation.kind;
 const values:readonly number[]=[observation.offset,observation.expectedBytes,observation.observedBeforeAuthorityBytes,observation.actualBytes];
 // @ts-expect-error An observation is immutable, not a mutable recovery command.
 observation.actualBytes=1;
 void kind;void values;
}
