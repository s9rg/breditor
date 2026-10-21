/** One canonical policy derivation, shared by actual local and delivery factories. */
import {canonicalIndependentHistoryIdentity} from './cut.js';
import type {SharedIndependentHistorySessionOptions,IndependentHistoryIdentity} from './contract.js';
export function independentOptionsIdentity(input:SharedIndependentHistorySessionOptions):IndependentHistoryIdentity{
 return canonicalIndependentHistoryIdentity({native:{room:input.room,writer:input.writer,richLanguage:input.richLanguage,history:input.history,rangeEditing:input.rangeEditing,selectionEditing:input.selectionEditing,searchHistory:input.searchHistory,reviewedHistory:input.reviewedHistory},documentHistory:input.documentHistory.kind,reviewHistory:input.reviewHistory.kind,review:{actor:input.review.actor,principal:input.review.principal}});
}
