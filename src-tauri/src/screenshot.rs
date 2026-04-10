use base64::{Engine as _, engine::general_purpose};
use image::DynamicImage;
use xcap::Monitor;

#[tauri::command]
pub async fn capture_screenshot() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // Get primary monitor (D-02: full primary monitor)
        let monitors = Monitor::all().map_err(|e| format!("Monitor enumeration failed: {e}"))?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .ok_or_else(|| "No primary monitor found".to_string())?;

        // Capture full screen image
        let img = monitor
            .capture_image()
            .map_err(|e| format!("Screen capture failed: {e}"))?;

        // Convert to DynamicImage for resize (xcap returns image::RgbaImage)
        let dynamic = DynamicImage::ImageRgba8(img);

        // Resize to 1280px wide, maintain aspect ratio (D-03)
        let resized = dynamic.resize(1280, u32::MAX, image::imageops::FilterType::Lanczos3);

        // Encode to JPEG at 80% quality (D-03)
        let mut jpeg_bytes: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
        resized
            .write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|e| format!("JPEG encode failed: {e}"))?;

        // Base64 encode for Claude vision API
        let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
        Ok(b64)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
