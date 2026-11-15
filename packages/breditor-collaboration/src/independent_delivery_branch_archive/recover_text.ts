/** Project explicitly selected archived plain text into the ordinary native proposal workflow. */
import {SharedRichEditor} from '../core.js';
import type {SharedRecoveredBranchTextSuggestion,SharedRecoveredBranchTextSuggestionOptions} from './contract.js';
import {prepareRecoveredSuggestion} from './recovered_suggestion_source.js';

const {readReviewQuote,planSuggestionGeneralText}=SharedRichEditor.prototype;

/** Capture an ordinary unpublished native text proposal at a fresh selected target. */
export function prepareSharedRecoveredBranchTextSuggestion(
 options:SharedRecoveredBranchTextSuggestionOptions,
):Promise<SharedRecoveredBranchTextSuggestion>{
 return prepareRecoveredSuggestion(options,'sourceRange',context=>{
  const quote=readReviewQuote.call(context.core,context.source.anchorJson);
  if(quote.kind!=='quoted'||quote.plainText.length===0)throw new Error('Select retained text with a complete native quote');
  const draft=planSuggestionGeneralText.call(context.target,context.targetRange,
   [{text:quote.plainText,formatsJson:'[]'}],context.namespace,context.revision);
  return Object.freeze({packet:context.capture(draft),plainText:quote.plainText,source:context.source});
 });
}
