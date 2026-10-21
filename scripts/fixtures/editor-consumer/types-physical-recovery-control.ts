import {SharedPhysicalRoomRecoveryHost,type SharedPhysicalRecoveryControlSelection,type SharedPhysicalRoomClientOperation,type SharedPhysicalRoomNativeCheck} from '@breditor/collaboration';
declare const expected:SharedPhysicalRecoveryControlSelection,operation:SharedPhysicalRoomClientOperation;
const opening=SharedPhysicalRoomRecoveryHost.open({endpoint:'https://operator.example/recovery/physical/v1/check',expected,principal:'operator',getToken:async signal=>{signal.throwIfAborted();return 'a'.repeat(64);},checkAuthority(){}});
opening.then(async host=>{await host.check();const check:SharedPhysicalRoomNativeCheck=await operation.checkNativeHost(host);host.close();return check.coverage.kind;});
// @ts-expect-error Metadata is not a genuine authenticated native checker.
operation.checkNativeHost(expected);
// @ts-expect-error No service activation capability is exposed.
opening.then(host=>host.activate());
// @ts-expect-error Actual local origin B remains immutable and independent.
expected.source.localOrigin.native.source.records=0;
// @ts-expect-error The operator token cannot be stored as a document field or selected option.
SharedPhysicalRoomRecoveryHost.open({endpoint:'https://operator.example/recovery/physical/v1/check',expected,principal:'operator',token:'private',checkAuthority(){}});
