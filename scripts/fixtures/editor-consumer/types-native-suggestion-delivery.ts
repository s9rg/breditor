/** Native queue execution remains private, nominal and explicitly opt-in. */
import * as api from '@breditor/collaboration';
import {createNativeSuggestionDelivery,type NativeSuggestionDelivery} from '../../../packages/breditor-collaboration/dist/suggestions/native_delivery.js';
import type {NativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import type {SharedSuggestionTransport} from '../../../packages/breditor-collaboration/dist/suggestions/transport_port.js';
declare const queue:api.SharedSuggestionQueue<'document-v1'>,transport:SharedSuggestionTransport<'document-v1'>,context:NativeRelayDelivery;
const delivery:NativeSuggestionDelivery=createNativeSuggestionDelivery(queue,transport,context,{onState(state){const status:string=state.status;void status;}});
const closed:Promise<void>=delivery.close(),loaded:Promise<string>=delivery.loadSuggestion('digest');
// @ts-expect-error No ordinary public root factory grants native recovery execution.
api.createNativeSuggestionDelivery(queue,transport,context);
// @ts-expect-error A saved record cannot replace its original constructor-owned queue.
createNativeSuggestionDelivery(queue.exportRecovery(),transport,context);
// @ts-expect-error No automatic start may precede explicit current composition.
createNativeSuggestionDelivery(queue,transport,context,{autoStart:true});
// @ts-expect-error The original source cannot be replaced through execution options.
createNativeSuggestionDelivery(queue,transport,context,{storage:{core:queue.core}});
// @ts-expect-error Credentials remain on the genuine selected document/observer transport.
createNativeSuggestionDelivery(queue,transport,context,{getToken:()=>''});
// @ts-expect-error A structural queue view is not the nominal ordinary constructor contract.
new api.SharedSuggestionSync({core:queue.core,identity:()=>queue.identity()},transport);
void closed;void loaded;
