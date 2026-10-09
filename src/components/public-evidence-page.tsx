import Link from "next/link";
import type { ReactNode } from "react";
import { PublicPage, PublicSection } from "@/components/public-page";
import type { EvidenceState } from "@/content/comparisons/evidence";
import { localizePath, type Locale } from "@/i18n/config";
import { publicEvidenceCopy } from "@/i18n/public-evidence-copy";

const states: Record<Locale, Record<EvidenceState, string>> = {
  tr: { verified: "Kodda/belgede doğrulandı", vendor_claim: "Şirket beyanı", user_allegation: "Kullanıcı beyanı", unverified: "Doğrulanamadı", superseded: "Güncelliğini yitirdi" }, en: { verified: "Verified in code/docs", vendor_claim: "Vendor statement", user_allegation: "User allegation", unverified: "Not verified", superseded: "Superseded" },
  "zh-CN": { verified: "代码/文档已验证", vendor_claim: "企业声明", user_allegation: "用户陈述", unverified: "未验证", superseded: "已被更新" }, hi: { verified: "कोड/दस्तावेज़ में सत्यापित", vendor_claim: "कंपनी का कथन", user_allegation: "उपयोगकर्ता का आरोप", unverified: "सत्यापित नहीं", superseded: "अप्रचलित" }, es: { verified: "verificado en código/docs", vendor_claim: "declaración de la empresa", user_allegation: "alegación de usuario", unverified: "sin verificar", superseded: "obsoleto" }, fr: { verified: "vérifié dans le code/docs", vendor_claim: "déclaration de l’entreprise", user_allegation: "allégation d’un utilisateur", unverified: "non vérifié", superseded: "remplacé" }, ar: { verified: "تم التحقق في الكود/الوثائق", vendor_claim: "تصريح الشركة", user_allegation: "ادعاء مستخدم", unverified: "غير متحقق", superseded: "تم تجاوزه" }, bn: { verified: "কোড/নথিতে যাচাইকৃত", vendor_claim: "কোম্পানির বক্তব্য", user_allegation: "ব্যবহারকারীর অভিযোগ", unverified: "যাচাই হয়নি", superseded: "পুরোনো" }, "pt-BR": { verified: "verificado no código/docs", vendor_claim: "declaração da empresa", user_allegation: "alegação de usuário", unverified: "não verificado", superseded: "substituído" }, ru: { verified: "подтверждено кодом/документами", vendor_claim: "заявление компании", user_allegation: "утверждение пользователя", unverified: "не подтверждено", superseded: "устарело" }, id: { verified: "terverifikasi di kode/dokumen", vendor_claim: "pernyataan perusahaan", user_allegation: "klaim pengguna", unverified: "belum terverifikasi", superseded: "digantikan" }, ur: { verified: "کوڈ/دستاویز میں تصدیق", vendor_claim: "کمپنی کا بیان", user_allegation: "صارف کا دعویٰ", unverified: "تصدیق نہیں ہوئی", superseded: "پرانا" }, de: { verified: "im Code/in Doku belegt", vendor_claim: "Unternehmensangabe", user_allegation: "Nutzerbehauptung", unverified: "nicht bestätigt", superseded: "überholt" }, ja: { verified: "コード/文書で確認", vendor_claim: "企業の説明", user_allegation: "利用者の申告", unverified: "未確認", superseded: "更新済み" }, sw: { verified: "imethibitishwa kwenye msimbo/nyaraka", vendor_claim: "taarifa ya kampuni", user_allegation: "madai ya mtumiaji", unverified: "haijathibitishwa", superseded: "imepitwa na wakati" }, mr: { verified: "कोड/दस्तऐवजात पडताळले", vendor_claim: "कंपनीचे विधान", user_allegation: "वापरकर्त्याचा आरोप", unverified: "पडताळले नाही", superseded: "कालबाह्य" }, te: { verified: "కోడ్/పత్రాల్లో నిర్ధారితం", vendor_claim: "కంపెనీ ప్రకటన", user_allegation: "వినియోగదారు ఆరోపణ", unverified: "నిర్ధారించలేదు", superseded: "పాతది" }, ta: { verified: "குறியீடு/ஆவணத்தில் உறுதி", vendor_claim: "நிறுவனக் கூற்று", user_allegation: "பயனர் குற்றச்சாட்டு", unverified: "உறுதிப்படுத்தப்படவில்லை", superseded: "முந்தையது" }, vi: { verified: "đã xác minh trong mã/tài liệu", vendor_claim: "tuyên bố của công ty", user_allegation: "cáo buộc của người dùng", unverified: "chưa xác minh", superseded: "đã thay thế" }, ko: { verified: "코드/문서에서 확인", vendor_claim: "회사 설명", user_allegation: "사용자 주장", unverified: "확인되지 않음", superseded: "이전 정보" },
};

export type EvidenceSection = { title: string; body: ReactNode };

export function PublicEvidencePage({ locale, path, title, summary, sections, aside }: { locale: Locale; path: string; title: string; summary: string; sections: EvidenceSection[]; aside?: ReactNode }) {
  const copy = publicEvidenceCopy[locale].common;
  const languageTarget: Locale = locale === "en" ? "tr" : "en";
  return <PublicPage title={title} summary={summary}>
    <div className="space-y-10">
      {sections.map((section) => <PublicSection key={section.title} title={section.title}>{section.body}</PublicSection>)}
      <p className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">{copy.checked}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date("2026-10-09T00:00:00Z"))}. {copy.disclaimer}</p>
    </div>
    <aside className="h-fit space-y-5 rounded-sm border border-foreground/20 bg-muted/20 p-5 text-sm leading-6">
      {aside ?? <><h2 className="font-semibold">{copy.method}</h2><p className="text-muted-foreground">{copy.methodText}</p></>}
      <p><Link className="underline underline-offset-4" href={localizePath(languageTarget, path)}>{copy.languageLink}</Link></p>
    </aside>
  </PublicPage>;
}

export function EvidenceStateLabel({ locale, state }: { locale: Locale; state: EvidenceState }) {
  return <span className="inline-block rounded-sm border border-foreground/20 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-foreground">{states[locale][state]}</span>;
}

export function SourceLink({ locale, href, children }: { locale: Locale; href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-2 underline decoration-foreground/35 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{children}<span className="sr-only">({publicEvidenceCopy[locale].common.newTab})</span></a>;
}
