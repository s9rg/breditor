/** Dedicated recovery errors and names; no migration or destructive repair is implicit. */
import {SharedEditorError} from '../core.js';
export const independentDeliveryRecoveryFailure=(code='independent_delivery_recovery_storage')=>new SharedEditorError(code,'Recover the exact complete delivery participant under current host policy without overwriting retained work');
export function independentDeliveryRecoveryName(value:unknown):string{if(typeof value!=='string'||!value||value.length>200)throw independentDeliveryRecoveryFailure('independent_delivery_recovery_policy');return value;}
