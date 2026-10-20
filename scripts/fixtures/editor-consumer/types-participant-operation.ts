/** Operational storage consumes real native custody and keeps original selection families typed. */
import {OperationalSharedParticipant,type RecoveredSharedParticipant,type SharedParticipantOperationBeginOptions,type SharedParticipantOperationResumeOptions,type SharedParticipantBackupSelection,type SharedRustOwner,type SharedDocumentSelection} from "@breditor/collaboration";
import {RichAssetStore} from "@breditor/experimental-rich-content";
declare const original:RecoveredSharedParticipant<"original">,document:RecoveredSharedParticipant<"document-v1">,expected:SharedParticipantBackupSelection,raw:SharedRustOwner;
const begin:SharedParticipantOperationBeginOptions<"original">={database:"operation",recovered:original,expected,checkAuthority(){}};
const operation:Promise<OperationalSharedParticipant<"original">>=OperationalSharedParticipant.begin(begin);
const documentOperation:Promise<OperationalSharedParticipant<"document-v1">>=OperationalSharedParticipant.begin({database:"document-operation",recovered:document,expected,checkAuthority(){}});
// @ts-expect-error A serialized ready flag is not held native custody.
OperationalSharedParticipant.begin({...begin,recovered:{ready:true}});
// @ts-expect-error A raw native owner has neither source files nor coordinator/native lease custody.
OperationalSharedParticipant.begin({...begin,recovered:raw});
// @ts-expect-error Constructors are private at both the TypeScript and JavaScript boundary.
new OperationalSharedParticipant();
declare const resume:SharedParticipantOperationResumeOptions<"document-v1">;
const reopen:Promise<OperationalSharedParticipant<"document-v1">>=OperationalSharedParticipant.resume(resume);
const {currentPolicy,...missingPolicy}=resume;
// @ts-expect-error Persisted history cannot supply current host permissions.
OperationalSharedParticipant.resume(missingPolicy);
// @ts-expect-error Current document policy is Boolean, not a persisted role name.
OperationalSharedParticipant.resume({...resume,currentPolicy:{documentReadOnly:"reader",reviewAccess:"read_only"}});
async function consumers(){const owner=await documentOperation,parts=await owner.intoParts();const checked:void=parts.uploads.checkOpen();void checked;const selection:SharedDocumentSelection|null=parts.session.core.view().selection;parts.session.core.selectDocument();return selection;}
const retained=RichAssetStore.openRetained("retained-assets");
void [operation,documentOperation,reopen,currentPolicy,consumers,retained];
