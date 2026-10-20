/** Public-only source custody, whole-upload capture and explicit native recovery selection. */
import {SharedSegmentedPersistentSession,SharedSegmentedRelaySession,captureSharedGenerationSource,captureSharedGenerationAssets,captureSharedGenerationParticipant,readSharedGenerationParticipant,SharedGenerationParticipantRecovery,type SharedGenerationParticipantBackup,type SharedGenerationParticipantRecoveryOptions,type SharedGenerationParticipantResumeOptions,type SharedGenerationSourceSelection,type SharedGenerationSourceCapture,type SharedAssetReferenceCapture,type SharedGenerationParticipantSelection} from "@breditor/collaboration";
import type {RichAssetStore} from "@breditor/experimental-rich-content";
declare const local:SharedSegmentedPersistentSession<"document-v1">,retained:SharedSegmentedRelaySession<"document-v1">,store:RichAssetStore,options:SharedGenerationParticipantRecoveryOptions<"document-v1">,resume:SharedGenerationParticipantResumeOptions<"document-v1">,backup:SharedGenerationParticipantBackup,expected:SharedGenerationParticipantSelection;
const captured:SharedGenerationSourceCapture=captureSharedGenerationSource({kind:"local",session:local});
const source:SharedGenerationSourceSelection<"document-v1">={kind:"retained",session:retained};
await captureSharedGenerationAssets({source:captured,resolveAsset:async()=>undefined});
await captureSharedGenerationParticipant({source,participant:"desktop",principal:"alice",assets:store,checkAuthority(){}});
await readSharedGenerationParticipant(backup.file(),expected);
const attempt=await SharedGenerationParticipantRecovery.begin(options),ready=await attempt.finish(),parts=await ready.intoParts();
const restored:SharedGenerationSourceSelection<"document-v1">=parts.source;void restored;
await SharedGenerationParticipantRecovery.resume(resume);
// @ts-expect-error Native generation capture is not an original 16 MiB journal capture.
const old:SharedAssetReferenceCapture=captured;void old;
// @ts-expect-error A detached source identity is not actual session custody.
captureSharedGenerationSource({kind:"retained",session:backup.selection().identity.source});
// @ts-expect-error Local source custody is distinct from relay/retained source custody.
captureSharedGenerationSource({kind:"relay",session:local});
// @ts-expect-error An archive/metadata record is not a live native source capture.
await captureSharedGenerationAssets({source:backup,resolveAsset:async()=>undefined});
// @ts-expect-error Resume uses its retained original file; a caller cannot replace it.
await SharedGenerationParticipantRecovery.resume({...resume,backup});
// @ts-expect-error Current policy and matching native factories remain explicit, not saved metadata.
await SharedGenerationParticipantRecovery.resume({...resume,session:{kind:"retained",options:{readOnly:true}}});
// @ts-expect-error The original paired factory family is not silently upgraded to generations.
await SharedGenerationParticipantRecovery.begin({...options,session:{kind:"paired",options:{}}});
