/** Counters and receipts are admitted against the actual retained native owners, not final text. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {SharedRelayError,checkClock,groupMetadata,transportVersion} from "../relay/validation.js";
import {sameReceipt} from "../relay/review_validation.js";
import type {SharedSegmentedRelayProgress} from "./contract.js";
export function admitRelayProgress<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,progress:SharedSegmentedRelayProgress):void {
 const version=transportVersion(progress.binding.document.writerTransport),d=progress.document;
 if(core.segmentedHistoryPolicy()!=="segmented-v1")throw new SharedRelayError("segmented_relay_source");
 if(d.accepted)checkClock(core,d.accepted,version);
 if(d.receipt){const r=d.receipt.receipt,groups=version===2?core.writerGroupsV2(r.from):core.writerGroups(r.from),first=groups.groups[0];if(!first)throw new SharedRelayError("receipt_mismatch");const g=groupMetadata(first,version);checkClock(core,{writer:r.writer,through:r.through,prefixDigest:r.prefixDigest},version);if(g.writer!==r.writer||g.from!==r.from||g.through!==r.through||g.groupDigest!==r.groupDigest)throw new SharedRelayError("receipt_mismatch");}
 const binding=progress.binding.review,review=progress.review;
 if(binding&&review){const a=review.accepted;if(a){const local=core.reviewWriterClock(binding.actor,binding.principal);if(BigInt(a.through)>BigInt(local.through)||core.reviewWriterClock(binding.actor,binding.principal,a.through).prefixDigest!==a.prefixDigest)throw new SharedRelayError("review_history_fork");}
  if(progress.reviewReceipt){const r=progress.reviewReceipt.receipt,frame=core.exportReviewThrough((BigInt(r.from)-1n).toString(),r.through),expected=core.retainedReviewReceipt(frame,{actor:binding.actor,principal:binding.principal,access:"read_only"});if(!sameReceipt(expected,r))throw new SharedRelayError("receipt_mismatch");}
 }
}
