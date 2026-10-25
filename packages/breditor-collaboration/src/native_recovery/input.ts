/** Native import inputs are detached under the actual reservation. Accessors
 * never execute and callback inspection cannot release exclusion mid-import. */
import type {SharedReviewPolicy} from '../review_types.js';
import {nativeRecoveryFailure as fail} from './policy.js';
export function nativeRecoveryFrame(value:unknown):Readonly<{value:string;bytes:number}>{if(typeof value!=='string')throw fail();const bytes=new TextEncoder().encode(value).length;if(bytes>5*1024*1024)throw fail();return{value,bytes};}
export function nativeRecoverySource(value:unknown):SharedReviewPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail();const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(keys.length!==3||keys.some(key=>key!=='actor'&&key!=='principal'&&key!=='access'))throw fail();
 const values:Record<string,unknown>={};for(const key of['actor','principal','access']){const field=descriptors[key];if(!field||!('value'in field))throw fail();values[key]=field.value;}
 const actor=values['actor'],principal=values['principal'],access=values['access'];if(typeof actor!=='string'||typeof principal!=='string'||actor.length>128||principal.length>128||access!=='comment'&&access!=='moderate'&&access!=='read_only')throw fail();
 return{actor,principal,access};
}
