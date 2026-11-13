/** Copy only explicit read options without evaluating caller getters or allowing
 * caller-provided source/store selections to replace a held parent's children. */
import {SharedEditorError} from '../core.js';
export function parentReferenceOptions<T>(provided:T,restore:'restore'|'restoreSegmented'):T{
 const fail=()=>new SharedEditorError('operational_parent_reference_policy','Supply only the selected read factory, editor, independent read permission and cancellation');
 if(!provided||typeof provided!=='object'||Array.isArray(provided))throw fail();const values:Record<string,unknown>={},names=Object.keys(provided);if(names.some(n=>![restore,'editor','checkAuthority','signal',...(restore==='restoreSegmented'?['restoreContinued']:[])].includes(n))||[restore,'checkAuthority'].some(n=>!Object.hasOwn(provided,n)))throw fail();for(const name of names){const d=Object.getOwnPropertyDescriptor(provided,name);if(!d||!('value'in d))throw fail();values[name]=d.value;}if(typeof values[restore]!=='function'||typeof values['checkAuthority']!=='function'||values['restoreContinued']!==undefined&&typeof values['restoreContinued']!=='function')throw fail();return values as T;
}
