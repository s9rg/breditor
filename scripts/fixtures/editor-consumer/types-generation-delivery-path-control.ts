/** Full path DATA is never a native owner, ACK or activation grant. */
import {SharedServerLogGenerationDeliveryPathRecoveryHost as Host,SharedServerLogGenerationDeliveryRecoveryHost as Current,SharedServerLogGenerationRecoveryHost as Old,type SharedServerLogGenerationDeliveryPathRecoveryControlSelection as Selection,type SharedServerLogGenerationDeliveryRecoveryControlSelection as Inner,type SharedServerLogGenerationRecoveryAcceptedRead} from '@breditor/collaboration';
import type {SharedServerLogGenerationRecoveryControlError,SharedServerLogGenerationDeliveryControlError,SharedServerLogGenerationDeliveryPathControlError} from '@breditor/collaboration';
declare const expected:Selection,current:Current,old:Old,inner:Inner;
const options={endpoint:'https://operator.example/recovery/generation-delivery-path/v1/check',expected,current,principal:'operator',getToken:async(signal:AbortSignal)=>{signal.throwIfAborted();return 'a'.repeat(64);},checkAuthority(){}};
const opening=Host.open(options);
opening.then(async host=>{await host.check();await host.checkAssets({references:[],uploads:[]});const read:SharedServerLogGenerationRecoveryAcceptedRead=await host.readAcceptedNative({document:'include',review:{kind:'start'}});host.close();return read;});
// @ts-expect-error No saved-data editing resume exists.
opening.then(host=>host.resume());
// @ts-expect-error No room activation grant exists.
opening.then(host=>host.activate());
// @ts-expect-error A single-prior selector omits the complete native path.
Host.open({...options,expected:inner});
// @ts-expect-error A bare original current host cannot replace the genuine prior/current host.
Host.open({...options,current:old});
// @ts-expect-error Copies/public callbacks do not carry the private runtime brand.
Host.open({...options,current:{selection:()=>inner,check:async()=>{}}});
// @ts-expect-error No bearer token belongs in selected metadata.
Host.open({...options,token:'private'});
// @ts-expect-error Ordered path arrays are immutable and cannot be silently trimmed.
expected.path.ancestors.pop();
// @ts-expect-error The original remains immutable.
expected.path.current.origin.native.source.records=0;

declare const refusal:SharedServerLogGenerationRecoveryControlError|SharedServerLogGenerationDeliveryControlError|SharedServerLogGenerationDeliveryPathControlError;
const cancellation:'deadline'|'signal'|undefined=refusal.cancellationReason;
void cancellation;
// @ts-expect-error The SDK's local cancellation observation is read-only.
refusal.cancellationReason='signal';
