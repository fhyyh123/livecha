export function errorMessage(err: unknown, fallback: string): string {
    if (!err) return fallback;
    if (err instanceof Error) return err.message || fallback;
    if (typeof err === "string") return err || fallback;
    try {
        return String(err) || fallback;
    } catch {
        return fallback;
    }
}
