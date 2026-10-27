/** SDK-only existing-source admission. This per-call selection requests no
 * constructor autosave; it grants no actor, read permission or native owner. */
const selected=new WeakSet<object>();
export function completedSourceOpen<T extends object>(input:T):T{selected.add(input);return input;}
export const isCompletedSourceOpen=(input:object):boolean=>selected.has(input);
