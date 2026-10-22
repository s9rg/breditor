import {SharedIndependentDeliverySession,type SharedIndependentDeliveryOptions} from '@breditor/collaboration';
// @ts-expect-error The durable source journal is a private operation-coordinator capability.
import {IndependentOperationCutJournal} from '@breditor/collaboration';
// @ts-expect-error Serialized/public options cannot select operational storage.
import {withOperationCutJournal} from '@breditor/collaboration';
// @ts-expect-error No incomplete operational participant API is promoted at the root.
import {openJournaledIndependentDelivery} from '@breditor/collaboration';
declare const options:SharedIndependentDeliveryOptions;
SharedIndependentDeliverySession.open(options);
// @ts-expect-error A public persistence facade cannot issue a genuine journal.
SharedIndependentDeliverySession.open({...options,persistence:{select(){},prepare(){},acknowledge(){}}});
// @ts-expect-error Neither a schema marker nor a cached ready flag selects the new private family.
SharedIndependentDeliverySession.open({...options,storage:'operation-v1',journal:{ready:true}});
