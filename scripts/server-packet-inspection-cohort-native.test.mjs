/** Functional server-inspection stages inside the complete original owner
 * workflow. No copied ownership object or operational replacement is used. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testServerPacketInspection} from './fixtures/local-metadata/server-packet-inspection.mjs';
import {inspectionNativeRoot} from './fixtures/server-packet-inspection/native-root.mjs';
test('genuine all-seven owner captures packets and raster bytes, replays the selected server and compares complete Native inventory and exact original server packets',{timeout:7200000},async()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,nativeHostRoot:inspectionNativeRoot,onReconciled:testServerPacketInspection}));
