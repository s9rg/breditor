/** Native recovery reservation and actual-owner composition stay SDK-private. */
import * as api from '@breditor/collaboration';
declare const core:api.SharedRichEditor,read:api.SharedPhysicalRecoveryAcceptedRead;
// @ts-expect-error A public package caller cannot manufacture native exclusion.
api.reserveNativeRecovery;
// @ts-expect-error Genuine selected-owner composition is not a public callback API.
api.withSelectedNativeRecovery;
// @ts-expect-error The reservation contract is not a public writer capability.
type Reservation=api.NativeRecoveryReservation;
// @ts-expect-error A payload does not provide actual mutable clients.
read.clients;
// @ts-expect-error A payload cannot supply import, custody or activation authority.
read.native;
// @ts-expect-error Public facades do not expose a raw owner or a recovery token.
core.nativeRecovery;
// @ts-expect-error The native guard is private and cannot authorize publication.
core.nativeRecoveryAccess;
