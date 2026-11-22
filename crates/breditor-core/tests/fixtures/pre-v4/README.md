# Local checkpoints from before rich language V4

These canonical checkpoint bytes came from the native core at
`79ba07cb2ab4fe5b056bf96bf755175531987c7e` (the merge of PR #12), using its
`rich_session_recovery` fixture's `populate` scenario and the matching V1, V2,
or V3 compiler. After five edits, the producer undid the split, selected the
caption at offset 2, and applied an empty pending-format override before saving.
All three captures use the same application schema identity so the language
fingerprint is what distinguishes the stored profiles.

Run `cargo test -p breditor-core --features experimental-rich-content --test historical_rich_checkpoints`
to check the current reader against these saved bytes. Keep the captures as
inputs from the historical producer.
