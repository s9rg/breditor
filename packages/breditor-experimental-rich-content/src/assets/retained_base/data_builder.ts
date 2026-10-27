/** Pure complete-file planning before a recovery target exists. Queue metadata
 * is not ordered across copies: every conflict needs its exact explicit choice.
 * Both losing inputs remain in the unchanged retained-base V1 frame. */
import {checkedAssetLimits} from '../limits.js';
import {importAssetBackup} from '../archive/import_backup.js';
import {encodeAssetArchiveSnapshot} from '../archive/export_backup.js';
import {planRetainedAssets} from '../reconciliation/plan.js';
import type {RichAssetReconciliationPreview} from '../reconciliation/types.js';
import {RichAssetBaseError,type RichAssetBaseReadOptions,type RichAssetBaseBuildOptions} from './contract.js';
import {checkAssetBaseSignal,encodeAssetBase} from './framing.js';

async function inputs(current:Blob,original:Blob,options:RichAssetBaseReadOptions){
 const {limits:supplied,signal}={...options},limits=checkedAssetLimits(supplied),check=()=>checkAssetBaseSignal(signal);check();
 const left=await importAssetBackup(current,limits,signal);check();const right=await importAssetBackup(original,limits,signal);check();
 return{left,right,limits,signal,check};
}
/** No database, mutable store, lock, provider request or native owner is opened. */
export async function previewAssetBaseData(current:Blob,original:Blob,options:RichAssetBaseReadOptions={}):Promise<RichAssetReconciliationPreview>{
 const scope=await inputs(current,original,options),result=planRetainedAssets(scope.left,scope.right,scope.limits);scope.check();return result.preview;
}
/** The source name binds the FUTURE actual store to this DATA. It does not
 * reserve that namespace, authenticate receipts or authorize a local decision. */
export async function buildAssetBaseData(current:Blob,original:Blob,provided:RichAssetBaseBuildOptions):Promise<Blob>{
 const {sourceDatabase,choices,...options}={...provided};
 if(typeof sourceDatabase!=='string'||!sourceDatabase||sourceDatabase.length>200||!Array.isArray(choices))throw new RichAssetBaseError('asset_base_format','Choose the exact future source name and every asset conflict explicitly');
 // Snapshot ordinary host choices before the first asynchronous admission.
 const selected=choices.map(choice=>({...choice})),scope=await inputs(current,original,options),plan=planRetainedAssets(scope.left,scope.right,scope.limits,selected);scope.check();
 const file=await encodeAssetArchiveSnapshot(plan.records!,scope.limits,scope.signal);scope.check();
 const result=await encodeAssetBase(sourceDatabase,scope.limits,plan.choices!,{current,original,selected:file},scope.check);scope.check();return result;
}
