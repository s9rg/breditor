/** Genuine local archive/native origin; no delivery family is used as a shim. */
import{localRecoveryOptions}from'../independent-recovery/session.mjs';
export async function localOperationOrigin(f,Origin,extra={}){const options=localRecoveryOptions(f.options,f.backup,f.tag);return Origin.read({backup:f.backup,expected:f.selection,session:options.session,checkAuthority(){},...extra});}
export function localOperationOptions(f,suffix='current'){return{...f.options,database:f.tag+'-'+suffix};}
