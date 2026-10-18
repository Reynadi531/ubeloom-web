import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = {
  ...defineRelations(schema),
  ...schema.shopRelations,
  // Last so its `user` relations win over the bare `user` entry from shopRelations.
  ...schema.authRelations,
};
