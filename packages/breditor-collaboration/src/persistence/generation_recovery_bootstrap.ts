import type {ExactHistoryRows} from '../independent_history/exact_destination.js';

/** Private custody of the exact initial generation cut during room recovery. */
export interface GenerationRecoveryBootstrap {
 readonly rows:ExactHistoryRows;
 readonly check:()=>void;
 readonly signal?:AbortSignal;
}
const selected=new WeakMap<object,GenerationRecoveryBootstrap>();
export function withGenerationRecoveryBootstrap<T extends object>(input:T,scope:GenerationRecoveryBootstrap):T{
 selected.set(input,scope);
 return input;
}
export function inheritGenerationRecoveryBootstrap<T extends object>(from:object,to:T):T{
 const scope=selected.get(from);
 if(scope)selected.set(to,scope);
 return to;
}
export const generationRecoveryBootstrap=(input:object)=>selected.get(input);
