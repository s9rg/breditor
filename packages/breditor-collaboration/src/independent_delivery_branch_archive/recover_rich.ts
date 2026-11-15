/** Recover formatting, structure and selected image bytes as an ordinary review proposal. */
import {assetBytesKey} from '../asset_bytes/guards.js';
import {SharedRichEditor} from '../core.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import type {
 SharedRecoveredBranchRichSuggestion,
 SharedRecoveredBranchRichSuggestionOptions,
 SharedRecoveredBranchSuggestionAsset,
} from './contract.js';
import {prepareRecoveredSuggestion} from './recovered_suggestion_source.js';

const {readReviewClipboard,planSuggestionClipboard}=SharedRichEditor.prototype;
const {metadata,blob}=SharedIndependentDeliveryParticipantBackup.prototype;

/** Prepare selected rich content and return the verified bytes for each new image binding. */
export function prepareSharedRecoveredBranchRichSuggestion(
 options:SharedRecoveredBranchRichSuggestionOptions,
):Promise<SharedRecoveredBranchRichSuggestion>{
 return prepareRecoveredSuggestion(options,'sourceSelection',context=>{
  const captured=readReviewClipboard.call(context.core,context.source.anchorJson);
  if(captured.kind!=='copied')throw new Error('Select retained content with a complete native clipboard');
  const {richJson,plainText}=captured.clipboard;
  const plan=planSuggestionClipboard.call(context.target,context.targetRange,richJson,context.namespace,context.revision);
  const original=new Map(metadata.call(context.backup).bindings.map(binding=>[assetBytesKey(binding.asset,binding.generation),binding]));
  const assets=plan.assets.map(({source,target}):SharedRecoveredBranchSuggestionAsset=>{
   const binding=original.get(assetBytesKey(source.asset,source.generation));
   const bytes=blob.call(context.backup,source.asset,source.generation);
   if(!binding||!bytes)throw new Error('Retain exact original bytes for every proposed image');
   return Object.freeze({source:Object.freeze(source),target:Object.freeze(target),
    contentAsset:binding.contentAsset,blob:bytes});
  });
  return Object.freeze({packet:context.capture(plan.draft),plainText,source:context.source,assets:Object.freeze(assets)});
 });
}
