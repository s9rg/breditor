/** Closed nonsecret metadata and monotonic delivery state. Native admission is separate. */
import {SharedRelayError,clock,counter,decimal,digest,endpoint,writer,object,transportVersion,string} from "../relay/validation.js";
import {reviewStorageIdentity,reviewProgress,reviewReceipt} from "../relay/review_validation.js";
import {MAX_SEGMENTED_RELAY_METADATA_BYTES,type SharedSegmentedRelayBinding,type SharedSegmentedRelayProgress,type SharedSegmentedDocumentReceipt} from "./contract.js";
const fail=()=>new SharedRelayError("segmented_relay_metadata");
export function closed(value:unknown,keys:string):Record<string,unknown>{const v=object(value);if(Object.keys(v).sort().join(",")!==keys)throw fail();return v;}
export function relayBinding(input:SharedSegmentedRelayBinding):SharedSegmentedRelayBinding {
 closed(input,"document,review");const d=input.document;
 closed(d,d.writerTransport===undefined?"endpoint,principal,room,writer":"endpoint,principal,room,writer,writerTransport");
 const principal=string(d.principal,128),room=string(d.room,200);
 if(!principal.trim()||!room||/[\u0000-\u001f\u007f-\u009f]/u.test(principal)||new TextEncoder().encode(principal).length>128||new TextEncoder().encode(room).length>200)throw fail();
 const document={endpoint:endpoint(d.endpoint),principal,room,writer:writer(d.writer),...(transportVersion(d.writerTransport)===2?{writerTransport:"atomic-v2" as const}:{})};
 let review=null;
 if(input.review!==null){const r=input.review;closed(r,["actor","binding","documentWriter","endpoint","principal","room",...(r.writerTransport===undefined?[]:["writerTransport"]),...(r.reviewEditing===undefined?[]:["reviewEditing"])].sort().join(","));review=reviewStorageIdentity(r);
  if(review.endpoint!==document.endpoint||review.principal!==principal||review.room!==room||review.documentWriter!==document.writer||review.writerTransport!==document.writerTransport)throw fail();
 }
 return {document,review};
}
function documentReceipt(input:unknown,id:string):SharedSegmentedDocumentReceipt {
 const v=closed(input,"receipt,sequence"),r=closed(v["receipt"],"from,groupDigest,prefixDigest,through,writer"),from=counter(r["from"]),through=counter(r["through"]),sequence=decimal(v["sequence"]);
 if(writer(r["writer"])!==id||BigInt(from)>=BigInt(through)||sequence==="0")throw fail();
 return {sequence,receipt:{writer:id,from,through,groupDigest:digest(r["groupDigest"]),prefixDigest:digest(r["prefixDigest"])}};
}
export function relayProgress(input:unknown,expected:SharedSegmentedRelayBinding):SharedSegmentedRelayProgress {
 const raw=JSON.stringify(input);if(typeof raw!=="string"||new TextEncoder().encode(raw).length>MAX_SEGMENTED_RELAY_METADATA_BYTES)throw fail();
 const v=closed(input,"binding,document,review,reviewReceipt"),binding=relayBinding(v["binding"] as SharedSegmentedRelayBinding);if(JSON.stringify(binding)!==JSON.stringify(expected))throw fail();
 const d=closed(v["document"],"accepted,receipt"),id=binding.document.writer;
 if(d["accepted"]!==null)closed(d["accepted"],"prefixDigest,through,writer");
 const accepted=d["accepted"]===null?null:clock(d["accepted"],id),receipt=d["receipt"]===null?null:documentReceipt(d["receipt"],id);
 if(receipt&&(!accepted||BigInt(receipt.receipt.through)>BigInt(accepted.through)||receipt.receipt.through===accepted.through&&receipt.receipt.prefixDigest!==accepted.prefixDigest))throw fail();
 const review=binding.review?reviewProgress(v["review"],binding.review):null;
 if(!binding.review&&(v["review"]!==null||v["reviewReceipt"]!==null))throw fail();
 let received=null;
 if(v["reviewReceipt"]!==null){const r=closed(v["reviewReceipt"],"receipt,sequence"),proof=reviewReceipt(r["receipt"]),sequence=decimal(r["sequence"]);
  if(sequence==="0"||proof.actor!==binding.review?.actor||!review?.accepted||BigInt(proof.through)>BigInt(review.accepted.through)||proof.through===review.accepted.through&&proof.prefixDigest!==review.accepted.prefixDigest)throw fail();received={sequence,receipt:proof};
 }
 if(review?.sequence!==null&&review?.sequence!==undefined&&(!received||received.receipt.through!==review.accepted?.through||received.sequence!==review.sequence))throw fail();
 return {binding,document:{accepted,receipt},review,reviewReceipt:received};
}
export function initialRelayProgress(binding:SharedSegmentedRelayBinding):SharedSegmentedRelayProgress{return {binding,document:{accepted:null,receipt:null},review:binding.review?{cursor:null,accepted:null,sequence:null}:null,reviewReceipt:null};}
export function forwardProgress(before:SharedSegmentedRelayProgress,after:SharedSegmentedRelayProgress):void {
 const monotone=(a:{through:string;prefixDigest:string}|null,b:{through:string;prefixDigest:string}|null)=>{if(a&&(!b||BigInt(b.through)<BigInt(a.through)||a.through===b.through&&a.prefixDigest!==b.prefixDigest))throw new SharedRelayError("segmented_relay_rollback");};
 monotone(before.document.accepted,after.document.accepted);monotone(before.review?.accepted??null,after.review?.accepted??null);
 for(const [a,b]of [[before.document.receipt,after.document.receipt],[before.reviewReceipt,after.reviewReceipt]] as const){if(a&&(!b||BigInt(b.sequence)<BigInt(a.sequence)||BigInt(b.receipt.through)<BigInt(a.receipt.through)||b.sequence===a.sequence&&JSON.stringify(b)!==JSON.stringify(a)))throw new SharedRelayError("segmented_relay_rollback");}
 const a=before.review?.cursor,b=after.review?.cursor;if(a&&(!b||BigInt(b.after)<BigInt(a.after)))throw new SharedRelayError("segmented_relay_rollback");
 if(before.review?.sequence!==null&&before.review?.sequence!==undefined&&before.review.accepted?.through===after.review?.accepted?.through&&after.review?.sequence!==before.review.sequence)throw new SharedRelayError("segmented_relay_rollback");
}
