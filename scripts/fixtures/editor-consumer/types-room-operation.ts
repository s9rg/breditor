/** Genuine parent custody and fresh explicit current policies remain closed public contracts. */
import {SharedRoomOperationalRecovery,type SharedRoomRecoveryCatalog,type SharedRoomOperationBeginOptions,type SharedRoomOperationResumeOptions,type SharedRoomOperationParts,type SharedRoomOperationProgress,type RecoveredSharedParticipant} from "@breditor/collaboration";
declare const catalog:SharedRoomRecoveryCatalog,ready:RecoveredSharedParticipant,begin:SharedRoomOperationBeginOptions,resume:SharedRoomOperationResumeOptions;
const first:Promise<SharedRoomOperationalRecovery>=SharedRoomOperationalRecovery.begin({...begin,catalog});
const later:Promise<SharedRoomOperationalRecovery>=SharedRoomOperationalRecovery.resume(resume);
// @ts-expect-error Parent constructors cannot manufacture native custody.
new SharedRoomOperationalRecovery();
// @ts-expect-error Past progress flags are not an admitted parent catalog.
SharedRoomOperationalRecovery.begin({...begin,catalog:{phase:"checked"}});
// @ts-expect-error A genuine single participant still does not own a parent catalog.
SharedRoomOperationalRecovery.begin({...begin,catalog:ready});
const missingPolicy={...resume,participants:resume.participants.map(({currentPolicy,...row})=>row)};
// @ts-expect-error Original metadata cannot supply fresh current document/review permissions.
SharedRoomOperationalRecovery.resume(missingPolicy);
// @ts-expect-error Native factory families and original destination plans cannot be omitted.
SharedRoomOperationalRecovery.resume({...resume,participants:[{id:"alice",operationDatabase:"op",currentPolicy:{documentReadOnly:true,reviewAccess:"read_only"}}]});
async function consumers(){const owner=await first,progress:SharedRoomOperationProgress=await owner.finish(),parts:SharedRoomOperationParts=await owner.intoParts();for(const row of parts.participants){row.parts.session.core.undo();await row.parts.session.flush();await row.parts.session.close();row.parts.uploads.close();}return progress;}
void[later,consumers];
