export type ImageCompressOptions = {
    maxSide: number;
    maxBytes: number;
    preferWebp?: boolean;
    quality?: number;
};

export type ImageCompressResult = {
    blob: Blob;
    contentType: string;
    filename: string;
};

function normalizeImageContentType(ct: string): string {
    const t = String(ct || "").trim().toLowerCase();
    if (t === "image/jpg") return "image/jpeg";
    return t;
}

function filenameWithExt(originalName: string, contentType: string): string {
    const name = String(originalName || "").trim() || "upload";
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ct = normalizeImageContentType(contentType);
    if (ct === "image/webp") return `${base}.webp`;
    if (ct === "image/png") return `${base}.png`;
    if (ct === "image/jpeg") return `${base}.jpg`;
    if (ct === "image/gif") return `${base}.gif`;
    return name;
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    const t = normalizeImageContentType(type);
    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => {
                if (b) resolve(b);
                else reject(new Error("to_blob_failed"));
            },
            t,
            quality,
        );
    });
}

function canvasCanEncodeWebp(): boolean {
    try {
        const c = document.createElement("canvas");
        const url = c.toDataURL("image/webp");
        return typeof url === "string" && url.startsWith("data:image/webp");
    } catch {
        return false;
    }
}

async function decodeImage(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }> {
    // Prefer createImageBitmap (faster & can honor EXIF orientation in some browsers).
    if (typeof createImageBitmap === "function") {
        try {
            // Some browsers support imageOrientation; TS types may not, so cast.
            const bitmap = await (createImageBitmap as any)(file, { imageOrientation: "from-image" });
            return {
                width: bitmap.width,
                height: bitmap.height,
                draw: (ctx) => {
                    ctx.drawImage(bitmap, 0, 0);
                    try {
                        bitmap.close?.();
                    } catch {
                        // ignore
                    }
                },
            };
        } catch {
            // fall back
        }
    }

    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        return {
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            draw: (ctx) => ctx.drawImage(img, 0, 0),
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function compressImageForUpload(file: File, opts: ImageCompressOptions): Promise<ImageCompressResult> {
    if (!file) throw new Error("missing_file");

    const inputType = normalizeImageContentType(file.type);

    // Avoid breaking animated gifs: keep as-is.
    if (inputType === "image/gif") {
        return {
            blob: file,
            contentType: "image/gif",
            filename: filenameWithExt(file.name, "image/gif"),
        };
    }

    const maxSide = Math.max(16, Math.trunc(Number(opts.maxSide) || 0));
    const maxBytes = Math.max(16 * 1024, Math.trunc(Number(opts.maxBytes) || 0));
    const preferWebp = opts.preferWebp !== false;
    const initialQ = typeof opts.quality === "number" && Number.isFinite(opts.quality) ? opts.quality : 0.86;

    const decoded = await decodeImage(file);
    const srcW = Math.max(1, Math.trunc(decoded.width));
    const srcH = Math.max(1, Math.trunc(decoded.height));

    const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * ratio));
    const outH = Math.max(1, Math.round(srcH * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_2d_unavailable");

    // High-quality downscale.
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    decoded.draw(ctx);

    const canWebp = preferWebp && canvasCanEncodeWebp();

    // If we can encode webp, prefer it (alpha-safe + typically smaller).
    // Otherwise: keep png if the input was png (avoid losing transparency), else use jpeg.
    const primaryType = canWebp ? "image/webp" : inputType === "image/png" ? "image/png" : "image/jpeg";
    const secondaryType = primaryType === "image/webp" ? (inputType === "image/png" ? "image/png" : "image/jpeg") : "";

    const tryEncode = async (contentType: string): Promise<Blob> => {
        const t = normalizeImageContentType(contentType);
        if (t === "image/png") {
            // PNG has no quality param.
            return await toBlob(canvas, "image/png");
        }

        // Iterate quality down until within maxBytes.
        let q = initialQ;
        let last: Blob | null = null;
        for (let i = 0; i < 6; i++) {
            const b = await toBlob(canvas, t, q);
            last = b;
            if (b.size <= maxBytes) return b;
            q = Math.max(0.6, q - 0.08);
        }
        if (last) return last;
        throw new Error("encode_failed");
    };

    let blob: Blob;
    let contentType: string;
    try {
        blob = await tryEncode(primaryType);
        contentType = primaryType;
    } catch {
        if (!secondaryType) throw new Error("encode_failed");
        blob = await tryEncode(secondaryType);
        contentType = secondaryType;
    }

    // If encoding didn't improve and no resize happened, allow passthrough to avoid surprises.
    // Still normalizes content-type (image/jpg -> image/jpeg).
    const resized = outW !== srcW || outH !== srcH;
    if (!resized && blob.size >= file.size && (inputType === contentType || !inputType)) {
        return {
            blob: file,
            contentType: inputType || "application/octet-stream",
            filename: filenameWithExt(file.name, inputType || ""),
        };
    }

    return {
        blob,
        contentType,
        filename: filenameWithExt(file.name, contentType),
    };
}
