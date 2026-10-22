/** Dedicated local-only errors/names. No destructive repair or migration. */
import {SharedEditorError} from '../core.js';
export const independentRecoveryFailure=(code='independent_recovery_storage')=>new SharedEditorError(code,'Recover the exact local participant, both native histories and original pixels under current policy without overwriting work');
export function independentRecoveryName(value:unknown):string{if(typeof value!=='string'||!value||value.length>200)throw independentRecoveryFailure('independent_recovery_policy');return value;}
export function independentRecoveryFields(input:unknown,required:readonly string[],optional:readonly string[]=[]):void{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>![...required,...optional].includes(key))||required.some(key=>!Object.hasOwn(input,key)))throw independentRecoveryFailure('independent_recovery_policy');
}
