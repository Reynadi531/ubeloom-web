/** Minimal Telegram Bot API client over fetch. */

const API = "https://api.telegram.org";

export type Update = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    text?: string;
  };
};

type ApiResponse<T> = { ok: true; result: T } | { ok: false; description: string };

export class TelegramError extends Error {
  override name = "TelegramError";
}

export function createTelegram(token: string) {
  const base = `${API}/bot${token}`;

  async function call<T>(
    method: string,
    body: Record<string, unknown> | FormData,
    signal?: AbortSignal,
  ) {
    const response = await fetch(`${base}/${method}`, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
      signal,
    });
    const data = (await response.json()) as ApiResponse<T>;
    if (!data.ok) throw new TelegramError(`${method}: ${data.description}`);
    return data.result;
  }

  return {
    sendMessage(chatId: string | number, html: string) {
      return call("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    },

    /** Sends a file as a photo (images) or document (anything else) with an HTML caption. */
    sendFile(chatId: string | number, file: Blob, filename: string, caption: string) {
      const asPhoto = file.type.startsWith("image/");
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set("caption", caption);
      form.set("parse_mode", "HTML");
      form.set(asPhoto ? "photo" : "document", file, filename);
      return call(asPhoto ? "sendPhoto" : "sendDocument", form);
    },

    getUpdates(offset: number, signal: AbortSignal) {
      return call<Update[]>(
        "getUpdates",
        { offset, timeout: 30, allowed_updates: ["message"] },
        signal,
      );
    },

    setMyCommands(commands: { command: string; description: string }[]) {
      return call("setMyCommands", { commands });
    },
  };
}

export type Telegram = ReturnType<typeof createTelegram>;

export const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
