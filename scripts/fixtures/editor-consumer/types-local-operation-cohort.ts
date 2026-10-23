/** Private local group: policy and distinct original/input provider contracts. */
import type {SharedRichEditor} from '@breditor/collaboration';
import {reserveOperationalIndependentLocalGroup,type OperationalIndependentLocalParticipant} from '../../../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import type {OperationalFlatLocalParticipant} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {handoffLocalOperationCohort} from '../../../packages/breditor-collaboration/dist/local_operation_cohort/cohort.js';
declare const local:OperationalIndependentLocalParticipant<'document-v1'>;
declare const flat:OperationalFlatLocalParticipant<'document-v1'>;
function exactPolicy(){const group=reserveOperationalIndependentLocalGroup([local]);const core:SharedRichEditor<'document-v1'>=group.states[0]!.source.session.core;const original:Blob=group.states[0]!.original.file();void core;void original;
 // @ts-expect-error Legacy originals are not relabelled snapshot/flat inputs.
 void group.states[0]!.input;
}
void exactPolicy;
// @ts-expect-error A saved marker cannot supply genuine legacy custody.
void reserveOperationalIndependentLocalGroup([{ready:true}]);
// @ts-expect-error An actual flat parent is still the wrong operational family.
void reserveOperationalIndependentLocalGroup([flat]);
async function families(){const output=await handoffLocalOperationCohort([{id:'old',family:'independent-local',operation:local},{id:'flat',family:'local-operation-flat',operation:flat}]);for(const row of output.participants){const core:SharedRichEditor<'document-v1'>=row.parts.source.session.core;void core;if(row.family==='independent-local'){const file:Blob=row.parts.original.file();void file;
 // @ts-expect-error Original provider is not a relabelled local-input provider.
 void row.parts.input;
 }else{const file:Blob=row.parts.input.file();void file;
 // @ts-expect-error Snapshot/flat input is not relabelled as an original archive.
 void row.parts.original;
 }}}
void families;
// @ts-expect-error A genuine flat owner cannot be named as the legacy family.
void handoffLocalOperationCohort([{id:'fake',family:'independent-local',operation:flat}]);
