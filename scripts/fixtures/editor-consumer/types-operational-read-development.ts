/** Private read scopes retain the exact caller selection contract and expose
 * no transfer/consume operation. No current permission is inferred from data. */
import {reserveDeliveryOperationRead} from '../../../packages/breditor-collaboration/dist/delivery_operation_cohort/read.js';
import {reserveIndependentLocalRead,OperationalIndependentLocalParticipant} from '../../../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalIndependentDeliveryParticipant} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {RestoredOperationParticipant} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {OperationalRestoredLocalParticipant} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {borrowCompleteNativeRead} from '../../../packages/breditor-collaboration/dist/complete_operation_cohort/native_read.js';
declare const local:OperationalIndependentLocalParticipant<'document-v1'>;
declare const delivery:OperationalIndependentDeliveryParticipant<'document-v1'>;
declare const graph:RestoredOperationParticipant<'document-v1'>;
declare const snapshot:OperationalRestoredLocalParticipant<'document-v1'>;
declare const flat:OperationalFlatLocalParticipant<'document-v1'>;
const read=reserveDeliveryOperationRead([
 {id:'local',family:'independent-local',operation:local},
 {id:'delivery',family:'independent-delivery',operation:delivery},
 {id:'graph',family:'restored-graph',operation:graph},
 {id:'snapshot',family:'local-operation-snapshot',operation:snapshot},
 {id:'flat',family:'local-operation-flat',operation:flat},
]);
async function inspect(){
 await read.prepare();
 for(const row of read.states){const policy:'document-v1'=row.parts.source.session.core.selectionPolicy();void policy;}
 await read.verify();read.checkCurrent();read.close();
}
void inspect;
// @ts-expect-error A read reservation cannot release/consume participant ownership.
read.consume();
// @ts-expect-error A read reservation is not a prepared handoff.
read.commit();
// @ts-expect-error An arbitrary row or saved readiness marker is not a genuine parent.
reserveIndependentLocalRead([{ready:true}]);
// @ts-expect-error Wrong concrete family cannot supply a local native parent.
reserveIndependentLocalRead([delivery]);
// @ts-expect-error Read states cannot be replaced with DTOs or family aliases.
read.states=[];
const native=borrowCompleteNativeRead([{id:'local',family:'independent-local',operation:local}]);
async function nativeInspection(){await native.prepare();for(const row of native.participants){row.native.document.writerClock('101');
 // @ts-expect-error A borrowed native reader is not an editing owner.
 row.native.document.type('not an edit capability');
 }await native.verify();native.checkCurrent();await native.close();}
void nativeInspection;
// @ts-expect-error Native inspection cannot consume or transfer any participant.
native.consume();
