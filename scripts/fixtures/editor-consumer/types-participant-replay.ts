/** Historical copies expose genuine read-only sources, never a second editable author. */
import {SharedParticipantReplay,type SharedParticipantRecoveryOptions,type SharedParticipantBackupSelection,type SharedRustOwner,type SharedAssetReferenceCapture,type SharedRichEditor} from "@breditor/collaboration";
declare const original:SharedParticipantRecoveryOptions<"original">,document:SharedParticipantRecoveryOptions<"document-v1">,current:SharedRichEditor<"document-v1">,raw:SharedRustOwner;
const one:Promise<SharedParticipantReplay>=SharedParticipantReplay.read(original);
const two:Promise<SharedParticipantReplay>=SharedParticipantReplay.read(document);
// @ts-expect-error Incoming metadata cannot construct a native replay.
new SharedParticipantReplay();
// @ts-expect-error A raw owner is not an independently selected complete participant backup.
SharedParticipantReplay.read({...original,backup:raw});
// @ts-expect-error There is no implicit native family or factory selected from incoming bytes.
SharedParticipantReplay.read({...original,session:{kind:"document"}});
async function consume(){const reader=await two,selection:Readonly<SharedParticipantBackupSelection>=reader.selection(),source:SharedAssetReferenceCapture=reader.references();reader.verifyCurrent(current);reader.check();
 // @ts-expect-error Private native owners are not exposed for editing or connection.
 reader.core.type("not allowed");
 // @ts-expect-error A saved success flag is not an actual current native editor.
 reader.verifyCurrent({verified:true});
 reader.dispose();return{selection,source};}
void[one,two,consume];
