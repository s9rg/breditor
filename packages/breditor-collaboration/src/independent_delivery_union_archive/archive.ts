/** Complete union with independently replayed native/store and whole-upload outcomes. No DB/network I/O. */
import{RichAssetReconciledBase}from'@breditor/experimental-rich-content';
import{SharedIndependentDeliveryParticipantBackup as Backup}from'../independent_delivery_participant/backup.js';
import{recordCutJson,parseRecordCutJson}from'../physical_room_record_cut/json.js';
import{archiveBlob}from'../archive_integrity/policy.js';
import{independentDeliveryParticipantSelection}from'../independent_delivery_participant/policy.js';
import{unionArchiveChoice,unionArchivePlan,unionLayout,unionChoices}from'./plan.js';
import{DeliveryUnionArchiveScope as Scope}from'./scope.js';
import{buildUnionParticipant}from'./participant.js';
import{encodeUnionArchive,readUnionArchive,type UnionParts}from'./framing.js';
import type{SharedIndependentDeliveryUnionArchiveChoice as Choice,SharedIndependentDeliveryUnionArchiveReadOptions as Read,SharedIndependentDeliveryUnionArchiveBuildOptions as Build,SharedIndependentDeliveryUnionArchivePending as Pending,SharedIndependentDeliveryUnionParticipantFile as Participant}from'./contract.js';
import{fields,fail,MAX_INDEPENDENT_DELIVERY_UNION_ARCHIVE_BYTES as max}from'./policy.js';
const b={read:Backup.read,file:Backup.prototype.file,uploads:Backup.prototype.uploadBackup,dispose:Backup.prototype.dispose},a={build:RichAssetReconciledBase.build,read:RichAssetReconciledBase.read,file:RichAssetReconciledBase.prototype.file,backup:RichAssetReconciledBase.prototype.backup,metadata:RichAssetReconciledBase.prototype.metadata,dispose:RichAssetReconciledBase.prototype.dispose},token=Object.freeze({});
function participant(input:unknown):Participant{const row=fields(input,['selection','file']);return{selection:independentDeliveryParticipantSelection(parseRecordCutJson(recordCutJson(row['selection']))),file:archiveBlob(row['file'] as Blob,max)};}
function splitOptions(input:Build){const raw=fields(input,['current','incoming','layout','choices','session','authorizations','wasm','checkAuthority'],['signal','limits']),{current,incoming,layout,choices,...read}=raw;return{current:participant(current),incoming:participant(incoming),layout:unionLayout(layout),choices:unionChoices(choices),read:read as unknown as Read};}
export class SharedIndependentDeliveryUnionArchive{
 readonly #choice;#state:Readonly<{file:Blob;parts:UnionParts;scope:Scope}>|undefined;
 private constructor(key:object,choice:Choice,state:Readonly<{file:Blob;parts:UnionParts;scope:Scope}>){if(key!==token)throw fail('delivery_union_policy');this.#choice=choice;this.#state=state;Object.freeze(this);}
 #open(){const state=this.#state;if(!state)throw fail('delivery_union_closed');state.scope.check();if(this.#state!==state)throw fail('delivery_union_closed');return state;}
 choice():Choice{this.#open();return this.#choice;}
 file():Blob{return this.#open().file;}
 input(part:'current'|'incoming'):Participant{const state=this.#open();if(part!=='current'&&part!=='incoming')throw fail('delivery_union_policy');return Object.freeze({selection:this.#choice.plan[part],file:state.parts[part]});}
 output():Participant{return Object.freeze({selection:this.#choice.plan.output,file:this.#open().parts.output});}
 assetDecision():Blob{return this.#open().parts.assets;}
 dispose(){const state=this.#state;this.#state=undefined;state?.scope.close();}
 static async build(provided:Build):Promise<Readonly<{kind:'ready';archive:SharedIndependentDeliveryUnionArchive}>|Pending>{
  if(this!==SharedIndependentDeliveryUnionArchive)throw fail('delivery_union_policy');const selected=splitOptions(provided),scope=new Scope(selected.read);let current:Backup|undefined,incoming:Backup|undefined,assets:RichAssetReconciledBase|undefined,complete=false;
  try{
   current=await b.read.call(Backup,selected.current.file,selected.current.selection,{limits:scope.limits,signal:scope.signal});scope.check();incoming=await b.read.call(Backup,selected.incoming.file,selected.incoming.selection,{limits:scope.limits,signal:scope.signal});scope.check();
   assets=await a.build.call(RichAssetReconciledBase,b.uploads.call(current),b.uploads.call(incoming),{sourceDatabase:selected.layout.uploadsDatabase,choices:selected.choices,limits:scope.limits,signal:scope.signal});scope.check();const result=await buildUnionParticipant(current,incoming,a.file.call(assets,'selected'),scope);scope.check();if(result.kind==='pending')return result;
   const plan=unionArchivePlan({format:'breditor/independent-delivery-union-plan',formatVersion:1,layout:selected.layout,current:selected.current.selection,incoming:selected.incoming.selection,output:result.participant.selection,limits:scope.limits,choices:a.metadata.call(assets).choices}),parts={current:b.file.call(current),incoming:b.file.call(incoming),assets:a.backup.call(assets),output:result.participant.file},file=await encodeUnionArchive(plan,parts,scope);scope.check();const archive=new SharedIndependentDeliveryUnionArchive(token,file.choice,{file:file.file,parts,scope});complete=true;return Object.freeze({kind:'ready' as const,archive});
  }finally{try{if(assets)a.dispose.call(assets);}finally{try{if(incoming)b.dispose.call(incoming);}finally{try{if(current)b.dispose.call(current);}finally{if(!complete)scope.close();}}}}
 }
 static async read(input:Blob,provided:Choice,options:Read):Promise<SharedIndependentDeliveryUnionArchive>{
  if(this!==SharedIndependentDeliveryUnionArchive)throw fail('delivery_union_policy');const expected=unionArchiveChoice(provided),scope=new Scope(options);let current:Backup|undefined,incoming:Backup|undefined,assets:RichAssetReconciledBase|undefined,output:Backup|undefined,complete=false;
  try{
   scope.tighten(expected.plan.limits);const framed=await readUnionArchive(input,expected,scope);scope.check();current=await b.read.call(Backup,framed.parts.current,expected.plan.current,{limits:scope.limits,signal:scope.signal});scope.check();incoming=await b.read.call(Backup,framed.parts.incoming,expected.plan.incoming,{limits:scope.limits,signal:scope.signal});scope.check();assets=await a.read.call(RichAssetReconciledBase,framed.parts.assets,{limits:scope.limits,signal:scope.signal});scope.check();const meta=a.metadata.call(assets);
   if(meta.sourceDatabase!==expected.plan.layout.uploadsDatabase||JSON.stringify(meta.limits)!==JSON.stringify(expected.plan.limits)||JSON.stringify(meta.choices)!==JSON.stringify(expected.plan.choices))throw fail();
   for(const[actual,original]of[[a.file.call(assets,'current'),b.uploads.call(current)],[a.file.call(assets,'original'),b.uploads.call(incoming)]])if(actual!.size!==original!.size||await scope.integrity.digest(actual!)!==await scope.integrity.digest(original!))throw fail();scope.check();
   const rebuilt=await buildUnionParticipant(current,incoming,a.file.call(assets,'selected'),scope);scope.check();if(rebuilt.kind!=='ready'||JSON.stringify(rebuilt.participant.selection)!==JSON.stringify(expected.plan.output)||rebuilt.participant.file.size!==framed.parts.output.size||await scope.integrity.digest(rebuilt.participant.file)!==await scope.integrity.digest(framed.parts.output))throw fail();
   output=await b.read.call(Backup,framed.parts.output,expected.plan.output,{limits:scope.limits,signal:scope.signal});scope.check();const archive=new SharedIndependentDeliveryUnionArchive(token,expected,{file:framed.file,parts:framed.parts,scope});complete=true;return archive;
  }finally{try{if(output)b.dispose.call(output);}finally{try{if(assets)a.dispose.call(assets);}finally{try{if(incoming)b.dispose.call(incoming);}finally{try{if(current)b.dispose.call(current);}finally{if(!complete)scope.close();}}}}}
 }
}
