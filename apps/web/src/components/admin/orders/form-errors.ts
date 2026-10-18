import type { z } from "zod";

/** First message per top-level field of a failed zod parse. */
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Readable message from a failed server fn call. Validator failures arrive as a
 * JSON list of zod issues; handler errors carry their (Indonesian) message.
 */
export function serverErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  try {
    const parsed: unknown = JSON.parse(message);
    if (Array.isArray(parsed)) {
      const first = parsed.find(
        (issue): issue is { message: string } => typeof issue?.message === "string",
      );
      if (first) return first.message;
    }
  } catch {
    // Not JSON: a plain handler error.
  }
  return message || "Terjadi kesalahan. Silakan coba lagi.";
}

/** Triggers a browser download of text content. */
export function downloadText(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
