import test from 'node:test';import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('actual selected server/inventory bytes stay coupled to complete client metadata and locally recoverable assets',{timeout:3600000},async()=>testMetadataMaterialization('local-only-content',{serverBytes:'same'}));
