/** Shared authenticated-room and native-source reads for recovered suggestions. */
import {SharedRichEditor} from '../core.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {coreReadState} from '../core_read_state.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {SharedIndependentDeliveryParticipantBackup as Participant} from '../independent_delivery_participant/backup.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {clock,decimal} from '../relay/validation.js';
import type {SharedDocumentSuggestionDraft} from '../suggestion_types.js';
import type {RichPoint,RichSelection,SharedSelectionPolicy} from '../types.js';
import type {
 SharedRecoveredBranchRichSuggestionOptions,SharedRecoveredBranchTextSuggestion,SharedRecoveredBranchTextSuggestionOptions,
} from './contract.js';
import {branchFile} from './framing.js';
import {BranchArchiveScope} from './scope.js';

const editor=SharedRichEditor.prototype;
const {captureReviewAnchor,descriptor,writerClockV2,captureSuggestion}=editor;
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

function sourceSelection(input:unknown):RichSelection{
 const kind=input&&typeof input==='object'?Object.getOwnPropertyDescriptor(input,'kind')?.value:undefined;
 if(kind==='node'){
  const value=fields(input,['kind','block']);
  return {kind,block:string(value['block'])};
 }
 if(kind==='grid'){
  const value=fields(input,['kind','anchor','focus']);
  const cell=(input:unknown)=>{
   const row=fields(input,['table','row','column']);
   return {table:string(row['table']),row:string(row['row']),column:string(row['column'])};
  };
  return {kind,anchor:cell(value['anchor']),focus:cell(value['focus'])};
 }
 return textRange(input);
}

function checkOrigin(source:SharedRichEditor<SharedSelectionPolicy>,target:SharedRichEditor<SharedSelectionPolicy>):void{
 const a=clock(writerClockV2.call(source,'1'),'1'),b=clock(writerClockV2.call(target,'1'),'1');
 if(a.through==='0'||a.through!==b.through||a.prefixDigest!==b.prefixDigest||
    descriptor.call(source).schemaFingerprint!==descriptor.call(target).schemaFingerprint){
  throw new Error('Recovered text belongs to a different native document');
 }
}

interface RecoveredSuggestionSource {
 readonly backup:Participant;
 readonly core:SharedRichEditor<SharedSelectionPolicy>;
 readonly target:SharedRichEditor<SharedSelectionPolicy>;
 readonly targetRange:Extract<RichSelection,{kind:'text'}>;
 readonly revision:string;
 readonly namespace:string;
 readonly source:SharedRecoveredBranchTextSuggestion['source'];
 capture(draft:SharedDocumentSuggestionDraft):string;
}

export async function prepareRecoveredSuggestion<T>(
 options:SharedRecoveredBranchTextSuggestionOptions|SharedRecoveredBranchRichSuggestionOptions,
 selectionField:'sourceRange'|'sourceSelection',
 prepare:(source:RecoveredSuggestionSource)=>T,
):Promise<T>{
 const value=fields(options,['source',selectionField,'target','targetRange','targetRevision','namespace',
  'title','createdAtMs','session','wasm','checkAuthority'],['signal','limits']);
 const source=branchFile(value['source']);
 const originalRange=selectionField==='sourceRange'?textRange(value[selectionField]):sourceSelection(value[selectionField]);
 const targetRange=textRange(value['targetRange']);
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
    const result=prepare({
     backup,core:selected.core,target:target.core,targetRange,namespace,revision,
     source:Object.freeze({selection:source.selection,anchorJson}),
     capture(draft){checkTarget();return captureSuggestion.call(target.core,title,destination.principal,createdAtMs,draft,revision);},
    });
    selected.check();
    checkTarget();
    return result;
   }finally{selected.dispose();}
  }finally{dispose.call(backup);}
 }finally{scope.close();}
}
