// Standalone diagnostic only. Reproduce the pinned JavaScriptCore numeric
// conversion sequence without linking JavaScriptCore or loading editor code.
// Inputs: x0/x1 encoded numbers, x2 output pointer. Clobbers caller-saved regs.
// The branch control changes only conditional-selection implementation.
.text
.p2align 2
.macro CONVERSION name, branch
.globl _\name
_\name:
    mov x10, x2
    mov x2, x1
    scvtf d0, w0
    mov x8, #-0x2000000000000
    add x9, x0, x8
    fmov d1, x9
    mov x9, #-0x2000000000001
    cmp x0, x9
.if \branch
    b.hi 1f
    fmov d0, d1
1:
.else
    fcsel d0, d0, d1, hi
.endif
    scvtf d1, w2
    add x8, x2, x8
    fmov d2, x8
    cmp x2, x9
.if \branch
    b.hi 2f
    fmov d1, d2
2:
.else
    fcsel d1, d1, d2, hi
.endif
    fcmp d0, d0
    fccmp d1, d1, #1, vc
    fmov x8, d0
    fmov x9, d1
    stp x8, x9, [x10]
    ret
.endm
CONVERSION breditor_conversion_fcsel, 0
CONVERSION breditor_conversion_branch, 1
