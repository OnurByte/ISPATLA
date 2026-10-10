import { CATEGORY_BASE_STRATEGIES, type CategoryBaseStrategy } from "./db-types";
import { isLocale, LOCALE_CONFIG, type Locale } from "@/i18n/config";

export function contentLocaleInstruction(value: unknown): string {
  const locale = (Array.isArray(value) ? value : [value]).find((item): item is Locale => typeof item === "string" && isLocale(item));
  if (!locale) return "";
  return `Taslağın dili: ${LOCALE_CONFIG[locale].nativeName}. Kullanıcının brief'inde açıkça başka bir dil istenirse brief önceliklidir.`;
}

export type DraftAngle = { id: string; label: string; brief: string };

export type WritingContract = {
  strategy: CategoryBaseStrategy;
  mission: string;
  mustHave: string[];
  bans: string[];
  angles: DraftAngle[];
};

export const DRAFT_FORMATS = ["post", "quote_comment", "thread_opener"] as const;
export type DraftFormat = (typeof DRAFT_FORMATS)[number];
export const LEGACY_DRAFT_FORMATS = ["quote", "reply", "thread", "dm"] as const;

/** Newsroom tics that mark a draft as an aggregator summary rather than a take. */
const SLOP_BANS = [
  "\"SON DAKİKA\", \"FLAŞ\", \"ÖZEL\" gibi haber bandı etiketleri yasak",
  "\"Kaynak:\", \"@hesap'a göre\", parantez içi atıf veya kaynak adı yazma (özel haber etiketi yoksa)",
  "\"önemli bir adım\", \"dikkat çekici\", \"gelişmeler yakından takip ediliyor\", \"merakla bekleniyor\" gibi dolgu cümleleri yasak",
  "Kaynağın cümle sırasını takip eden özet yasak: haber sayfası değil, hesabın kendi postu yazılıyor",
];

const UNIVERSAL_ANGLES: DraftAngle[] = [
  {
    id: "implication",
    label: "kaynağın söylemediği çıkarım",
    brief: "Kaynakta açıkça yazmayan ama verdiği olgulardan doğrudan çıkan sonucu ilk cümlede söyle. Spekülasyon değil çıkarım: dayanağı kaynaktaki olgu olmalı.",
  },
  {
    id: "reader_question",
    label: "takipçinin sorusu",
    brief: "Bu gelişmeyi gören takipçinin soracağı ilk somut soruyu baştan cevapla. Soruyu metne yazmak zorunda değilsin; cevabı ver.",
  },
  {
    id: "stake",
    label: "ne değişiyor",
    brief: "Kimin işinin bugünden itibaren değiştiğini tek cümlede söyle. Somut aktör ve somut değişiklik; genel önem cümlesi yasak.",
  },
];

function angle(id: string, label: string, brief: string): DraftAngle {
  return { id, label, brief };
}

const WRITING_CONTRACTS: Record<CategoryBaseStrategy, WritingContract> = {
  news: {
    strategy: "news",
    mission: "En güçlü olguyu ilk cümlede ver; okuyucu tek postla olayı anlasın.",
    mustHave: ["olayın ne olduğu", "kim/ne zaman bilgisi kaynakta varsa"],
    bans: ["kaynakta olmayan kesinlik", "clickbait", "zincir üretme"],
    angles: [
      angle("lede", "olgu önce", "En güçlü olguyu ilk cümlede doğrudan ver; ikinci cümle bağlamı tamamlasın."),
      UNIVERSAL_ANGLES[0],
      UNIVERSAL_ANGLES[2],
    ],
  },
  politics: {
    strategy: "politics",
    mission: "İddia ile olguyu ayırarak yaz; taraf tutan sıfat kullanma.",
    mustHave: ["kimin ne dediği ile neyin doğrulandığı ayrımı"],
    bans: [...SLOP_BANS, "kişi hakkında kaynakta olmayan niyet atfetme"],
    angles: UNIVERSAL_ANGLES,
  },
  technology: {
    strategy: "technology",
    mission: "Teknik olarak doğru ama teknik olmayan bir okuyucunun da anlayacağı tek bir çıkarım yaz. Duyuru tekrarı değil, o duyurunun anlamı.",
    mustHave: ["somut teknik ayrıntı (model, sürüm, sayı, sınır) kaynakta varsa", "bunun pratikte ne değiştirdiği"],
    bans: [...SLOP_BANS, "\"yapay zekâ alanında önemli bir gelişme\" türü içi boş genelleme"],
    angles: [
      UNIVERSAL_ANGLES[0],
      UNIVERSAL_ANGLES[1],
      angle("so_what", "teknik fark", "Bu duyuruyu bir önceki duruma göre farklı kılan tek teknik ayrıntıyı seç ve postu onun üzerine kur."),
    ],
  },
  finance: {
    strategy: "finance",
    mission: "Sayıyı ve sayının ne anlama geldiğini ver; yatırım tavsiyesi verme.",
    mustHave: ["kaynaktaki sayı veya oran", "belirsizlik varsa açıkça belirtilmesi"],
    bans: [...SLOP_BANS, "al/sat iması", "fiyat hedefi", "kesin gelecek tahmini"],
    angles: [
      angle("number_first", "sayı önce", "Postu kaynaktaki en anlamlı tek sayının üzerine kur; sayının neyi ölçtüğünü açıkla."),
      UNIVERSAL_ANGLES[0],
      UNIVERSAL_ANGLES[2],
    ],
  },
  sports: {
    strategy: "sports",
    mission: "Sonucu ve sonucun tabela dışındaki anlamını yaz; taraftarın konuşacağı noktayı bul.",
    mustHave: ["sonuç veya karar", "hangi takım/oyuncu için ne değiştiği"],
    bans: [...SLOP_BANS, "spor spikeri anons tonu"],
    angles: [
      UNIVERSAL_ANGLES[2],
      UNIVERSAL_ANGLES[1],
      angle("detail", "gözden kaçan ayrıntı", "Herkesin gördüğü sonucu değil, sonucun içinde gözden kaçan tek ayrıntıyı öne çıkar."),
    ],
  },
  entertainment: {
    strategy: "entertainment",
    mission: "Merak uyandıran ama abartmayan, sade bir gündem postu yaz.",
    mustHave: ["olayın ne olduğu"],
    bans: [...SLOP_BANS, "magazin dedikodusunu olgu gibi sunma"],
    angles: UNIVERSAL_ANGLES,
  },
  meme: {
    strategy: "meme",
    mission: "Şakanın kendisini yaz. Espriyi açıklama, bağlamı anlatma, kaynağı özetleme.",
    mustHave: ["tek vuruşluk, kendi başına komik bir cümle"],
    bans: [
      ...SLOP_BANS,
      "şakayı açıklayan ek cümle yasak",
      "\"internet yıkıldı\", \"herkes bunu konuşuyor\" gibi kalıplar yasak",
      "kaynağı özetleyen giriş cümlesi yasak",
    ],
    angles: [
      angle("punchline", "doğrudan punchline", "Sadece punchline'ı yaz. Kurulum kaynakta zaten var."),
      angle("overreact", "abartılı tepki", "Gelişmeye orantısız ama zararsız bir tepki ver; tepkinin kendisi şaka olsun."),
      angle("format", "format şakası", "Gelişmeyi tanıdık bir 𝕏 format kalıbına oturt; kalıbı isimlendirme, uygula."),
    ],
  },
  shitpost: {
    strategy: "shitpost",
    mission: "Kısa, absürt ama zararsız bir gözlem yaz; hesabın kendi karakteriyle konuş.",
    mustHave: ["tek cümle veya iki kısa cümle"],
    bans: [
      ...SLOP_BANS,
      "gerçek kişi veya kurum hakkında uydurma olgu yasak",
      "hakaret, aşağılama ve hedef gösterme yasak",
      "açıklama cümlesi yasak",
    ],
    angles: [
      angle("observation", "gözlem", "Gelişmeyi bahane et, asıl postu kendi gözleminin üzerine kur."),
      angle("deadpan", "ciddi yüzle", "Absürt şeyi tamamen düz bir tonla söyle."),
      angle("self", "hesabın kendi hali", "Gelişmeyi hesabın kendi günlük haline bağla; birinci tekil kullanabilirsin."),
    ],
  },
  generic: {
    strategy: "generic",
    mission: "Kaynağı tekrar etmeyen, kendi açısı olan tek bir post yaz.",
    mustHave: ["net bir açı"],
    bans: SLOP_BANS,
    angles: UNIVERSAL_ANGLES,
  },
};

export function writingContractFor(strategy?: string): WritingContract {
  const value = CATEGORY_BASE_STRATEGIES.includes(strategy as CategoryBaseStrategy)
    ? strategy as CategoryBaseStrategy
    : "generic";
  return WRITING_CONTRACTS[value];
}

export function draftAngles(contract: WritingContract, count: number): DraftAngle[] {
  const wanted = Math.max(1, Math.min(contract.angles.length, count));
  return contract.angles.slice(0, wanted);
}

export function formatRuleFor(format: string): string {
  if (format === "quote_comment") {
    return "Bu metin kaynak postun ALINTISI (quote) olarak paylaşılacak; kaynak post okuyucunun ekranında zaten görünüyor. Bu yüzden kaynağı özetleme, sadece kendi yorumunu yaz. Metne URL koyma. 280 karakteri geçme.";
  }
  if (format === "thread_opener") {
    return "Bir thread'in ilk postu. Tek başına da anlamlı olmalı ve devamında ne geleceğini clickbait yapmadan ima etmeli. \"Thread\", \"🧵\", \"1/\" gibi şablon etiket kullanma. 280 karakteri geçme.";
  }
  if (format === "thread") return "Thread metni; ilk post tek başına anlamlı olsun.";
  if (format === "reply") return "Bir posta yanıt; kısa ve doğrudan.";
  if (format === "dm") return "Doğrudan mesaj; kısa ve kişisel.";
  return "Tek, kendi başına ayakta duran post. 280 karakteri geçme.";
}

export const DRAFT_VARIANT_COUNT = 3;
export const DRAFT_JEV_WEIGHT = 0.5;
export const JEV_DRAFT_QUERY = "Bu taslak, yayın hesabının ses sözleşmesine ve kategori sözleşmesine uyan, kaynağı tekrarlamayan özgün bir 𝕏 postu mu?";
export const JEV_DRAFT_SCOPE = "draft-variant-v1";

export type DraftVariantCandidate = {
  index: number;
  angle: string;
  angleLabel: string;
  format: string;
  text: string;
  gateReason: string | null;
  evaluatorScore: number;
  jevScore: number | null;
};

export type RankedDraftVariant = DraftVariantCandidate & { combinedScore: number };

export type DraftSelection = {
  chosen: RankedDraftVariant | null;
  ranked: RankedDraftVariant[];
  mode: "jev_blend" | "evaluator";
};

export function rankDraftVariants(variants: DraftVariantCandidate[], jevWeight = DRAFT_JEV_WEIGHT): DraftSelection {
  const blended = variants.some((variant) => variant.jevScore !== null && Number.isFinite(variant.jevScore));
  const weight = blended ? Math.min(1, Math.max(0, jevWeight)) : 0;
  const ranked = variants
    .map((variant) => ({
      ...variant,
      combinedScore: Math.round(
        (variant.jevScore !== null && Number.isFinite(variant.jevScore) ? variant.jevScore * weight : variant.evaluatorScore * weight) +
        variant.evaluatorScore * (1 - weight),
      ),
    }))
    // A blocked variant may still be recorded, but it never outranks a clean one.
    .sort((left, right) =>
      Number(Boolean(left.gateReason)) - Number(Boolean(right.gateReason)) ||
      right.combinedScore - left.combinedScore ||
      left.index - right.index);
  return { chosen: ranked[0] || null, ranked, mode: blended ? "jev_blend" : "evaluator" };
}

function truncate(value: string, limit: number): string {
  const clean = value.replace(/\s+/gu, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

export function draftCategoryFacet(contract: WritingContract, categorySlug: string): string {
  return truncate(
    `Kategori ${categorySlug || contract.strategy} (${contract.strategy}). ${contract.mission} Yasak: ${contract.bans.join("; ")}.`,
    700,
  );
}
