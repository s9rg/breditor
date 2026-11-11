/** Component checks preserve ordinary protocols and actual Native ownership.
 * These do not certify the complete local-actor joint activation coordinator. */
export const nativePublicationTests=Object.freeze(['native-publication-transport.test.mjs','native-publication-coordinated.test.mjs']);
export const nativePublicationTypes=Object.freeze(['scripts/fixtures/native-publication/types.mts']);
export const nativePublicationData=Object.freeze([]);
export const nativePublicationCaseCount=23;
export const nativePublicationTimeoutMs=7200000+180000;
export const nativePublicationBuildReport='target/sdk-native-publication-native-build.json';
