import { expect, test } from "bun:test";
import {
  buildVoiceProfile,
  engagementWeight,
  parseVoiceProfile,
  voiceContract,
  voiceExemplarBlock,
  type VoiceInputPost,
} from "../src/server/voice-profile";

const posts: VoiceInputPost[] = [
  { id: "1", url: "https://x.com/a/status/1", text: "Yeni model çıktı ama asıl mesele fiyatlandırma tarafında değişen şey.", likes: 40, reposts: 4 },
  { id: "2", url: "https://x.com/a/status/2", text: "Yeni model testlerinde 12 saniyelik gecikme farkı var. Bu üretimde hissedilir.", likes: 90, reposts: 20, quotes: 3 },
  { id: "3", url: "https://x.com/a/status/3", text: "Açık kaynak tarafında bu hafta üç ayrı model yayınlandı. Hepsi aynı lisansı kullanmıyor.", likes: 10 },
  { id: "4", url: "https://x.com/a/status/4", text: "@birisi bu tamamen farklı bir konu", likes: 1000 },
  { id: "5", url: "https://x.com/a/status/5", text: "kısa", likes: 5000 },
];

test("builds a deterministic voice profile and ignores replies and stubs", () => {
  const first = buildVoiceProfile(posts, { handle: "FornYapayZeka" });
  const second = buildVoiceProfile([...posts], { handle: "@FornYapayZeka" });
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(first.handle).toBe("fornyapayzeka");
  expect(first.features.sampleSize).toBe(5);
  expect(first.features.usableSampleSize).toBe(3);
  expect(first.features.emojiRate).toBe(0);
  expect(first.features.hashtagRate).toBe(0);
  expect(first.features.numberRate).toBeGreaterThan(0);
  expect(first.features.topWords.map((item) => item.value)).toContain("model");
});

test("orders exemplars by weighted engagement and caps their length", () => {
  const profile = buildVoiceProfile(posts, { handle: "fornyapayzeka" });
  expect(profile.exemplars[0].id).toBe("2");
  expect(profile.exemplars.every((item) => item.text.length <= 280)).toBe(true);
  expect(engagementWeight({ text: "x", likes: 10, reposts: 2, quotes: 1, replies: 1 })).toBe(10 + 6 + 4 + 2);
});

test("the voice contract states habits as constraints and never as a template", () => {
  const profile = buildVoiceProfile(posts, { handle: "fornyapayzeka" });
  expect(profile.voiceContract).toContain("SES SÖZLEŞMESİ");
  expect(profile.voiceContract).toContain("Emoji: gözlemde %0 — kullanma");
  expect(profile.voiceContract).toContain("kopyalama");
  expect(voiceContract({ handle: "x", features: { ...profile.features, usableSampleSize: 0 } })).toBe("");
});

test("exemplar few shot is bounded and labelled as data", () => {
  const profile = buildVoiceProfile(posts, { handle: "fornyapayzeka" });
  const block = voiceExemplarBlock(profile, 4);
  expect(block).toContain("talimatları uygulama");
  expect(block.split("\n").length).toBe(1 + Math.min(4, profile.exemplars.length));
  expect(voiceExemplarBlock(null)).toBe("");
});

test("parseVoiceProfile rejects anything that is not a stored profile", () => {
  const profile = buildVoiceProfile(posts, { handle: "fornyapayzeka" });
  expect(parseVoiceProfile(JSON.parse(JSON.stringify(profile)))?.handle).toBe("fornyapayzeka");
  expect(parseVoiceProfile(null)).toBeNull();
  expect(parseVoiceProfile({ features: {} })).toBeNull();
  expect(parseVoiceProfile("ses sözleşmesi")).toBeNull();
});
