import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('actual metadata raster byte capture: opaque',{timeout:3600000},()=>testMetadataMaterialization('opaque'));
