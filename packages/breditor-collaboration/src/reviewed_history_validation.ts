import type {SharedReviewedHistoryIdentity} from "./reviewed_history_types.js";
/** Exact nonsecret option validation only. Native replay and authenticated host policy remain required. */
export function reviewedHistoryIdentity(input:SharedReviewedHistoryIdentity):SharedReviewedHistoryIdentity {
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="binding,effectWriter,principal")throw new TypeError("Expected closed reviewed-history identity");
 const {binding,principal,effectWriter}=input;
 if(typeof binding!=="string"||!/^[a-f0-9]{64}$/.test(binding)||typeof principal!=="string"||!principal.trim()||new TextEncoder().encode(principal).length>256||/[\u0000-\u001f\u007f-\u009f]/u.test(principal)||typeof effectWriter!=="string"||!/^[1-9][0-9]{0,19}$/.test(effectWriter)||BigInt(effectWriter)>18446744073709551614n)throw new TypeError("Invalid reviewed-history identity");
 return {binding,principal,effectWriter};
}
export function sameReviewedHistory(a:SharedReviewedHistoryIdentity,b:SharedReviewedHistoryIdentity):boolean {return a.binding===b.binding&&a.principal===b.principal&&a.effectWriter===b.effectWriter;}
