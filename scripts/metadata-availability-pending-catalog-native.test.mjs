import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
test('native uncached metadata catalog keeps complete asset availability pending',{timeout:3600000},()=>testMetadataAvailability('pending-catalog'));
