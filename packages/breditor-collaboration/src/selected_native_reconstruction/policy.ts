/** Reconstruction is a new explicit data/operation family. No old record,
 * source-save acknowledgement, permission or activation meaning is widened. */
import {fields as checkedFields,identifier as checkedIdentifier} from '../selected_native_execution/policy.js';
export class NativeReconstructionError extends Error {
 constructor(readonly code:'native_reconstruction_policy'|'native_reconstruction_closed'|'native_reconstruction_aborted'|'native_reconstruction_integrity'|'native_reconstruction_requires_merge') {
  super('Reconstruct complete retained native sources without overwriting originals or granting activation');
  this.name='NativeReconstructionError';
 }
}
export const fail=(code:NativeReconstructionError['code']='native_reconstruction_integrity')=>new NativeReconstructionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown> {
 try{return checkedFields(value,required,optional);}catch{throw fail('native_reconstruction_policy');}
}
export function identifier(value:unknown):string {
 try{return checkedIdentifier(value);}catch{throw fail('native_reconstruction_policy');}
}
