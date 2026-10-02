// Standalone arm64 macOS diagnostic, not editor code or an engine patch.
// Mirrors the SCVTF/decode/CMP/FCSEL sequence observed at JSObject::initializeIndex
// in the hash-pinned WebKit 2336 framework. x0 is the synthetic encoded value;
// x0 returns the selected double's raw bits. No engine memory is accessed.
.text
.p2align 2
.globl _breditor_numeric_select_fcsel
_breditor_numeric_select_fcsel:
    mov x3, x0
    scvtf d0, w3
    mov x9, #-0x2000000000000
    add x9, x3, x9
    fmov d1, x9
    mov x9, #-0x2000000000001
    cmp x3, x9
    fcsel d0, d0, d1, hi
    fmov x0, d0
    ret

// Matched control: identical candidates/comparison, explicit branch selection.
.p2align 2
.globl _breditor_numeric_select_branch
_breditor_numeric_select_branch:
    mov x3, x0
    scvtf d0, w3
    mov x9, #-0x2000000000000
    add x9, x3, x9
    fmov d1, x9
    mov x9, #-0x2000000000001
    cmp x3, x9
    b.hi 1f
    fmov d0, d1
1:
    fmov x0, d0
    ret
