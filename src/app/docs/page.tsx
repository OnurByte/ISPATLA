import Link from "next/link";
import {PublicPage,PublicSection} from "@/components/public-page";
import {requestPublicLocale} from "@/components/public-header";
import {localizePath} from "@/i18n/config";
import {getDictionary} from "@/i18n/dictionaries";
import {buttonVariants} from "@/components/ui/button";
export const metadata={title:"Dokümantasyon · İSPATLA"};
export default async function DocsPage(){const locale=await requestPublicLocale();const copy=getDictionary(locale);return <PublicPage current="docs" title="Önce incele, sonra bağlan." summary="Kaynağı gör, kararın nedenini oku, taslağı kendi hesabın için düzenle. Yayın kabulü ve uzaktan doğrulama ayrı adımlardır.">
 <div className="space-y-10">
  <PublicSection title="Bir fırsatı değerlendirmek"><p>Kontrol odasında kaynak postun bağlantısını, konu eşleşmesini ve karar gerekçesini birlikte incele. Eksik ölçüm sıfır sayılmaz. Karar puanı, kalibre edilmiş olasılık veya erişim garantisi değildir.</p><p>Aynı olay her hesap için aynı öneriyi üretmeyebilir. Hesabın konusu, sesi ve yayın geçmişi kararın bağlamıdır.</p></PublicSection>
  <PublicSection title="Uygulama oturumu ve X bağlantısı"><p>İSPATLA oturumu ile X hesabına verilen izin ayrıdır. X hesabı resmi OAuth akışıyla bağlanır. Observe, Assist ve Off tercihleri hesap ve eylem bazında tutulur; bağlantı kurmak otomatik yayın izni vermez.</p><p>Otomatik yayın için ayrıca kanıta dayalı, belirli hesap/eylem/konu kapsamını gösteren onay gerekir. Yetki veya kanıt eksikse gönderim durur.</p></PublicSection>
  <PublicSection title="Taslak, onay, sonuç"><p>Taslağı düzenle ve yayından önce son metni incele. İçerik değişince eski gönderim onayı geçersiz olur. Bir gönderimin sonucu belirsizse tekrar göndermek yerine doğrulama kuyruğunda ne olduğunu incele.</p><p>“Kabul edildi” X’in isteği aldığına dair makbuzdur. “Doğrulandı” bağlı hesabın uzaktaki yayınına ait eşleşen kanıtı ifade eder.</p></PublicSection>
  <PublicSection title="Kimlik bilgisi gerektirmeyen yerel demo"><pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs text-foreground">bun install --frozen-lockfile{"\n"}bun run demo</pre><p>Demo sentetik kaynak, geçici veritabanı ve yerel hesap kullanır. X ve AI anahtarı gerekmez. Gerçek X gönderimleri kapalıdır; simüle makbuzlar yayın kanıtı sayılmaz. Giriş bilgisi başlatma çıktısında gösterilir.</p><p>Normal kurulum, worker ve katkı kontrolleri depodaki README ve CONTRIBUTING dosyalarında yer alır.</p></PublicSection>
 </div><aside className="h-fit rounded-lg border bg-muted/30 p-5 text-sm"><p className="font-semibold">Başlangıç noktası</p><p className="mt-3 leading-6 text-muted-foreground">X’i bağlamadan önce yerel demoda fırsat ve taslak akışını inceleyebilirsin.</p><Link href={localizePath(locale,"/signup")} className={buttonVariants({className:"mt-5 h-auto min-h-11 max-w-full whitespace-normal px-4 py-3 text-center"})}>{copy.landing.createAccount}</Link></aside>
 </PublicPage>;}
