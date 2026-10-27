import {RichAssetReconciledBase,type RichAssetBaseBuildOptions,type RichAssetReconciliationPreview} from '@breditor/experimental-rich-content';
declare const current:Blob,original:Blob;
const preview:RichAssetReconciliationPreview=await RichAssetReconciledBase.preview(current,original);
const options:RichAssetBaseBuildOptions={sourceDatabase:'future-selected-uploads',choices:preview.conflicts.map(({asset})=>({asset,keep:'current'}))};
const base=await RichAssetReconciledBase.build(current,original,options);base.backup();base.file('selected');
// @ts-expect-error Every explicit decision names the future data source.
RichAssetReconciledBase.build(current,original,{choices:[]});
// @ts-expect-error No ambiguous default conflict policy is accepted.
RichAssetReconciledBase.build(current,original,{sourceDatabase:'target',keep:'newest'});
// @ts-expect-error Complete input files are required, not metadata-shaped data.
RichAssetReconciledBase.preview({sha256:'0'},original);
// @ts-expect-error DATA planning is not provider activation or a writer grant.
base.activate();
// @ts-expect-error Captured decisions are readonly.
options.choices[0].keep='original';
base.dispose();
