import { createAuth } from "@web-kwu/auth";
import { createDb } from "@web-kwu/db";
import { createStorage } from "@web-kwu/storage";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const storage = createStorage(ENV);
