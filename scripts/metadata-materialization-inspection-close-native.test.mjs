import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('genuine parent close drains the actual materialized raster hash and preserves committed metadata', {timeout:3600000}, async()=>testMetadataMaterialization('content-addressed',{inspectClose:true}));
