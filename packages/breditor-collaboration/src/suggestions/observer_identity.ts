import {object,secret} from "../relay/validation.js";
import {keys,queueIdentity} from "./validation.js";
import type {SharedSuggestionObserverIdentity} from "./observer_types.js";
import type {SharedSuggestionQueueIdentity} from "./types.js";
export function observerIdentity(input:SharedSuggestionObserverIdentity):SharedSuggestionObserverIdentity {
 const value=object(input);keys(value,"binding,documentWriter,effectWriter,endpoint,observerCredential,principal,room,writerTransport");
 const {observerCredential,...rest}=value;
 return {...queueIdentity(rest as unknown as SharedSuggestionQueueIdentity),observerCredential:secret(observerCredential)};
}
/** Detached nonsecret queue key only. It cannot authenticate an observer or acquire a lease. */
export function sharedSuggestionObserverQueueIdentity(input:SharedSuggestionObserverIdentity):SharedSuggestionQueueIdentity {
 const {observerCredential,...rest}=observerIdentity(input);return rest;
}
