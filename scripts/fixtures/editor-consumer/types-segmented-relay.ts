/** Explicit source custody and immutable document transport policy survive package installation. */
import {SharedSegmentedRelaySession,SharedSegmentedPersistentSession,createSharedSegmentedRelaySync,createSharedSegmentedReviewRelaySync,type SharedSegmentedRelaySessionOptions,type SharedSegmentedRelayRecoveryOptions,type SharedRelayIdentity,type SharedSegmentedRelayProgress} from '@breditor/collaboration';
declare const options:SharedSegmentedRelaySessionOptions<'document-v1'>,recovery:SharedSegmentedRelayRecoveryOptions<'document-v1'>,session:SharedSegmentedRelaySession<'document-v1'>,local:SharedSegmentedPersistentSession<'document-v1'>,identity:SharedRelayIdentity,progress:SharedSegmentedRelayProgress;
const opened:Promise<SharedSegmentedRelaySession<'document-v1'>>=SharedSegmentedRelaySession.open(options);
const restored:Promise<SharedSegmentedRelaySession<'document-v1'>>=SharedSegmentedRelaySession.restoreRecovery(recovery);
const document=createSharedSegmentedRelaySync(session,{identity:{...identity,writerTransport:'atomic-v2'},getToken:()=> 'fresh host token'});
createSharedSegmentedReviewRelaySync(session,{identity:{...options.binding.review!,writerTransport:'atomic-v2',credential:'host-protected'},getToken:()=> 'fresh host token',flushDocument:()=>document.flush()});
// @ts-expect-error An ordinary local generation session does not own relay progress custody.
createSharedSegmentedRelaySync(local,{identity,getToken:()=> 'token'});
// @ts-expect-error Detached stored metadata is not an actual live session.
createSharedSegmentedRelaySync(progress,{identity,getToken:()=> 'token'});
// @ts-expect-error Document-family sessions require an explicit atomic-v2 identity.
createSharedSegmentedRelaySync(session,{identity,getToken:()=> 'token'});
// @ts-expect-error Caller callbacks cannot replace the actual session's atomic persistence boundary.
createSharedSegmentedRelaySync(session,{identity:{...identity,writerTransport:'atomic-v2'},getToken:()=> 'token',persistLocal:async()=>{}});
// @ts-expect-error Portable recovery metadata is not a host credential store.
const withCredential:SharedSegmentedRelaySessionOptions<'document-v1'>={...options,binding:{...options.binding,document:{...options.binding.document,credential:'secret'}}};
// @ts-expect-error A saved native source alone is not the paired relay recovery envelope.
SharedSegmentedRelaySession.restoreRecovery({...recovery,recovery:recovery.recovery.source});
// @ts-expect-error Recovery acknowledgement is an explicit host obligation, not a Boolean readiness flag.
SharedSegmentedRelaySession.restoreRecovery({...recovery,writerRecovery:true});
void [opened,restored,document,withCredential];
