import {forwardNativeRelayDelivery} from '../relay/native_delivery.js';
/** Explicit permanent-observer transport over actual generation custody; never an author fallback. */
import {SharedSuggestionObserverRelay} from "../suggestions/observer_relay.js";
import type {SharedSuggestionObserverOptions} from "../suggestions/observer_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSegmentedRelaySession} from "./session.js";
import {SharedRelayError} from "../relay/validation.js";
import {segmentedRelaySessionPort,withSegmentedObserverPort} from "./admission.js";
export type SharedSegmentedSuggestionObserverOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSuggestionObserverOptions<P>,"storage">;
export function createSharedSegmentedSuggestionObserverRelay<P extends SharedSelectionPolicy>(session:SharedSegmentedRelaySession<P>,input:SharedSegmentedSuggestionObserverOptions<P>):SharedSuggestionObserverRelay<P>{
 const port=segmentedRelaySessionPort(session);for(const key of ["storage","persistLocal","selectionEditing"])if(key in input)throw new SharedRelayError("segmented_observer_factory_policy");
 const options=withSegmentedObserverPort({...input,storage:session},port);forwardNativeRelayDelivery(input,options);const observer=new SharedSuggestionObserverRelay<P>(options);
 try{port.track(observer);return observer;}catch(error){observer.dispose();throw error;}
}
