import {RichAssetStore,RichAssetReconciliation,type RichAssetReconciliationChoice,type RichAssetReconciliationPreview} from "@breditor/experimental-rich-content";
import {SharedParticipantReplay,type SharedRichEditor,type SharedParticipantUploadReconciliationOptions} from "@breditor/collaboration";
declare const replay:SharedParticipantReplay,core:SharedRichEditor,store:RichAssetStore,plan:RichAssetReconciliation,options:SharedParticipantUploadReconciliationOptions;
const opened:Promise<RichAssetReconciliation>=replay.beginUploadReconciliation(core,store,options);
const resumed:Promise<RichAssetReconciliation>=replay.resumeUploadReconciliation(core,store,options);
const preview:RichAssetReconciliationPreview=plan.preview();const choices:readonly RichAssetReconciliationChoice[]=preview.conflicts.map(c=>({asset:c.asset,keep:"current"}));
void plan.commit(choices);void plan.file("original");void opened;void resumed;
// @ts-expect-error No fabricated replay capability.
const fabricated:SharedParticipantReplay={beginUploadReconciliation(){}};
// @ts-expect-error Metadata does not construct a durable attempt.
new RichAssetReconciliation({});
// @ts-expect-error Current/source choices are explicit, not counter ordering.
void plan.commit([{asset:"sha256:x",keep:"newest"}]);
// @ts-expect-error Native continuity cannot be replaced by a detached checkpoint.
void replay.beginUploadReconciliation({checkpointJson(){return"{}";}},store,options);
// @ts-expect-error Public constructors cannot accept invented storage ports.
void RichAssetReconciliation.begin({});
// @ts-expect-error A host callback cannot replace this native replay binding.
void replay.beginUploadReconciliation(core,store,{database:"a",checkSource(){}});
void fabricated;
