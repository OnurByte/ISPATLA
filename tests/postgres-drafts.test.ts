import { expect, test } from "bun:test";

test("draft operations require an authenticated owner before touching PostgreSQL", async () => {
  const { getPostgresDrafts, savePostgresDraft } = await import("@/server/postgres-drafts");
  await expect(getPostgresDrafts()).rejects.toThrow("Oturum gerekli");
  await expect(savePostgresDraft({ text: "test" })).rejects.toThrow("Oturum gerekli");
});
