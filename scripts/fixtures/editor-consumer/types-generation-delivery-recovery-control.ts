/** No saved native proof, data selector or current checker becomes an activation capability. */
import {SharedServerLogGenerationDeliveryRecoveryHost,SharedServerLogGenerationRecoveryHost,type SharedServerLogGenerationDeliveryRecoveryControlSelection,type SharedServerLogGenerationRecoveryControlSelection,type SharedServerLogGenerationRecoveryAcceptedRead} from '@breditor/collaboration';
declare const expected:SharedServerLogGenerationDeliveryRecoveryControlSelection,current:SharedServerLogGenerationRecoveryHost,old:SharedServerLogGenerationRecoveryControlSelection;
const options={endpoint:'https://operator.example/recovery/generation-delivery/v1/check',expected,current,principal:'operator',getToken:async(signal:AbortSignal)=>{signal.throwIfAborted();return 'a'.repeat(64);},checkAuthority(){}};
const opening=SharedServerLogGenerationDeliveryRecoveryHost.open(options);
opening.then(async host=>{await host.check();await host.checkAssets({references:[],uploads:[]});const native:SharedServerLogGenerationRecoveryAcceptedRead=await host.readAcceptedNative({document:'include',review:{kind:'start'}});host.close();return native;});
// @ts-expect-error No activation grant exists.
opening.then(host=>host.activate());
// @ts-expect-error A bare old current selector omits the complete previous-cut/control pins.
SharedServerLogGenerationDeliveryRecoveryHost.open({...options,expected:old});
// @ts-expect-error A matching data object/public check callback is not the genuine current checker.
SharedServerLogGenerationDeliveryRecoveryHost.open({...options,current:{selection:()=>old,check:async()=>{}}});
// @ts-expect-error Never store account bearer tokens in control choices.
SharedServerLogGenerationDeliveryRecoveryHost.open({...options,token:'private'});
// @ts-expect-error The original restore origin stays immutable data.
expected.continuation.current.origin.native.source.records=0;
