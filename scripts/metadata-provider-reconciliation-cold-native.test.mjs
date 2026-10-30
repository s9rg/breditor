/** Actual acknowledgements precede complete client retirement and restart.
 * This is client/source recovery against the same live authenticated server. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('post-ACK cold restart preserves seven native owners, fourteen offline lanes, metadata receipts and real image acknowledgements',{timeout:7200000},async()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,reconcileCold:true}));
