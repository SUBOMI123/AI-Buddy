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

/// Capture a specific region of the primary monitor at physical pixel coordinates.
/// Validates bounds before capture (T-04-01: ASVS V5 input validation).
/// Returns a base64-encoded JPEG string suitable for Claude vision API (D-08, D-09).
#[tauri::command]
pub async fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Bounds validation (ASVS V5, D-09) — before monitor query
        if width == 0 || height == 0 {
            return Err("Invalid dimensions: width and height must be greater than 0".to_string());
        }
        if x < 0 || y < 0 {
            return Err("Invalid coordinates: x or y cannot be negative".to_string());
        }

        // Get primary monitor — identical to capture_screenshot
        let monitors = Monitor::all().map_err(|e| format!("Monitor enumeration failed: {e}"))?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .ok_or_else(|| "No primary monitor found".to_string())?;

        // Monitor bounds validation — after finding monitor
        // xcap Monitor exposes width()/height() as XCapResult<u32>
        let mon_width = monitor.width().map_err(|e| format!("Monitor width query failed: {e}"))?;
        let mon_height = monitor.height().map_err(|e| format!("Monitor height query failed: {e}"))?;
        if (x as u32) + width > mon_width || (y as u32) + height > mon_height {
            return Err(
                "Invalid coordinates: region extends beyond monitor bounds".to_string(),
            );
        }

        // xcap region capture (D-08: only the cropped region is captured)
        // x and y validated >= 0 above; cast to u32 is safe
        let img = monitor
            .capture_region(x as u32, y as u32, width, height)
            .map_err(|e| format!("Region capture failed: {e}"))?;
        let dynamic = DynamicImage::ImageRgba8(img);

        // Conditional resize: apply 1280px cap only when crop width exceeds it (D-03, D-09)
        let resized = if dynamic.width() > 1280 {
            dynamic.resize(1280, u32::MAX, image::imageops::FilterType::Lanczos3)
        } else {
            dynamic
        };

        // JPEG encode at 80% quality — identical to capture_screenshot
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
