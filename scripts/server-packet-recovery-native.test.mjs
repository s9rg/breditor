/** All original seven-family checks and later document/review Undo/Redo run
 * through the existing genuine operational fixture; no new owner is fabricated. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testServerPacketRecovery} from './fixtures/local-metadata/server-packet-recovery.mjs';
import {dependencyNativeRoot} from './fixtures/server-native-dependencies/native-root.mjs';
test('genuine whole-cohort recovery binds client packets, complete server Native source knowledge, image bytes and selected server files',{timeout:7200000},async()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,nativeHostRoot:dependencyNativeRoot,onReconciled:testServerPacketRecovery}));
