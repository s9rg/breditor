import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
test('genuine Native owner verifies older complete materialized metadata offline and refuses rehashed omissions', {timeout:3600000}, async()=>testMetadataMaterialization('content-addressed',{inspect:true}));
