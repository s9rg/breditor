/** One local reservation across a queue and every attached delivery/outbox adapter.
 * This is not a server grant or writer lease. Checks run with the reservation held,
 * so authority callbacks cannot reenter attachment, mutation, or network entry points. */
import {SharedRelayError} from "../relay/validation.js";
interface State {held:boolean;checks:Set<()=>void>}
const states=new WeakMap<object,State>();
const state=(queue:object):State=>{let value=states.get(queue);if(!value){value={held:false,checks:new Set()};states.set(queue,value);}return value;};
export function checkSuggestionRecoveryIdle(queue:object):void{if(state(queue).held)throw new SharedRelayError("suggestion_recovery_in_use");}
export function registerSuggestionRecoveryParticipant(queue:object,check:()=>void):()=>void{
 checkSuggestionRecoveryIdle(queue);const value=state(queue);value.checks.add(check);return()=>{value.checks.delete(check);};
}
export function reserveSuggestionRecovery(queue:object):()=>void{
 checkSuggestionRecoveryIdle(queue);const value=state(queue);value.held=true;
 try{for(const check of value.checks)check();}catch(error){value.held=false;throw error;}
 let released=false;return()=>{if(!released){released=true;value.held=false;}};
}
