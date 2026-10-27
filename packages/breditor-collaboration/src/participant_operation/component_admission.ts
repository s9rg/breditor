/** Private per-call selection. No serialized option can request operational store adoption. */
const admitted=new WeakSet<object>(),completed=new WeakSet<object>();
export function withOperationalComponent<T extends object>(options:T):T{const copy={...options};admitted.add(copy);return copy;}
export const isOperationalComponent=(options:object):boolean=>admitted.has(options);

/** Explicit SDK existing-component inspection. Normal adapter startup persists
 * as before; no saved record or caller field can request this private route. */
export function withCompletedOperationalComponent<T extends object>(options:T):T{const copy=withOperationalComponent(options);completed.add(copy);return copy;}
export const isCompletedOperationalComponent=(options:object):boolean=>completed.has(options);
