/** Join independent delivery registers; never add a receipt or derive a server acknowledgement. */
import{relayProgress,forwardProgress}from'../segmented_relay/validation.js';
import type{SharedSegmentedRelayProgress as Progress}from'../segmented_relay/contract.js';
import{unionFailure as fail}from'./policy.js';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function furthest<T>(a:T|null,b:T|null,counter:(value:T)=>string):T|null{
 if(!a)return b;if(!b)return a;const left=BigInt(counter(a)),right=BigInt(counter(b));if(left===right&&!same(a,b))throw fail('independent_delivery_union_relay_conflict');return left>=right?a:b;
}
export function unionDeliveryRelay(a:Progress,b:Progress):Progress{
 if(!same(a.binding,b.binding)||!a.review||!b.review)throw fail('independent_delivery_union_identity');
 const document={accepted:furthest(a.document.accepted,b.document.accepted,v=>v.through),receipt:furthest(a.document.receipt,b.document.receipt,v=>v.sequence)};
 const accepted=furthest(a.review.accepted,b.review.accepted,v=>v.through),receipt=furthest(a.reviewReceipt,b.reviewReceipt,v=>v.sequence),cursor=furthest(a.review.cursor,b.review.cursor,v=>v.after);
 // A known sequence for an accepted prefix cannot be erased by a null copy.
 // Different non-null sequences at the same prefix conflict via forwardProgress.
 const sequence=accepted===null?null:a.review.accepted?.through===accepted.through&&a.review.sequence!==null?a.review.sequence:b.review.accepted?.through===accepted.through?b.review.sequence:null;
 const result:Progress={binding:a.binding,document,review:{accepted,cursor,sequence},reviewReceipt:receipt};
 // Reject inconsistent cross-copy receipt order before accepting the joined shape.
 forwardProgress(a,result);forwardProgress(b,result);return relayProgress(result,a.binding);
}
