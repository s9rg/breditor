/** Materialize the ordinary participant format from the actual merged native history, not its AST. */
import{readRichAssetBackup,RichAssetArchive}from'@breditor/experimental-rich-content';
import{SharedIndependentDeliveryParticipantBackup as Backup}from'../independent_delivery_participant/backup.js';
import{prepareSharedIndependentDeliveryBranchUnion}from'../independent_delivery_union/prepare.js';
import{snapshotIndependentDeliveryIdentityFactory}from'../independent_delivery_recovery/factory_policy.js';
import{replayPortableRecovery}from'../independent_operation/portable_replay.js';
import{portableRecoveryReferences}from'../independent_operation/portable_references.js';
import{resolveSelectedAssetBytes}from'../asset_bytes/resolve.js';
import{encodeIndependentDeliveryParticipant,independentDeliveryParticipantDigest}from'../independent_delivery_participant/codec.js';
import{independentDeliveryRecords}from'../independent_delivery_source/records.js';
import{sourceCoreMethods as native}from'../source_native_read.js';
import type{SharedIndependentDeliveryOptions}from'../independent_delivery/contract.js';
import type{DeliveryUnionArchiveScope}from'./scope.js';
import{fail}from'./policy.js';
const backup={selection:Backup.prototype.selection,recovery:Backup.prototype.sourceRecovery,blob:Backup.prototype.blob},assets={read:readRichAssetBackup,blob:RichAssetArchive.prototype.blob,dispose:RichAssetArchive.prototype.dispose};
export async function buildUnionParticipant(current:Backup,incoming:Backup,selectedUploads:Blob,scope:DeliveryUnionArchiveScope){
 const check=scope.check;check();const identity=backup.selection.call(current).identity;if(JSON.stringify(identity)!==JSON.stringify(backup.selection.call(incoming).identity))throw fail('delivery_union_policy');
 const merged=await prepareSharedIndependentDeliveryBranchUnion({currentJson:JSON.stringify(backup.recovery.call(current)),incomingJson:JSON.stringify(backup.recovery.call(incoming)),session:scope.session,authorizations:scope.authorizations,checkAuthority:check,signal:scope.signal});check();
 const chosen=snapshotIndependentDeliveryIdentityFactory(identity.source,scope.session,true),session={...chosen,database:'union-participant-data-only',create(){throw fail('delivery_union_policy');}} as SharedIndependentDeliveryOptions;
 let replica:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined,uploads:RichAssetArchive|undefined;
 try{
  replica=await replayPortableRecovery(session,merged.recovery,check);replica.check();const references=portableRecoveryReferences(replica.core,merged.recovery,replica.check);if(references.pending.length)return Object.freeze({kind:'pending' as const,pending:[{kind:'source' as const,pending:references.pending}]});
  uploads=await assets.read(selectedUploads,{limits:scope.limits,signal:scope.signal});check();const guard=()=>{check();replica!.check();};
  const selectedBytes=new Map<string,Blob>();for(const reference of references.references){
   guard();const left=backup.blob.call(current,reference.asset,reference.generation),right=backup.blob.call(incoming,reference.asset,reference.generation);
   // An opaque immutable identity cannot choose between different rasters by branch order.
   if(left&&right&&(left.size!==right.size||await scope.integrity.digest(left)!==await scope.integrity.digest(right)))throw fail('delivery_union_asset_fork');
   guard();const blob=assets.blob.call(uploads!,reference.asset)??left??right;if(blob)selectedBytes.set(JSON.stringify(reference),blob);
  }
  const resolved=await resolveSelectedAssetBytes(references.references,async reference=>{guard();const blob=selectedBytes.get(JSON.stringify(reference));return blob?{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed' as const:'host-verified' as const,blob,check:guard}:undefined;
  },scope.limits,guard,scope.signal);guard();if(resolved.missing.length)return Object.freeze({kind:'pending' as const,pending:resolved.missing});
  const records=independentDeliveryRecords(merged.recovery),view=native.retainedAssetReferences.call(replica.core),metadata={format:'breditor/shared-independent-delivery-participant-bytes' as const,formatVersion:1 as const,identity,document:view.document,revision:view.revision,bindings:resolved.bindings,assets:resolved.assets,sourceBytes:records.reduce((sum,row)=>sum+new TextEncoder().encode(row.json).length,0),assetBytes:resolved.assetBytes};
  const live=()=>{guard();resolved.check();guard();},file=await encodeIndependentDeliveryParticipant(metadata,records,resolved.payloads,selectedUploads,live,scope.signal);live();const selection={identity,sha256:await independentDeliveryParticipantDigest(file,scope.signal)};live();return Object.freeze({kind:'ready' as const,participant:Object.freeze({selection,file})});
 }finally{try{if(uploads)assets.dispose.call(uploads);}finally{replica?.dispose();}}
}
