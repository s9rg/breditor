import {RichAssetStore,RichAssetReconciledBase,type RichAssetBaseMetadata} from '@breditor/experimental-rich-content';
declare const store:RichAssetStore,original:Blob;
const decision=await store.beginReconciliation(original,{database:'separate-decision',checkSource(){}});
await decision.commit([]);
const base=await RichAssetReconciledBase.read(await decision.exportRetainedBase());
const metadata:RichAssetBaseMetadata=base.metadata();metadata.files.selected.sha256;
await base.verifyPredecessor(original);await base.verifySuccessor(base.file('selected'));base.file('selected');base.backup();
// @ts-expect-error No envelope or saved phase is a native/server activation grant.
base.activate();
// @ts-expect-error Metadata cannot provide genuine admitted file custody.
const forged:RichAssetReconciledBase={metadata:()=>metadata};
// @ts-expect-error All choices and pins are immutable retained evidence.
metadata.choices[0].keep='current';
// @ts-expect-error There is no automatic provider/writer baseline role.
base.file('provider');
