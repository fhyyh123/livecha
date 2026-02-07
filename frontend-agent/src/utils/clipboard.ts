function extFromMime(mime: string): string {
    const t = String(mime || "").toLowerCase();
    if (t === "image/png") return "png";
    if (t === "image/jpeg" || t === "image/jpg") return "jpg";
    if (t === "image/webp") return "webp";
    if (t === "image/gif") return "gif";
    if (t === "image/bmp") return "bmp";
    return "png";
}

function normalizeImageMime(mime: string): string {
    const t = String(mime || "").toLowerCase();
    if (t === "image/jpg") return "image/jpeg";
    return t || "image/png";
}

export function extractImageFileFromClipboardData(
    clipboardData: DataTransfer | null | undefined,
    options?: { filenameBase?: string },
): File | null {
    const list = extractImageFilesFromClipboardData(clipboardData, options);
    return list[0] || null;
}

export function extractImageFilesFromClipboardData(
    clipboardData: DataTransfer | null | undefined,
    options?: { filenameBase?: string },
): File[] {
    if (!clipboardData) return [];

    const items = clipboardData.items;
    if (!items || !items.length) return [];

    const out: File[] = [];
    const base = String(options?.filenameBase || "pasted-image").trim() || "pasted-image";

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const type = normalizeImageMime(it?.type || "");
        if (!type.startsWith("image/")) continue;

        const f = typeof it.getAsFile === "function" ? it.getAsFile() : null;
        if (!f) continue;

        const ext = extFromMime(type);
        const nameRaw = f.name && String(f.name).trim() ? String(f.name).trim() : "";
        const name = nameRaw || `${base}-${out.length + 1}.${ext}`;
        const mime = f.type ? normalizeImageMime(f.type) : type;

        try {
            out.push(new File([f], name, { type: mime || type || "image/png" }));
        } catch {
            (f as File & { name?: string }).name = name;
            out.push(f);
        }
    }

    return out;
}
