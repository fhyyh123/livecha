import type { ImageCompressOptions } from "../utils/imageCompress";

export const AVATAR_COMPRESS_OPTS: ImageCompressOptions = {
    maxSide: 512,
    maxBytes: 250 * 1024,
    preferWebp: true,
    quality: 0.86,
};

export const WIDGET_LOGO_COMPRESS_OPTS: ImageCompressOptions = {
    maxSide: 256,
    maxBytes: 200 * 1024,
    preferWebp: true,
    quality: 0.9,
};
