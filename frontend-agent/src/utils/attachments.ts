const RASTER_IMAGE_EXTS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "bmp",
    "ico",
    "avif",
]);

function getFileExt(filename?: string): string {
    const name = String(filename || "").trim();
    if (!name) return "";
    const i = name.lastIndexOf(".");
    if (i < 0) return "";
    return name.slice(i + 1).toLowerCase();
}

export function isPreviewableImage(mime?: string, filename?: string): boolean {
    const m = String(mime || "").trim().toLowerCase();

    // Exclude SVG for safety; treat it as a normal file.
    if (m === "image/svg+xml") return false;

    if (m.startsWith("image/")) return true;

    const ext = getFileExt(filename);
    return Boolean(ext && RASTER_IMAGE_EXTS.has(ext));
}
