import type {ParticipantOrigin} from "./origin.js";
/** Private per-call native admission. No executable hook is read from saved metadata/options. */
const admissions=new WeakMap<object,ParticipantOrigin>();
export function withRecoveryOrigin<T extends object>(options:T,origin:ParticipantOrigin):T{const copy={...options};admissions.set(copy,origin);return copy;}
export function recoveryOriginFor(options:object):ParticipantOrigin|undefined{return admissions.get(options);}
export function inheritRecoveryOrigin<T extends object>(from:object,to:T):T{const origin=admissions.get(from);if(origin)admissions.set(to,origin);return to;}
