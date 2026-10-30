import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
test('source-owned availability cancellation during genuine account wait',{timeout:3600000},()=>testMetadataAvailability('cancelled-token'));
