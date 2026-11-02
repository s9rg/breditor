/** Explicit aggregate coordination bounds; no truncation, pruning or old-format changes. */
export const MAX_ROOM_ACTIVATION_INTENT_BYTES=1024*1024*1024;
export const MAX_ROOM_ACTIVATION_GRAPH_BYTES=64*1024*1024;
export const MAX_ROOM_ACTIVATION_OBJECTS=16384;
export const MAX_ROOM_ACTIVATION_GRAPH_NODES=1000000;
export const MAX_ROOM_ACTIVATION_REVISIONS=4096;
export class RoomActivationIntentError extends Error {
 constructor(readonly code:'activation_intent_policy'|'activation_intent_busy'|'activation_intent_closed'|'activation_intent_exists'|'activation_intent_missing'|'activation_intent_storage'|'activation_intent_integrity'|'activation_intent_stale'|'activation_intent_incomplete',message:string){super(message);this.name='RoomActivationIntentError';}
}
export function fail(code:RoomActivationIntentError['code']='activation_intent_integrity'):RoomActivationIntentError{return new RoomActivationIntentError(code,{
 activation_intent_policy:'Select the complete original activation intent, namespace and current native control',
 activation_intent_busy:'The activation intent already has actual work or namespace custody',
 activation_intent_closed:'The activation intent owner is closed or its actual storage changed',
 activation_intent_exists:'Preserve the existing activation intent; never overwrite it',
 activation_intent_missing:'The selected activation intent does not exist',
 activation_intent_storage:'Activation intent storage did not complete',
 activation_intent_integrity:'The complete activation intent and retained bytes differ',
 activation_intent_stale:'Current native, metadata or upload state differs from the retained activation source',
 activation_intent_incomplete:'Preserve all Pending work and obtain the missing complete recovery bytes before activation'
}[code]);}
