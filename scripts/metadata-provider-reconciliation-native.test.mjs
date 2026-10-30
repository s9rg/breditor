import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('actual local image ACK, fresh full-path resume, and all-family document/review/metadata delivery',{timeout:3600000},async()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true}));
