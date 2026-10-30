import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
test('source-owned metadata and complete upload availability: opaque',{timeout:3600000},()=>testMetadataAvailability('opaque'));
