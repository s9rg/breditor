import test from 'node:test';import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('real later Native server publication requires actual continuation and its exact server/inventory files',{timeout:3600000},async()=>testMetadataMaterialization('local-only-content',{serverBytes:'advanced'}));
