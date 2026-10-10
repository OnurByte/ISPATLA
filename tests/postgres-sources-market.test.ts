import { expect, test } from "bun:test";
import { savePostgresCompetitor } from "@/server/postgres-sources-market";

test("PostgreSQL competitor writes reject malformed handles before touching the database", async () => {
  await expect(savePostgresCompetitor("owner-1", { handle: "bad handle", now: 1 })).rejects.toThrow("geçerli 𝕏 handle gerekli");
});
