import {SharedDocumentVersions,SharedParticipantReplay,type SharedRetainedVersionRecoveryResult,type SharedRichEditor} from "@breditor/collaboration";
declare const versions:SharedDocumentVersions;declare const replay:SharedParticipantReplay;
const operation:Promise<SharedRetainedVersionRecoveryResult>=versions.recoverRetainedVersions(replay);void operation;
const disconnected:Promise<void>=versions.waitForDisconnected();void disconnected;
// @ts-expect-error Detached records do not prove original native replay or continuity.
versions.recoverRetainedVersions(versions.exportRecovery());
// @ts-expect-error A callback predicate is not an original private native replay.
versions.recoverRetainedVersions({verifyCurrent(_core:SharedRichEditor){},references(){}});
async function read(){const result=await operation;
// @ts-expect-error Diagnostics are immutable and are not editable publication state.
result.added=0;
// @ts-expect-error Local retention grants no global room activation proof.
result.activate();}void read;
