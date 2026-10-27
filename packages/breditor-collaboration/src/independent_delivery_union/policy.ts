/** Union policy is separate from ordinary exact-origin recovery and storage formats. */
import{SharedEditorError}from'../core.js';
export const unionFailure=(code='independent_delivery_union')=>new SharedEditorError(code,'Prepare compatible complete delivery histories without discarding either original');
/** Closed own DATA fields. Accessors, symbols and extra selectors never run. */
export function unionFields(input:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw unionFailure();
 const descriptors=Object.getOwnPropertyDescriptors(input),names=Reflect.ownKeys(descriptors),allowed=[...required,...optional];
 if(names.some(name=>typeof name!=='string'||!allowed.includes(name))||required.some(name=>!Object.hasOwn(descriptors,name)))throw unionFailure();
 const out:Record<string,unknown>={};for(const name of names){const d=descriptors[name as string]!;if(!('value'in d))throw unionFailure();out[name as string]=d.value;}return out;
}
