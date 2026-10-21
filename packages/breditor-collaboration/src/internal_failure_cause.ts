/** Private diagnostic custody, not part of public error fields or root exports.
 * Keeping an Error cause performs no caller property reads or callbacks. Weak
 * keys release the chain with its mapped error; arbitrary thrown payloads are
 * not retained. Nothing is logged automatically in production. */
const causes=new WeakMap<Error,Error>();
export function retainInternalFailureCause<T extends Error>(mapped:T,cause:unknown):T{if(cause instanceof Error&&cause!==mapped)causes.set(mapped,cause);return mapped;}
/** Explicit internal test diagnostics only. Cycles and excessive nesting stop. */
export function internalFailureChain(error:unknown):readonly Error[]{const out:Error[]=[],seen=new Set<Error>();let current=error;while(current instanceof Error&&!seen.has(current)&&out.length<32){seen.add(current);out.push(current);current=causes.get(current);}return Object.freeze(out);}
