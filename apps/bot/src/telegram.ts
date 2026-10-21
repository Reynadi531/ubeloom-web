/** Minimal Telegram Bot API client over fetch. */

const API = "https://api.telegram.org";

export type User = { id: number; first_name: string; username?: string };

export type Message = {
  message_id: number;
  chat: { id: number; type: string; title?: string };
  from?: User;
  text?: string;
  reply_to_message?: Message;
};

export type CallbackQuery = { id: string; from: User; message?: Message; data?: string };

export type Update = { update_id: number; message?: Message; callback_query?: CallbackQuery };

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };
export type ReplyMarkup =
  | InlineKeyboard
  | { force_reply: true; input_field_placeholder?: string; selective?: boolean };

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
    sendMessage(chatId: string | number, html: string, replyMarkup?: ReplyMarkup) {
      return call<Message>("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: replyMarkup,
      });
    },

    /** Sends a file as a photo (images) or document (anything else) with an HTML caption. */
    sendFile(
      chatId: string | number,
      file: Blob,
      filename: string,
      caption: string,
      replyMarkup?: ReplyMarkup,
    ) {
      const asPhoto = file.type.startsWith("image/");
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set("caption", caption);
      form.set("parse_mode", "HTML");
      form.set(asPhoto ? "photo" : "document", file, filename);
      if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
      return call<Message>(asPhoto ? "sendPhoto" : "sendDocument", form);
    },

    editMessageText(
      chatId: string | number,
      messageId: number,
      html: string,
      replyMarkup?: InlineKeyboard,
    ) {
      return call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: replyMarkup,
      });
    },

    /** Replaces (or, without `replyMarkup`, removes) a message's inline keyboard. */
    editReplyMarkup(chatId: string | number, messageId: number, replyMarkup?: InlineKeyboard) {
      return call("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
      });
    },

    answerCallback(callbackQueryId: string, text?: string, showAlert = false) {
      return call("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });
    },

    getUpdates(offset: number, signal: AbortSignal) {
      return call<Update[]>(
        "getUpdates",
        { offset, timeout: 30, allowed_updates: ["message", "callback_query"] },
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
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
