/** First reproduce the actual source gap before changing the recovery contract.
 * Uses seven genuine parents and the original real catalog/receipt workflow. */
import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
import {reproducePendingSource} from './fixtures/local-metadata/pending-source-repro.mjs';
import {inspectionNativeRoot} from './fixtures/server-packet-inspection/native-root.mjs';
test('actual uncached metadata versions remain Pending while the selected server retains their complete Native packet sources',{timeout:7200000},()=>testMetadataAvailability('pending-catalog',{nativeHostRoot:inspectionNativeRoot,onAvailable:reproducePendingSource}));
