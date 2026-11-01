import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testReceiptContainment} from './fixtures/local-metadata/receipt-containment.mjs';
import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
test('actual all-family original receipts include saved cuts and detect an omitted accepted receipt without changing queues or histories',{timeout:3600000},async()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,nativeHostRoot:metadataNativeRoot,onReconciled:testReceiptContainment}));
