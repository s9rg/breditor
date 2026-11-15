//! A descriptor-limited restore and a separate cold worker read every exact upload queue.
use super::{POLICY, Source, TestResult};
use crate::{
    RelaySegmentClientUploadPin,
    assets::asset_id,
    log::generations::GenerationDirectory,
    server::{RelaySegmentPortableBackupIdentity, RelaySegmentRetainedBackup},
};
use std::{
    fs,
    io::{Cursor, Read},
    path::PathBuf,
    process::Command,
};

const QUEUES: usize = 52;

#[tokio::test]
async fn many_original_upload_queues_restore_and_reopen_under_a_small_file_limit() -> TestResult {
    let source = Source::open()?;
    let mut writers = source
        .handle
        .host
        .transaction(|room| {
            (0..QUEUES)
                .map(|_| room.register("owner").map(|registered| registered.lease.writer))
                .collect::<crate::Result<Vec<_>>>()
        })
        .await?;
    writers.sort();
    let split = source.parent.join("split-uploads");
    let mut selection =
        source.handle.capture_portable_relay_segment("owner", &source.token, &split)?;
    let uploads = GenerationDirectory::create(&split.join("standalone-uploads"))?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(1, 1).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    for (index, writer) in writers.into_iter().enumerate() {
        let bytes = queue(&writer, &png)?;
        uploads.create_file(&format!("{index}.uploads"), &bytes)?;
        selection.retained.standalone_uploads.push(RelaySegmentClientUploadPin {
            writer,
            bytes: bytes.len() as u64,
            sha256: asset_id(&bytes)[7..].into(),
        });
    }
    drop(uploads);
    let packed = source.parent.join("packed-uploads");
    RelaySegmentRetainedBackup::copy_portable_fully_packed(&split, &packed, &selection)?;
    fs::rename(split, source.parent.join("parked-uploads"))?;
    let bundle = RelaySegmentRetainedBackup::open_portable(&packed, &selection)?;
    let target = bundle.restore(&source.parent.join("existing-room"), "existing", POLICY)?;
    assert_eq!(
        target.client_upload_pins()?.ok_or("upload roster")?,
        selection.retained.standalone_uploads
    );
    drop((target, bundle));
    fs::write(source.parent.join("upload-selection.json"), serde_json::to_vec(&selection)?)?;

    let mut failures = Vec::new();
    for mode in ["restore", "cold"] {
        let worker = Command::new("/bin/sh")
            .args(["-c", "ulimit -n 48 && exec \"$@\"", "sh"])
            .arg(std::env::current_exe()?)
            .args([
                "--exact",
                "server::segment_handover::tests::many_uploads::cold_upload_worker",
                "--nocapture",
            ])
            .env("BREDITOR_MANY_UPLOADS_FIXTURE", &source.parent)
            .env("BREDITOR_MANY_UPLOADS_MODE", mode)
            .output()?;
        if !worker.status.success() {
            failures.push(format!(
                "{mode}: {} {}",
                String::from_utf8_lossy(&worker.stdout),
                String::from_utf8_lossy(&worker.stderr)
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    Ok(())
}

#[test]
fn cold_upload_worker() -> TestResult {
    let Some(root) = std::env::var_os("BREDITOR_MANY_UPLOADS_FIXTURE") else {
        return Ok(());
    };
    let root = PathBuf::from(root);
    let selection: RelaySegmentPortableBackupIdentity =
        serde_json::from_slice(&fs::read(root.join("upload-selection.json"))?)?;
    let bundle =
        RelaySegmentRetainedBackup::open_portable(&root.join("packed-uploads"), &selection)?;
    let target = match std::env::var("BREDITOR_MANY_UPLOADS_MODE")?.as_str() {
        "restore" => bundle.restore(&root.join("new-room"), "new", POLICY)?,
        "cold" => bundle.backup().reopen(&root.join("existing-room"), POLICY)?,
        _ => return Err("unknown upload fixture mode".into()),
    };
    assert_eq!(
        target.client_upload_pins()?.ok_or("upload roster")?,
        selection.retained.standalone_uploads
    );
    for pin in &selection.retained.standalone_uploads {
        let mut file =
            target.open_client_upload_archive(&pin.writer)?.ok_or("retained original")?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        assert_eq!(bytes.len() as u64, pin.bytes);
        assert_eq!(&asset_id(&bytes)[7..], pin.sha256);
        let receipt = format!("queue-for-{}", pin.writer);
        assert!(bytes.windows(receipt.len()).any(|part| part == receipt.as_bytes()));
    }
    assert!(target.open_client_upload_archive("99999")?.is_none());
    let (_room, _assets, custody) = target.into_deployment_parts()?;
    let mut exported = selection.retained.clone();
    exported.standalone_uploads.clear();
    let mut output = Vec::new();
    custody.write_portable_inputs(&mut output, &mut exported)?;
    assert_eq!(exported, selection.retained);
    let mut original_queues = output.as_slice();
    for pin in &exported.standalone_uploads {
        let (queue, remaining) = original_queues.split_at(usize::try_from(pin.bytes)?);
        assert_eq!(&asset_id(queue)[7..], pin.sha256);
        original_queues = remaining;
    }
    assert!(original_queues.is_empty());
    Ok(())
}

fn queue(writer: &str, png: &[u8]) -> TestResult<Vec<u8>> {
    let records = format!(
        concat!(
            r#"[{{"asset":"{}","mime":"image/png","bytes":{},"width":1,"height":1,"status":"uploaded","#,
            r#""attempts":1,"storageRef":"queue-for-{writer}","failure":null,"epoch":7,"offset":0}}]"#,
        ),
        asset_id(png),
        png.len(),
        writer = writer,
    );
    let header = format!(
        r#"{{"format":"breditor/raster-asset-archive","formatVersion":1,"records":{records}}}"#
    );
    let header = format!(
        r#"{},"sha256":"{}"}}"#,
        &header[..header.len() - 1],
        &asset_id(header.as_bytes())[7..]
    );
    let mut bytes = b"BREDITOR-ASSETS1\n".to_vec();
    bytes.extend(u32::try_from(header.len())?.to_be_bytes());
    bytes.extend(header.bytes());
    bytes.extend(png);
    Ok(bytes)
}
