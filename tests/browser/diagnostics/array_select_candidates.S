// Auditable paired bodies; launcher replaces final B targets at runtime.
.text
.globl _breditor_array_select_relocated
_breditor_array_select_relocated:
    fcsel d0, d0, d1, hi
    nop
    b _breditor_array_select_relocated
.globl _breditor_array_select_branch
_breditor_array_select_branch:
    b.hi done
    fmov d0, d1
done:
    b _breditor_array_select_branch
