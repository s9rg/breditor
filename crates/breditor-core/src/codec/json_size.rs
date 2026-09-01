use std::io;

/// Allocation-free writer that stops at one configured JSON byte budget.
pub(crate) struct JsonByteCounter {
    bytes: usize,
    maximum: usize,
    exceeded: bool,
}

impl JsonByteCounter {
    pub(crate) const fn new(maximum: usize) -> Self {
        Self { bytes: 0, maximum, exceeded: false }
    }

    pub(crate) const fn bytes(&self) -> usize {
        self.bytes
    }

    pub(crate) const fn exceeded(&self) -> bool {
        self.exceeded
    }
}

impl io::Write for JsonByteCounter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if let Some(bytes) = self.bytes.checked_add(buffer.len()) {
            self.bytes = bytes;
        } else {
            self.bytes = usize::MAX;
            self.exceeded = true;
            return Err(io::Error::other("JSON byte count overflowed"));
        }
        if self.bytes > self.maximum {
            self.exceeded = true;
            return Err(io::Error::other("JSON byte budget exceeded"));
        }
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write as _;

    use super::JsonByteCounter;

    #[test]
    fn encoded_byte_count_overflow_is_distinct_from_the_exact_usize_maximum() {
        let mut counter =
            JsonByteCounter { bytes: usize::MAX, maximum: usize::MAX, exceeded: false };
        assert!(counter.write_all(&[0]).is_err());

        assert_eq!(counter.bytes(), usize::MAX);
        assert!(counter.exceeded());
    }

    #[test]
    fn encoded_byte_counter_stops_at_the_first_over_budget_chunk() -> std::io::Result<()> {
        let mut counter = JsonByteCounter::new(3);
        counter.write_all(&[0, 1])?;
        assert!(counter.write_all(&[2, 3]).is_err());

        assert_eq!(counter.bytes(), 4);
        assert!(counter.exceeded());
        Ok(())
    }
}
