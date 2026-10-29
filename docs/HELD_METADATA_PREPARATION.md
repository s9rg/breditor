# Compound metadata preparation under native recovery

Status: [source and independently installed qualification passed](qualification/2026-10-29-held-metadata-preparation.json): 676 direct checks, 106 installed checks, eight strict source type stages and two installed type stages. All thirteen V1 gates remain open.

Preparation opens the original atomic version catalog, suggestion queue and
revision outbox inside an actual segmented or independently selected source.
The source constructor supplies the private factories, retained bindings and
original committed-record driver. A copied source, copied context, public field
or serialized option cannot select this path.

Preparation starts no network work, requests no credential and performs no
startup save. It compares the exact live and committed atomic record bytes
before construction and after asynchronous lease acquisition. Unsaved or
changed records refuse; they are never relabeled as committed. Absent retained
bindings remain absent. Existing children are reused without invoking their old
transport/token callbacks; already closed children refuse rather than returning
an unusable owner or silently abandoning failed work.

New work owners have ordinary permissions, even though their construction is
admitted under an exact native hold. Ordinary mutations and ordinary opens
remain excluded until the hold ends. A separate admitted opening witness tracks
the actual asynchronous preparation promise. Closing recovery stops further
preparation and waits for late lock callbacks; it does not release native flags
early. Children already opened stay owned by the original source, with exact
packets and pending choices available to a later attempt.

The newly prepared revision dependency is explicitly disconnected. Its network
methods refuse as unconfigured; its read state reports no permissions. Version
publication uses a separate native delivery controller with fresh callbacks.
Preparation itself supplies no server acceptance, grant or room activation.

Functional coverage includes all four independent document/comment history
combinations plus retained segmented history, each with original/general/document
selection and explicit/typing/owned history policies. It checks exact pending
proposal, revision, decision and version records; zero writes and network calls;
ordinary exclusion; cancelled lock acquisition; cold reopen; and future native
Undo/Redo. Whole-room coverage prepares all four already-bound source families,
publishes their original version packets through the actual server, preserves
pending suggestion/revision packets, then cold-reopens all seven source families.

Suggestion/revision transport, metadata binding for the three local lanes,
complete provider/client/historical-copy/assets reconciliation and authenticated
joint activation remain required. All thirteen V1 gates remain open.
