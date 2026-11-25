//! Lower the trusted worker's inherited process limits before accepting image bytes.
use rlimit::Resource;
use std::io;

const CPU_SECONDS: u64 = 10;
const OPEN_FILES: u64 = 64;
#[cfg(target_os = "linux")]
const ADDRESS_SPACE_BYTES: u64 = 768 * 1024 * 1024;

fn lower(resource: Resource, cap: u64) -> io::Result<()> {
    let (soft, hard) = resource.get()?;
    resource.set(soft.min(cap), hard.min(cap))
}

pub(super) fn apply() -> io::Result<()> {
    lower(Resource::CPU, CPU_SECONDS)?;
    lower(Resource::NOFILE, OPEN_FILES)?;
    lower(Resource::CORE, 0)?;
    lower(Resource::FSIZE, 0)?;
    #[cfg(target_os = "linux")]
    lower(Resource::AS, ADDRESS_SPACE_BYTES)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn decoder_caps_only_its_own_process_and_preserves_tighter_limits() -> io::Result<()> {
        const CHILD: &str = "BREDITOR_RASTER_LIMIT_TEST_CHILD";
        if std::env::var_os(CHILD).is_none() {
            let before = [Resource::CPU, Resource::NOFILE, Resource::CORE, Resource::FSIZE]
                .map(Resource::get);
            let output = Command::new(std::env::current_exe()?)
                .args([
                    "--exact",
                    "raster_worker_limits::tests::decoder_caps_only_its_own_process_and_preserves_tighter_limits",
                ])
                .env(CHILD, "1")
                .output()?;
            assert!(
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout).contains("1 passed"),
                "resource child did not pass: {}",
                String::from_utf8_lossy(&output.stdout)
            );
            for (resource, inherited) in
                [Resource::CPU, Resource::NOFILE, Resource::CORE, Resource::FSIZE]
                    .into_iter()
                    .zip(before)
            {
                assert_eq!(resource.get()?, inherited?);
            }
            return Ok(());
        }

        let (soft, hard) = Resource::NOFILE.get()?;
        let narrower = (soft.min(32), hard.min(48));
        Resource::NOFILE.set(narrower.0, narrower.1)?;
        apply()?;
        assert_eq!(Resource::NOFILE.get()?, narrower);
        let (cpu_soft, cpu_hard) = Resource::CPU.get()?;
        assert!(cpu_soft <= CPU_SECONDS && cpu_hard <= CPU_SECONDS);
        assert_eq!(Resource::CORE.get()?, (0, 0));
        assert_eq!(Resource::FSIZE.get()?, (0, 0));
        #[cfg(target_os = "linux")]
        {
            let (memory_soft, memory_hard) = Resource::AS.get()?;
            assert!(memory_soft <= ADDRESS_SPACE_BYTES && memory_hard <= ADDRESS_SPACE_BYTES);
        }
        Ok(())
    }
}
