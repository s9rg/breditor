import {reserveFreshIndependentLocalHistoryRead,type OperationalIndependentLocalParticipant} from '../../../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {reserveFreshIndependentDeliveryHistoryRead,type OperationalIndependentDeliveryParticipant} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {reserveFreshRestoredDeliveryHistoryRead,type RestoredOperationParticipant} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {reserveFreshSnapshotLocalHistoryRead,type OperationalRestoredLocalParticipant} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {reserveFreshFlatLocalHistoryRead,type OperationalFlatLocalParticipant} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import type {FreshLocalParentHistoryOptions} from '../../../packages/breditor-collaboration/dist/independent_local_operation/fresh_parent_history.js';
import type {FreshDeliveryParentHistoryOptions} from '../../../packages/breditor-collaboration/dist/independent_operation/fresh_parent_history.js';
declare const local:OperationalIndependentLocalParticipant<'document-v1'>,delivery:OperationalIndependentDeliveryParticipant<'document-v1'>,graph:RestoredOperationParticipant<'document-v1'>,snapshot:OperationalRestoredLocalParticipant<'document-v1'>,flat:OperationalFlatLocalParticipant<'document-v1'>,localRead:FreshLocalParentHistoryOptions<'document-v1'>,deliveryRead:FreshDeliveryParentHistoryOptions<'document-v1'>;
const readers=[reserveFreshIndependentLocalHistoryRead(local,localRead,()=>{}),reserveFreshIndependentDeliveryHistoryRead(delivery,deliveryRead,()=>{}),reserveFreshRestoredDeliveryHistoryRead(graph,deliveryRead,()=>{}),reserveFreshSnapshotLocalHistoryRead(snapshot,localRead,()=>{}),reserveFreshFlatLocalHistoryRead(flat,localRead,()=>{})];
for(const read of readers){await read.prepare();await read.verify();read.check();read.checkCurrent();const metadata=read.metadata();read.close();
 // @ts-expect-error Opaque reader never exposes a mutable native owner.
 read.source;
 // @ts-expect-error Opaque reader cannot transfer writer/upload custody.
 read.intoParts();
 // @ts-expect-error Historical reference metadata is immutable.
 metadata.references.push({asset:'replace',generation:'replace'});
 // @ts-expect-error No detached metadata can manufacture private parent custody.
 reserveFreshIndependentLocalHistoryRead(metadata,localRead,()=>{});
}
// @ts-expect-error Wrong genuine family is not interchangeable.
reserveFreshIndependentLocalHistoryRead(delivery,localRead,()=>{});
// @ts-expect-error No caller-selected child source projections.
reserveFreshIndependentDeliveryHistoryRead(delivery,{...deliveryRead,source:delivery},()=>{});
// @ts-expect-error The grant belongs to this read, not its factory options.
reserveFreshSnapshotLocalHistoryRead(snapshot,{...localRead,checkAuthority(){}},()=>{});
