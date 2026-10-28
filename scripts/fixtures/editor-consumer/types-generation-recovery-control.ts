import {SharedServerLogGenerationRecoveryHost,type SharedServerLogGenerationRecoveryControlSelection,type SharedServerLogGenerationRecoveryAssetRead,type SharedServerLogGenerationRecoveryAcceptedRead,SharedPhysicalRoomRecoveryHost} from '@breditor/collaboration';
declare const expected:SharedServerLogGenerationRecoveryControlSelection;
const opening=SharedServerLogGenerationRecoveryHost.open({endpoint:'https://operator.example/recovery/generations/v1/check',expected,principal:'operator',getToken:async signal=>{signal.throwIfAborted();return 'a'.repeat(64);},checkAuthority(){}});
opening.then(async host=>{await host.check();const assets:SharedServerLogGenerationRecoveryAssetRead=await host.checkAssets({references:[],uploads:[]});const native:SharedServerLogGenerationRecoveryAcceptedRead=await host.readAcceptedNative({document:'include',review:{kind:'start'}});host.close();return{assets,native};});
// @ts-expect-error No service activation capability is exposed.
opening.then(host=>host.activate());
// @ts-expect-error Actual origin stays immutable.
expected.source.origin.native.source.records=0;
// @ts-expect-error Native authority cannot be substituted by physical-family metadata.
SharedPhysicalRoomRecoveryHost.open({endpoint:'https://operator.example/recovery/physical/v1/check',expected,principal:'operator',getToken:()=> 'a'.repeat(64),checkAuthority(){}});
// @ts-expect-error An operator token cannot be a stored selection option.
SharedServerLogGenerationRecoveryHost.open({endpoint:'https://operator.example/recovery/generations/v1/check',expected,principal:'operator',token:'private',checkAuthority(){}});
