import {withArchiveReadDiagnostics} from './fixtures/archive-read-diagnostics.mjs';
/** Actual original protocols and Native bytes, then existing future Undo/Redo. */
import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testReconciledPacketRecovery} from './fixtures/local-metadata/reconciled-packet-recovery.mjs';
import {reconciledPacketNativeRoot} from './fixtures/reconciled-packet/native-root.mjs';
import {testReconciledPacketFinalRefusal} from './fixtures/local-metadata/reconciled-packet-final-refusal.mjs';
test('same reservation retains complete original Pending packet bytes and current Native state',{timeout:7200000},()=>withArchiveReadDiagnostics(()=>testMetadataAvailability('pending-catalog',{nativeHostRoot:reconciledPacketNativeRoot,onAvailable:testReconciledPacketRecovery})));
test('same reservation binds retained bytes to checked current provider/client state without changing original Pending',{timeout:7200000},()=>withArchiveReadDiagnostics(()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,verifyFutureHistories:true,nativeHostRoot:reconciledPacketNativeRoot,onReconciled:input=>testReconciledPacketRecovery(input,{requireCurrent:'checked'}),onBeforeReconciledClose:testReconciledPacketFinalRefusal})));
