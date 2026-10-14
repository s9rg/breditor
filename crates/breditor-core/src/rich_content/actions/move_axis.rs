//! One stable before-anchor move algorithm shared by row metadata and cell order.

pub(super) fn move_before<T>(values: &mut Vec<T>, source: usize, before: usize) {
    if source == before || source + 1 == before {
        return;
    }
    let value = values.remove(source);
    values.insert(if source < before { before - 1 } else { before }, value);
}
