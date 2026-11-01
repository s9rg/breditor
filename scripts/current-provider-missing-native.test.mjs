import test from 'node:test';
import {testMetadataAvailability} from './fixtures/local-metadata/asset-availability.mjs';
import {testCurrentProviderMissing} from './fixtures/local-metadata/current-provider-missing.mjs';
import {inspectionNativeRoot} from './fixtures/server-packet-inspection/native-root.mjs';
test('current server references never hide actual missing provider mappings or pending original metadata operations',{timeout:7200000},()=>testMetadataAvailability('opaque',{nativeHostRoot:inspectionNativeRoot,onAvailable:testCurrentProviderMissing}));
