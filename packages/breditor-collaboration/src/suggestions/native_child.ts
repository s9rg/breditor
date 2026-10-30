/** Private child of the exact live suggestion delivery, sharing its one original
 * queue reservation. A structural copy never supplies this constructor lease. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedSuggestionQueue} from './queue.js';
import type {SuggestionSyncQueue} from './sync_queue.js';
import type {SharedSuggestionTransport} from './transport_port.js';
import type {NativeRelayDelivery,NativeRelayDeliveryPort} from '../relay/native_delivery.js';
export interface NativeSuggestionChild<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 readonly originalQueue:SharedSuggestionQueue<P>;readonly queue:SuggestionSyncQueue<P>;
 readonly transport:SharedSuggestionTransport<P>;readonly delivery:NativeRelayDelivery;readonly port:NativeRelayDeliveryPort;
 check():void;install(stop:()=>void,wait:()=>Promise<void>):void;release():void;
}
