import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { landingReport } from "../scripts/landing-report";

test("report groups retained signup and first draft timings without returning identities", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE user(id TEXT, createdAt); CREATE TABLE drafts(owner_user_id TEXT, created_at INTEGER);
      INSERT INTO user VALUES ('private-a',1800000000000),('private-b','2027-01-15 08:00:00');
      INSERT INTO drafts VALUES ('private-a',1800000042),('private-a',1800000999),('private-b',1800003700);`);
    const report = landingReport(db);
    expect(report.firstSavedDraft).toEqual([{ bucket: "under_1m", count: 1 }, { bucket: "1h_to_24h", count: 1 }]);
    expect(report.signups).toEqual([{ day: "2027-01-15", count: 2 }]);
    expect(JSON.stringify(report)).not.toContain("private-");
    db.exec("DELETE FROM drafts WHERE owner_user_id='private-a'");
    expect(landingReport(db).firstSavedDraft).toEqual([{ bucket: "1h_to_24h", count: 1 }]);
  } finally { db.close(); }
});

test("empty databases produce an empty aggregate report", () => {
  const db = new Database(":memory:");
  try { expect(landingReport(db)).toEqual({ events: [], signups: [], firstSavedDraft: [] }); }
  finally { db.close(); }
});
