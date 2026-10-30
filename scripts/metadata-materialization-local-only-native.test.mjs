import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('locally complete offline image bytes are recoverable while provider upload bytes stay missing', {timeout:3600000}, async()=>testMetadataMaterialization('local-only-content'));
