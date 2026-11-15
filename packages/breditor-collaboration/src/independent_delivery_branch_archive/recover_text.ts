/** Project explicitly selected archived text into the ordinary native proposal workflow. */
import {SharedRichEditor} from '../core.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {coreReadState} from '../core_read_state.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {SharedIndependentDeliveryParticipantBackup as Participant} from '../independent_delivery_participant/backup.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {clock,decimal} from '../relay/validation.js';
import type {RichPoint} from '../types.js';
import type {SharedRecoveredBranchTextSuggestion,SharedRecoveredBranchTextSuggestionOptions} from './contract.js';
import {branchFile} from './framing.js';
import {BranchArchiveScope} from './scope.js';

const editor=SharedRichEditor.prototype;
const {captureReviewAnchor,readReviewQuote,descriptor,writerClockV2,planSuggestionGeneralText,captureSuggestion}=editor;
const participantRead=Participant.read;
const {sourceRecovery,dispose}=Participant.prototype;

function string(value:unknown):string{
 if(typeof value!=='string')throw new Error('Recovered text suggestion fields must be strings');
 return value;
}

function point(input:unknown):RichPoint{
 const value=fields(input,['block','offset','affinity']);
 const affinity=value['affinity'];
 if(affinity!=='before'&&affinity!=='after')throw new Error('Invalid text point affinity');
 return {block:string(value['block']),offset:decimal(value['offset']),affinity};
}

function textRange(input:unknown){
 const value=fields(input,['kind','anchor','focus']);
 if(value['kind']!=='text')throw new Error('Select an explicit text range');
 return {kind:'text' as const,anchor:point(value['anchor']),focus:point(value['focus'])};
}

function checkOrigin(source:SharedRichEditor<'original'|'document-v1'>,target:SharedRichEditor<'original'|'document-v1'>):void{
 const a=clock(writerClockV2.call(source,'1'),'1'),b=clock(writerClockV2.call(target,'1'),'1');
 if(a.through==='0'||a.through!==b.through||a.prefixDigest!==b.prefixDigest||
    descriptor.call(source).schemaFingerprint!==descriptor.call(target).schemaFingerprint){
  throw new Error('Recovered text belongs to a different native document');
 }
}

/** Capture an ordinary, unpublished native suggestion using a pinned archive and a fresh target cut. */
export async function prepareSharedRecoveredBranchTextSuggestion(
 options:SharedRecoveredBranchTextSuggestionOptions,
):Promise<SharedRecoveredBranchTextSuggestion>{
 const value=fields(options,['source','sourceRange','target','targetRange','targetRevision','namespace',
  'title','createdAtMs','session','wasm','checkAuthority'],['signal','limits']);
 const source=branchFile(value['source']);
 const originalRange=textRange(value['sourceRange']),targetRange=textRange(value['targetRange']);
 const revision=string(value['targetRevision']),namespace=string(value['namespace']);
 const title=string(value['title']),createdAtMs=string(value['createdAtMs']);
 const target=independentDeliverySource(value['target'] as object);
 const original=source.selection.identity.source.binding.document;
 const destination=target.identity.binding.document;
 if(original.room!==destination.room||original.endpoint!==destination.endpoint||!target.identity.retained.suggestions){
  throw new Error('Select a suggestion-enabled target in the original relay room');
 }
 const stamp=coreReadStamp(target.core).document;
 const checkTarget=()=>{
  target.check();
  if(coreReadState(target.core).documentRevision!==revision||coreReadStamp(target.core).document!==stamp){
   throw new Error('Target document changed during recovered text preparation');
  }
 };
 checkTarget();
 const scope=new BranchArchiveScope(value as unknown as SharedRecoveredBranchTextSuggestionOptions);
 try{
  const check=()=>{scope.check();checkTarget();};
  check();
  const backup=await participantRead.call(Participant,source.file,source.selection,{signal:scope.signal,limits:scope.limits});
  try{
   check();
   const recovery=sourceRecovery.call(backup);
   const selected=await replayPortableRecovery(scope.session(source.selection.identity.source),recovery,check);
   try{
    selected.check();
    checkOrigin(selected.core,target.core);
    const anchorJson=captureReviewAnchor.call(selected.core,{kind:'selection',selection:originalRange});
    const quote=readReviewQuote.call(selected.core,anchorJson);
    if(quote.kind!=='quoted'||quote.plainText.length===0)throw new Error('Select retained text with a complete native quote');
    selected.check();
    checkTarget();
    const draft=planSuggestionGeneralText.call(target.core,targetRange,[{text:quote.plainText,formatsJson:'[]'}],namespace,revision);
    const packet=captureSuggestion.call(target.core,title,destination.principal,createdAtMs,draft,revision);
    selected.check();
    checkTarget();
    return Object.freeze({packet,plainText:quote.plainText,
     source:Object.freeze({selection:source.selection,anchorJson})});
   }finally{selected.dispose();}
  }finally{dispose.call(backup);}
 }finally{scope.close();}
}
