/** Detach a dense data-only member list before the callback-free common barrier.
 * The 4096-member ceiling covers the existing physical catalog file ceiling.
 * No metadata, getter result or repeated core becomes another participant. */
import {nativeRecoveryFailure as fail} from './policy.js';
export function nativeRecoveryMembers(input:unknown):readonly unknown[]{
 if(!Array.isArray(input))throw fail();const descriptors=Object.getOwnPropertyDescriptors(input as object),length=descriptors['length'];if(!length||!('value'in length))throw fail();const count:unknown=length.value;
 if(typeof count!=='number'||!Number.isSafeInteger(count)||count<1||count>4096||Reflect.ownKeys(descriptors).length!==count+1)throw fail();
 const members:unknown[]=[];for(let index=0;index<count;index++){const row=descriptors[String(index)];if(!row||!('value'in row)||members.includes(row.value))throw fail();members.push(row.value);}return members;
}
