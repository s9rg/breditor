/* Child-only native conversion experiment. Same JSValue64 numeric semantics
 * as the pinned two conversions, but no floating-point conditional selects.
 * The launcher appends the absolute jump back to original comparison code.
 */
.text
.globl _breditor_branch_conversion
_breditor_branch_conversion:
    mov x8, #-0x2000000000000
    mov x9, #-0x2000000000001
    cmp x0, x9
    b.hi 1f
    add x3, x0, x8
    fmov d0, x3
    b 2f
1:
    scvtf d0, w0
2:
    cmp x2, x9
    b.hi 3f
    add x3, x2, x8
    fmov d1, x3
    b 4f
3:
    scvtf d1, w2
4:
    ldr x16, 5f
    br x16
5:
    .quad 0
