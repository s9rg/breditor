/** Compare original admitted facts only. No retry, packet body, receipt or role is rewritten. */
import type {OriginalMetadataIndex} from '../server_metadata_read/accumulator.js';
import type {OriginalMetadataPage,OriginalMetadataCursor} from '../server_metadata_read/contract.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {versionEntry,sameInfo} from '../versions/validation.js';
import {publication,decision,suggestionInfo} from '../suggestions/validation.js';
import {revisionReceipt,revisionInfo} from '../suggestion_revisions/transport.js';
import type {OriginalReceiptKind,OriginalReceiptPoint,OriginalReceiptRequirement} from './contract.js';
import {receiptPacketReaders} from './native_packets.js';
import type {SharedRichEditor} from '../core.js';import type {SharedSelectionPolicy} from '../types.js';
import {fail,same,MAX_ORIGINAL_RECEIPT_REQUIREMENTS} from './policy.js';
export class OriginalReceiptComparison {
 readonly #versions;readonly #publications;readonly #decisions;readonly #revisions;
 readonly #page:OriginalMetadataPage;readonly #terminal:Readonly<{versions:OriginalMetadataCursor|null}>;
 readonly #document:string;readonly #check:()=>void;readonly #pending:OriginalReceiptRequirement[]=[];readonly #points:OriginalReceiptPoint[]=[];
 constructor(index:OriginalMetadataIndex,page:OriginalMetadataPage,terminal:Readonly<{versions:OriginalMetadataCursor|null}>,document:string,check:()=>void){
  this.#versions=new Map(index.versions.map(row=>[row.version.id,row]));this.#publications=new Map(index.publications.map(row=>[row.suggestion.id,row]));this.#decisions=new Map(index.decisions.map(row=>[row.suggestionId,row]));this.#revisions=new Map(index.revisions.map(row=>[row.revision.id,row]));this.#page=page;this.#terminal=terminal;this.#document=document;this.#check=check;
 }
 inspect(participant:string,point:string,core:SharedRichEditor<SharedSelectionPolicy>,records:SegmentedRetainedRecords):void{
  this.#check();const native=receiptPacketReaders(core);let examined=0,matched=0;
  const compare=(receipt:OriginalReceiptKind,id:string,expected:unknown,actual:unknown)=>{examined++;if(actual!==undefined&&same(expected,actual)){matched++;return;}if(this.#pending.length>=MAX_ORIGINAL_RECEIPT_REQUIREMENTS)throw fail('metadata_receipt_budget');this.#pending.push({participant,point,receipt,id,relation:actual===undefined?'missing':'different'});};
  const p=this.#page;
  if(records.versions){
   const record=records.versions;if(p.versions.kind!=='page'||record.identity.room!==this.#document||record.identity.binding!==p.versions.catalog.descriptor.binding)throw fail('metadata_receipt_binding');
   if(record.catalog){for(const raw of record.catalog.entries){const row=versionEntry(raw);compare('catalog-version',row.version.id,row,this.#versions.get(row.version.id));}
    const through=this.#terminal.versions?.through;if(through===undefined)throw fail('metadata_receipt_binding');if(BigInt(record.catalog.through)>BigInt(through)){if(this.#pending.length>=MAX_ORIGINAL_RECEIPT_REQUIREMENTS)throw fail('metadata_receipt_budget');this.#pending.push({participant,point,receipt:'versions-cursor',id:record.identity.binding,relation:'server-behind'});}
   }
   for(const row of record.packets){this.#check();const info=native.version(row.packet);if(row.accepted){const accepted=versionEntry(row.accepted);if(!sameInfo(accepted.version,info))throw fail('metadata_receipt_source');compare('version',info.id,accepted,this.#versions.get(info.id));}}
  }
  if(records.suggestions){
   const record=records.suggestions;if(p.suggestions.kind!=='page'||record.identity.room!==this.#document||record.identity.binding!==p.suggestions.catalog.descriptor.binding||record.identity.effectWriter!==p.suggestions.catalog.descriptor.effectWriter)throw fail('metadata_receipt_binding');
   for(const row of record.retained){this.#check();const info=suggestionInfo(native.suggestion(row.packet));if(row.publication){const published=publication(row.publication);if(!same(published.suggestion,info))throw fail();compare('publication',info.id,published,this.#publications.get(info.id));}if(row.decision){const decided=decision(row.decision,record.identity);if(decided.suggestionId!==info.id)throw fail();compare('decision',info.id,decided,this.#decisions.get(info.id));}}
  }
  if(records.revisions){
   const record=records.revisions;if(p.revisions.kind!=='page'||p.suggestions.kind!=='page'||record.identity.room!==this.#document||record.binding!==p.revisions.catalog.descriptor.binding||record.identity.binding!==p.revisions.catalog.descriptor.suggestionBinding||record.identity.effectWriter!==p.suggestions.catalog.descriptor.effectWriter)throw fail('metadata_receipt_binding');
   for(const row of record.retained){this.#check();const info=revisionInfo(native.revision(row.previousPacket,row.packet));if(row.receipt){const receipt=revisionReceipt(row.receipt,record.identity);if(!same(receipt.revision,info))throw fail();compare('revision',info.id,receipt,this.#revisions.get(info.id));}if(row.conflict){const decided=decision(row.conflict.decision,record.identity);if(decided.suggestionId!==info.previousSuggestionId)throw fail();compare('conflict-decision',decided.suggestionId,decided,this.#decisions.get(decided.suggestionId));if(row.conflict.successor){const successor=revisionReceipt(row.conflict.successor,record.identity);if(successor.revision.previousSuggestionId!==info.previousSuggestionId)throw fail();compare('conflict-successor',successor.revision.id,successor,this.#revisions.get(successor.revision.id));}}}
  }
  this.#points.push({participant,point,examined,matched});this.#check();
 }
 result(){this.#check();return{points:this.#points,pending:this.#pending};}
}
