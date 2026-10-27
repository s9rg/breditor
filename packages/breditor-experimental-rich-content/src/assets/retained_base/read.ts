/** Recompute the actual explicit union on every cold admission. Metadata alone
 * never authorizes a replacement baseline. This reader performs no DB/network I/O. */
import {checkedAssetLimits} from '../limits.js';
import {importAssetBackup} from '../archive/import_backup.js';
import {encodeAssetArchiveSnapshot} from '../archive/export_backup.js';
import {assetInfo,type AssetLimits} from '../types.js';
import type {RichAssetArchiveEntry} from '../archive/read_backup.js';
import type {RichAssetReconciliationPreview} from '../reconciliation/types.js';
import type {RichAssetBaseBuildOptions} from './contract.js';
import {previewAssetBaseData,buildAssetBaseData} from './data_builder.js';
import {planRetainedAssets} from '../reconciliation/plan.js';
import {ASSET_BASE_MIME,RichAssetBaseError,type RichAssetBaseMetadata,type RichAssetBasePart,type RichAssetBaseReadOptions} from './contract.js';
import {assetBaseDigest,readAssetBaseFrame,checkAssetBaseSignal} from './framing.js';
import {verifyAssetBaseContinuity} from './continuity.js';
const key=Object.freeze({});
type Files=Readonly<Record<RichAssetBasePart,Blob>>;
/** Every edge keeps the archived ceiling as well as fresh caller tightening. */
function selectedLimits(archived:Readonly<AssetLimits>,input?:Partial<AssetLimits>):Readonly<AssetLimits>{
 const host=checkedAssetLimits(input);return checkedAssetLimits(Object.fromEntries(Object.entries(host).map(([name,value])=>[name,Math.min(value,archived[name as keyof AssetLimits])])));
}
/** An immutable admitted local decision. It conveys no source, custody, upload,
 * provider or native authority; caller must retain and bind it to its own intent. */
export class RichAssetReconciledBase {
 readonly #metadata:RichAssetBaseMetadata;readonly #entries:readonly RichAssetArchiveEntry[];
 #file:Blob|undefined;#files:Files|undefined;
 private constructor(token:object,file:Blob,metadata:RichAssetBaseMetadata,files:Files,entries:readonly RichAssetArchiveEntry[]){if(token!==key)throw new RichAssetBaseError('asset_base_format','Use complete retained-base admission');this.#file=file;this.#files=files;this.#metadata=metadata;this.#entries=entries;Object.freeze(this);}
 metadata():RichAssetBaseMetadata{return this.#metadata;}
 entries():readonly RichAssetArchiveEntry[]{return this.#entries;}
 /** Exact complete envelope, including both losing input states. */
 backup():Blob{this.#live();return this.#file!;}
 file(part:RichAssetBasePart):Blob{this.#live();if(part!=='current'&&part!=='original'&&part!=='selected')throw new RichAssetBaseError('asset_base_format','Select a complete retained base component');return this.#files![part];}
 #live():void{if(!this.#file||!this.#files)throw new RichAssetBaseError('asset_base_closed','The retained asset base is disposed');}
 /** Verify that the BEFORE side extends an independently selected prior whole
  * upload baseline. The explicit decision may change queue metadata only AFTER
  * this continuity edge; old receipt/epoch rules are not weakened. No DB opens. */
 async verifyPredecessor(prior:Blob,options:RichAssetBaseReadOptions={}):Promise<void>{
  this.#live();const{signal,limits:supplied}={...options},limits=selectedLimits(this.#metadata.limits,supplied),check=()=>{this.#live();checkAssetBaseSignal(signal);};check();
  await verifyAssetBaseContinuity(prior,this.#files!.current,limits,check,signal);check();
 }
 /** Later local state must extend the SELECTED side, not either losing input.
  * A second receipt change or queue rollback needs a separate retained decision. */
 async verifySuccessor(current:Blob,options:RichAssetBaseReadOptions={}):Promise<void>{
  this.#live();const{signal,limits:supplied}={...options},limits=selectedLimits(this.#metadata.limits,supplied),check=()=>{this.#live();checkAssetBaseSignal(signal);};check();
  await verifyAssetBaseContinuity(this.#files!.selected,current,limits,check,signal);check();
 }
 dispose():void{this.#file=undefined;this.#files=undefined;}
 /** Preview complete retained queue conflicts without creating a mutable store. */
 static preview(current:Blob,original:Blob,options:RichAssetBaseReadOptions={}):Promise<RichAssetReconciliationPreview>{return previewAssetBaseData(current,original,options);}
 /** Build before target creation, then independently re-admit the unchanged V1
  * bytes. This remains DATA, not actual source custody or a provider decision. */
 static async build(current:Blob,original:Blob,options:RichAssetBaseBuildOptions):Promise<RichAssetReconciledBase>{
  const supplied={...options,...(options.limits?{limits:{...options.limits}}:{})},file=await buildAssetBaseData(current,original,supplied);return RichAssetReconciledBase.read(file,supplied);
 }
 static async read(input:Blob,options:RichAssetBaseReadOptions={}):Promise<RichAssetReconciledBase>{
  const{limits:supplied,signal}={...options},hostLimits=checkedAssetLimits(supplied),check=()=>checkAssetBaseSignal(signal);check();
  const framed=await readAssetBaseFrame(input,check),m=framed.metadata,limits=selectedLimits(m.limits,hostLimits);
  const current=await importAssetBackup(framed.files.current,limits,signal);check();const original=await importAssetBackup(framed.files.original,limits,signal);check();
  const plan=planRetainedAssets(current,original,limits,m.choices);if(JSON.stringify(plan.choices)!==JSON.stringify(m.choices))throw new RichAssetBaseError('asset_base_format','Retained choices are not the exact canonical conflict set');
  const selected=await encodeAssetArchiveSnapshot(plan.records!,limits,signal);check();if(selected.size!==m.files.selected.bytes||await assetBaseDigest(selected,check)!==m.files.selected.sha256)throw new RichAssetBaseError('asset_base_integrity','The retained selected file is not the exact explicit union');
  const pins=Object.freeze(Object.fromEntries(Object.entries(m.files).map(([part,pin])=>[part,Object.freeze({...pin})]))) as RichAssetBaseMetadata['files'];
  const metadata=Object.freeze({...m,limits:Object.freeze({...m.limits}),choices:Object.freeze(m.choices.map(c=>Object.freeze({...c}))),files:pins});
  const entries=Object.freeze(plan.records!.map(row=>Object.freeze({...assetInfo(row),epoch:row.epoch})));check();
  return new RichAssetReconciledBase(key,new Blob([input],{type:ASSET_BASE_MIME}),metadata,framed.files,entries);
 }
}
