/** Hold the real whole store, with immutable baseline data independent of retired
 * archive wrappers. Uploaded references and original bytes cannot roll backward. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetArchive,type RichAssetArchiveEntry} from '@breditor/experimental-rich-content';
import type {PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {inspectUploads} from '../participant_recovery/inspect.js';
import {localJournalFailure as fail} from './journal_failure.js';
const capture=RichAssetStore.prototype.captureBackup,open=RichAssetStore.openRetained,acquire=RichAssetStore.prototype.acquireRecoveryCustody,check=RichAssetStore.prototype.checkOpen;
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,dispose=RichAssetArchive.prototype.dispose;
export const localUploadCustody=Object.freeze({check:RichAssetStoreCustody.prototype.check,release:RichAssetStoreCustody.prototype.release,close:RichAssetStoreCustody.prototype.close,closeStore:RichAssetStore.prototype.close});
export interface LocalParticipantUploadOwners{uploads?:RichAssetStore;uploadCustody?:RichAssetStoreCustody}
export interface LocalParticipantBaseline{readonly file:Blob;readonly uploadFile:Blob;readonly uploadSha256:string;readonly uploads:readonly RichAssetArchiveEntry[]}
export async function localParticipantBaseline(p:PreparedIndependentRecovery):Promise<LocalParticipantBaseline>{
 p.guard();const file=archive.file.call(p.backup),uploadFile=archive.uploadBackup.call(p.backup),uploadSha256=await independentParticipantDigest(uploadFile,p.options.signal);p.guard();const actual=await read.call(RichAssetArchive,uploadFile,{limits:p.options.limits,...(p.options.signal?{signal:p.options.signal}:{})});
 try{p.guard();return Object.freeze({file,uploadFile,uploadSha256,uploads:Object.freeze(entries.call(actual).map(row=>Object.freeze({...row})))});}finally{dispose.call(actual);}
}
export function checkLocalUploads(owners:LocalParticipantUploadOwners):void{if(!owners.uploads||!owners.uploadCustody)throw fail('independent_local_participant_missing');check.call(owners.uploads);localUploadCustody.check.call(owners.uploadCustody);}
export async function verifyLocalUploads(p:PreparedIndependentRecovery,baseline:LocalParticipantBaseline,owners:LocalParticipantUploadOwners,current:()=>void,initial:boolean):Promise<void>{
 const guard=()=>{current();checkLocalUploads(owners);};guard();const cut=await capture.call(owners.uploads!,()=>{guard();return undefined;},p.options.signal?{signal:p.options.signal}:{});guard();
 if(initial){if(await independentParticipantDigest(cut.backup,p.options.signal)!==baseline.uploadSha256)throw fail('independent_local_participant_uploads_diverged');guard();return;}
 const actual=await read.call(RichAssetArchive,cut.backup,{limits:p.options.limits,...(p.options.signal?{signal:p.options.signal}:{})});
 try{guard();const rows=new Map(entries.call(actual).map(row=>[row.asset,row]));for(const before of baseline.uploads){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw fail('independent_local_participant_uploads_diverged');}guard();}finally{dispose.call(actual);}
}
export async function openLocalUploads(p:PreparedIndependentRecovery,baseline:LocalParticipantBaseline,owners:LocalParticipantUploadOwners,initial:boolean):Promise<void>{
 p.guard();if(await inspectUploads(p.options.destinations.uploads)==='missing')throw fail('independent_local_participant_missing');p.guard();owners.uploads=await open.call(RichAssetStore,p.options.destinations.uploads,{limits:p.options.limits});p.guard();owners.uploadCustody=await acquire.call(owners.uploads);p.guard();await verifyLocalUploads(p,baseline,owners,p.guard,initial);
}
