import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('remote-only Native metadata content is downloaded and preserved; a missing download stays Pending', {timeout:3600000}, async()=>testMetadataMaterialization('remote-content'));
