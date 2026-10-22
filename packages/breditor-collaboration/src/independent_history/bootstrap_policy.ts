/** Private scoped policy for the first actual native read/create/replay/save.
 * It is not selected by serialized fields and does not invent a delivery binding.
 * Once bootstrap succeeds, ordinary source policy and operation guards remain
 * responsible for later writes; the completed recovery grant is not retained. */
const selected=new WeakMap<object,()=>void>();
export function withIndependentBootstrapPolicy<T extends object>(input:T,check:()=>void):T{
 check();const copy={...input};selected.set(copy,check);return copy;
}
/** Explicit internal forwarding across the delivery facade's option snapshot. */
export function forwardIndependentBootstrapPolicy<T extends object>(from:object,to:T):T{
 const check=selected.get(from);if(check){check();selected.set(to,check);}return to;
}
export function independentBootstrapPolicy(input:object):(()=>void)|undefined{return selected.get(input);}
