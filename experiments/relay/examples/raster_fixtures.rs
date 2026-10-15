//! Deterministic native-encoded acceptance fixtures; browsers need not implement canvas encoders.
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use serde_json::json;
use std::{fs, io::Cursor};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut entries = Vec::new();
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let mut buffer = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(RgbImage::from_pixel(2, 3, Rgb([17, 119, 221])))
            .write_to(&mut buffer, format)?;
        let bytes = buffer.into_inner();
        let asset = breditor_collab_relay::assets::asset_id(&bytes);
        breditor_collab_relay::assets::prepare_asset(&asset, mime, bytes.clone())?;
        entries.push(json!({"asset":asset,"mime":mime,"bytes":bytes,"width":2,"height":3}));
    }
    for shade in 0..7_u8 {
        let mut buffer = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(RgbImage::from_pixel(2, 3, Rgb([shade, 119, 221])))
            .write_to(&mut buffer, ImageFormat::Png)?;
        let bytes = buffer.into_inner();
        entries.push(json!({"asset":breditor_collab_relay::assets::asset_id(&bytes),"mime":"image/png","bytes":bytes,"width":2,"height":3}));
    }
    let output = std::env::args().nth(1).ok_or("raster fixture output path required")?;
    fs::write(output, serde_json::to_vec(&entries)?)?;
    Ok(())
}
