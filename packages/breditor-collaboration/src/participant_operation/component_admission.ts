/** Private per-call selection. No serialized option can request operational store adoption. */
const admitted=new WeakSet<object>();
export function withOperationalComponent<T extends object>(options:T):T{const copy={...options};admitted.add(copy);return copy;}
export const isOperationalComponent=(options:object):boolean=>admitted.has(options);
