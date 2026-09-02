const CRC32C_REVERSED_POLYNOMIAL: u32 = 0x82F6_3B78;
const CRC32C_TABLE: [u32; 256] = build_table();

pub(super) fn crc32c(parts: &[&[u8]]) -> u32 {
    let mut state = u32::MAX;
    for part in parts {
        for byte in *part {
            let index = usize::from(state.to_le_bytes()[0] ^ *byte);
            state = CRC32C_TABLE[index] ^ (state >> 8);
        }
    }
    !state
}

#[allow(clippy::cast_possible_truncation)]
const fn build_table() -> [u32; 256] {
    let mut table = [0; 256];
    let mut index = 0;
    while index < table.len() {
        // The loop bound proves that this conversion is always in 0..=255.
        let mut value = index as u32;
        let mut bit = 0;
        while bit < 8 {
            value =
                if value & 1 == 0 { value >> 1 } else { (value >> 1) ^ CRC32C_REVERSED_POLYNOMIAL };
            bit += 1;
        }
        table[index] = value;
        index += 1;
    }
    table
}

#[cfg(test)]
mod tests {
    use super::crc32c;

    #[test]
    fn crc32c_matches_the_castagnoli_check_value_and_is_chunk_independent() {
        assert_eq!(crc32c(&[b"123456789"]), 0xE306_9283);
        assert_eq!(crc32c(&[b"123", b"456", b"789"]), 0xE306_9283);
        assert_eq!(crc32c(&[]), 0);
        assert_eq!(crc32c(&[b""]), 0);
    }
}
