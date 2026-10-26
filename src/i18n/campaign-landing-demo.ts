import type { Locale } from "./config";

export type CampaignLandingDemoCopy = {
  topicLabel: string;
  topicTitle: string;
  topicBrief: string;
  sourceLinkLabel: string;
  categoryLabel: string;
  fitLabel: string;
  fitReasons: [string, string, string];
  beforeLabel: string;
  beforeDraft: string;
  afterLabel: string;
  drafts: [string, string, string];
  editLabel: string;
  methodTitle: string;
  methodBody: string;
  limitsBody: string;
  openSourceLabel: string;
  licenseLabel: string;
};

/** Every locale has its own copy; this preview contains no live X data or measured results. */
export const campaignLandingDemo: Record<Locale, CampaignLandingDemoCopy> = {
  tr: {
    topicLabel: "Konu", topicTitle: "Bir duyuru. Üç farklı açı.", topicBrief: "Grok Imagine için duyurulan bu güncellemeyi her hesap kendi kitlesine nasıl anlatabilir?", sourceLinkLabel: "Gönderiyi aç",
    categoryLabel: "Hesap bağlamı",
    fitLabel: "Bu hesap için olası açı",
    fitReasons: ["Duyuruyu müşterinin ihtiyacına bağla; açıklanmayan özellikleri olmuş gibi sunma.", "Ürün duyurularında verilen sözleri ve kullanıcı beklentisini konuş.", "Üreticilere bir sonraki güncellemede neyi denemek istediklerini sor."],
    beforeLabel: "İlk fikir", beforeDraft: "Sürüm notlarını hazırlamak çok zaman alıyor.",
    afterLabel: "AI taslağı ⁜ düzenlenebilir",
    drafts: ["Grok Imagine için 4 Ocak 2026’da büyük bir güncelleme duyuruldu. Bu duyuru yaratıcı iş akışınızı nasıl etkileyebilir?", "4 Ocak tarihli Grok Imagine duyurusu ürün güncellemelerini konuşmak için iyi bir başlangıç: Böyle bir duyuruda hangi ayrıntıyı ararsınız?", "Grok Imagine için 4 Ocak’ta büyük bir güncelleme duyuruldu. Bir sonraki güncellemede neyi denemek isterdiniz?"],
    editLabel: "Metni düzenle",
    methodTitle: "Nasıl değerlendirildi?", methodBody: "Örnek akış, kaynak bağlamını bir hesap kategorisiyle eşleştirip düzenlenebilir bir taslak önerir. Gerçek kullanımda kaynak ve gerekçe incelenebilir.", limitsBody: "Viral olma veya büyüme garantisi yok. AI taslağı yayınlanmaz. Kendi AI anahtarını kullan; sağlayıcı ücretleri sana ait.",
    openSourceLabel: "Kodu incele", licenseLabel: "AGPL-3.0-or-later",
  },
  en: {
    topicLabel: "Topic", topicTitle: "One announcement. Three angles.", topicBrief: "How could each account frame this Grok Imagine update announcement for its audience?", sourceLinkLabel: "Open post",
    categoryLabel: "Account context",
    fitLabel: "A possible angle for this account",
    fitReasons: ["Connect the announcement to customer needs without claiming unannounced features.", "Discuss what product updates promise and how users interpret them.", "Ask creators what they would want to try in a future update."],
    beforeLabel: "Starting idea", beforeDraft: "Release notes take a lot of time to prepare.",
    afterLabel: "AI draft ⁜ editable",
    drafts: ["Grok Imagine announced a major upgrade on Jan 4, 2026. How might that change your creative workflow?", "The Jan 4 Grok Imagine announcement is a useful prompt: what details do you look for in a product update?", "Grok Imagine announced a major upgrade on Jan 4. What would you want to try in a future update?"],
    editLabel: "Edit the text",
    methodTitle: "How is it assessed?", methodBody: "The sample flow matches source context to an account category, then proposes an editable draft. In real use, inspect the source and reasoning.", limitsBody: "No virality or growth guarantees. AI drafts are not published. Bring your own AI key; provider charges are yours.",
    openSourceLabel: "Inspect the code", licenseLabel: "AGPL-3.0-or-later",
  },
  "zh-CN": {
    topicLabel: "话题", topicTitle: "一则公告，三种表达角度。", topicBrief: "每个账号可以如何面向自己的受众来表达这则 Grok Imagine 更新公告？", sourceLinkLabel: "打开原帖",
    categoryLabel: "账号背景", fitLabel: "适合此账号的可能角度",
    fitReasons: ["将公告与用户需求联系起来，不把未公布的功能说成已上线。", "讨论产品更新传递了什么承诺，以及用户如何理解。", "询问创作者希望在后续更新中尝试什么。"], beforeLabel: "原始想法", beforeDraft: "整理发行说明要花很多时间。", afterLabel: "AI 草稿 ⁜ 可编辑",
    drafts: ["Grok Imagine 于 2026 年 1 月 4 日宣布了一次重大升级。这可能会如何影响你的创作流程？", "1 月 4 日的 Grok Imagine 公告引出了一个问题：你会关注产品更新中的哪些细节？", "Grok Imagine 于 1 月 4 日宣布了一次重大升级。你希望在后续更新中尝试什么？"], editLabel: "编辑文字",
    methodTitle: "如何评估？", methodBody: "示例流程将来源背景与账号类别匹配，再提出可编辑的草稿。实际使用时可查看来源和判断理由。", limitsBody: "不保证走红或增长。AI 草稿不会自动发布。请使用自己的 AI 密钥；服务商费用由你承担。", openSourceLabel: "查看代码", licenseLabel: "AGPL-3.0-or-later",
  },
  hi: {
    topicLabel: "विषय", topicTitle: "एक घोषणा। तीन अलग-अलग नज़रिए।", topicBrief: "हर खाता अपने दर्शकों के लिए Grok Imagine की इस अपडेट घोषणा को किस तरह पेश कर सकता है?", sourceLinkLabel: "पोस्ट खोलें",
    categoryLabel: "खाते का संदर्भ", fitLabel: "इस खाते के लिए संभावित दृष्टिकोण",
    fitReasons: ["घोषणा को ग्राहकों की ज़रूरत से जोड़ें; घोषित न हुई सुविधाओं का दावा न करें।", "बात करें कि उत्पाद अपडेट क्या वादा करते हैं और उपयोगकर्ता उन्हें कैसे समझते हैं।", "क्रिएटर्स से पूछें कि वे भविष्य के अपडेट में क्या आज़माना चाहेंगे।"], beforeLabel: "शुरुआती विचार", beforeDraft: "रिलीज़ नोट तैयार करने में बहुत समय लगता है।", afterLabel: "AI ड्राफ़्ट ⁜ संपादन योग्य",
    drafts: ["Grok Imagine ने 4 जनवरी 2026 को बड़े अपग्रेड की घोषणा की। इससे आपकी रचनात्मक प्रक्रिया पर क्या असर पड़ सकता है?", "4 जनवरी की Grok Imagine घोषणा एक उपयोगी सवाल उठाती है: उत्पाद अपडेट में आप कौन-सी जानकारी देखते हैं?", "Grok Imagine ने 4 जनवरी को बड़े अपग्रेड की घोषणा की। आप भविष्य के अपडेट में क्या आज़माना चाहेंगे?"], editLabel: "पाठ संपादित करें",
    methodTitle: "आकलन कैसे होता है?", methodBody: "उदाहरण स्रोत के संदर्भ को खाते की श्रेणी से जोड़ता है और संपादन योग्य ड्राफ़्ट सुझाता है। असली उपयोग में स्रोत और कारण देखें।", limitsBody: "वायरल होने या बढ़ने की गारंटी नहीं। AI ड्राफ़्ट अपने आप प्रकाशित नहीं होते। अपनी AI कुंजी इस्तेमाल करें; प्रदाता शुल्क आपके होंगे।", openSourceLabel: "कोड देखें", licenseLabel: "AGPL-3.0-or-later",
  },
  es: {
    topicLabel: "Tema", topicTitle: "Un anuncio. Tres enfoques.", topicBrief: "¿Cómo podría cada cuenta presentar este anuncio de actualización de Grok Imagine a su audiencia?", sourceLinkLabel: "Abrir publicación",
    categoryLabel: "Contexto de la cuenta", fitLabel: "Un posible enfoque para esta cuenta",
    fitReasons: ["Relaciona el anuncio con las necesidades de los clientes, sin afirmar funciones no anunciadas.", "Comenta qué prometen las actualizaciones y cómo las interpretan quienes usan el producto.", "Pregunta a quienes crean qué les gustaría probar en una próxima actualización."], beforeLabel: "Idea inicial", beforeDraft: "Preparar las notas de versión lleva mucho tiempo.", afterLabel: "Borrador con IA ⁜ editable",
    drafts: ["Grok Imagine anunció una gran actualización el 4 de enero de 2026. ¿Cómo podría influir en tu flujo creativo?", "El anuncio de Grok Imagine del 4 de enero plantea una pregunta útil: ¿qué detalles buscas en una actualización?", "Grok Imagine anunció una gran actualización el 4 de enero. ¿Qué te gustaría probar en una próxima actualización?"], editLabel: "Editar texto",
    methodTitle: "¿Cómo se evalúa?", methodBody: "El ejemplo relaciona el contexto de una fuente con una categoría de cuenta y propone un borrador editable. En el uso real puedes revisar la fuente y el razonamiento.", limitsBody: "No se garantizan la viralidad ni el crecimiento. Los borradores de IA no se publican solos. Usa tu propia clave de IA; los cargos del proveedor corren por tu cuenta.", openSourceLabel: "Consultar el código", licenseLabel: "AGPL-3.0-or-later",
  },
  fr: {
    topicLabel: "Sujet", topicTitle: "Une annonce. Trois angles.", topicBrief: "Comment chaque compte peut-il présenter cette annonce de mise à jour de Grok Imagine à son public ?", sourceLinkLabel: "Ouvrir la publication",
    categoryLabel: "Contexte du compte", fitLabel: "Un angle possible pour ce compte",
    fitReasons: ["Reliez l’annonce aux besoins des clients sans attribuer de fonctions non annoncées.", "Parlez des promesses des mises à jour et de la façon dont les utilisateurs les comprennent.", "Demandez aux créateurs ce qu’ils aimeraient essayer lors d’une prochaine mise à jour."], beforeLabel: "Idée de départ", beforeDraft: "Préparer les notes de version prend beaucoup de temps.", afterLabel: "Brouillon IA ⁜ modifiable",
    drafts: ["Grok Imagine a annoncé une mise à niveau majeure le 4 janvier 2026. Quel effet pourrait-elle avoir sur votre processus créatif ?", "L’annonce de Grok Imagine du 4 janvier pose une question utile : quels détails recherchez-vous dans une mise à jour ?", "Grok Imagine a annoncé une mise à niveau majeure le 4 janvier. Qu’aimeriez-vous essayer lors d’une prochaine mise à jour ?"], editLabel: "Modifier le texte",
    methodTitle: "Comment l’évaluation fonctionne-t-elle ?", methodBody: "L’exemple associe le contexte de la source à une catégorie de compte, puis propose un brouillon modifiable. En situation réelle, examinez la source et le raisonnement.", limitsBody: "Aucune garantie de viralité ou de croissance. Les brouillons IA ne sont pas publiés automatiquement. Utilisez votre propre clé IA ; les frais du fournisseur restent à votre charge.", openSourceLabel: "Voir le code", licenseLabel: "AGPL-3.0-or-later",
  },
  "pt-BR": {
    topicLabel: "Tema", topicTitle: "Um anúncio. Três perspectivas.", topicBrief: "Como cada conta pode apresentar esse anúncio de atualização do Grok Imagine ao seu público?", sourceLinkLabel: "Abrir publicação",
    categoryLabel: "Contexto da conta", fitLabel: "Um possível ângulo para esta conta",
    fitReasons: ["Relacione o anúncio às necessidades dos clientes sem afirmar recursos não anunciados.", "Converse sobre o que as atualizações prometem e como as pessoas interpretam isso.", "Pergunte a quem cria o que gostaria de testar em uma próxima atualização."], beforeLabel: "Ideia inicial", beforeDraft: "Preparar notas de versão leva muito tempo.", afterLabel: "Rascunho com IA ⁜ editável",
    drafts: ["O Grok Imagine anunciou uma grande atualização em 4 de janeiro de 2026. Como isso pode afetar seu processo criativo?", "O anúncio do Grok Imagine em 4 de janeiro levanta uma boa pergunta: que detalhes você procura em uma atualização?", "O Grok Imagine anunciou uma grande atualização em 4 de janeiro. O que você gostaria de testar em uma próxima atualização?"], editLabel: "Editar texto",
    methodTitle: "Como a avaliação funciona?", methodBody: "O exemplo relaciona o contexto da fonte à categoria da conta e sugere um rascunho editável. No uso real, confira a fonte e o raciocínio.", limitsBody: "Não há garantia de viralização ou crescimento. Rascunhos de IA não são publicados automaticamente. Use sua própria chave de IA; as cobranças do provedor ficam por sua conta.", openSourceLabel: "Inspecionar o código", licenseLabel: "AGPL-3.0-or-later",
  },
  ru: {
    topicLabel: "Тема", topicTitle: "Одно объявление. Три ракурса.", topicBrief: "Как каждый аккаунт может подать это объявление об обновлении Grok Imagine своей аудитории?", sourceLinkLabel: "Открыть публикацию",
    categoryLabel: "Контекст аккаунта", fitLabel: "Возможный подход для этого аккаунта",
    fitReasons: ["Свяжите объявление с потребностями клиентов, не приписывая продукту неанонсированные функции.", "Обсудите, что обещают обновления и как это воспринимают пользователи.", "Спросите авторов, что им хотелось бы попробовать в следующем обновлении."], beforeLabel: "Исходная идея", beforeDraft: "Подготовка заметок к выпуску занимает много времени.", afterLabel: "Черновик ИИ ⁜ можно редактировать",
    drafts: ["4 января 2026 года Grok Imagine объявил о крупном обновлении. Как это может повлиять на ваш творческий процесс?", "Объявление Grok Imagine от 4 января поднимает вопрос: какие детали вы ищете в обновлении продукта?", "4 января Grok Imagine объявил о крупном обновлении. Что вы хотели бы попробовать в следующем обновлении?"], editLabel: "Редактировать текст",
    methodTitle: "Как проводится оценка?", methodBody: "Пример связывает контекст источника с категорией аккаунта и предлагает редактируемый черновик. В реальной работе можно проверить источник и обоснование.", limitsBody: "Вирусный охват и рост не гарантируются. Черновики ИИ не публикуются автоматически. Используйте свой ключ ИИ; расходы провайдера оплачиваете вы.", openSourceLabel: "Посмотреть код", licenseLabel: "AGPL-3.0-or-later",
  },
  id: {
    topicLabel: "Topik", topicTitle: "Satu pengumuman. Tiga sudut pandang.", topicBrief: "Bagaimana tiap akun dapat menyampaikan pengumuman pembaruan Grok Imagine ini kepada audiensnya?", sourceLinkLabel: "Buka postingan",
    categoryLabel: "Konteks akun", fitLabel: "Sudut pandang yang mungkin cocok untuk akun ini",
    fitReasons: ["Hubungkan pengumuman dengan kebutuhan pelanggan tanpa mengklaim fitur yang belum diumumkan.", "Bahas janji dalam pembaruan produk dan cara pengguna memahaminya.", "Tanyakan kepada kreator apa yang ingin mereka coba di pembaruan berikutnya."], beforeLabel: "Ide awal", beforeDraft: "Menyiapkan catatan rilis memakan banyak waktu.", afterLabel: "Draf AI ⁜ dapat diedit",
    drafts: ["Grok Imagine mengumumkan peningkatan besar pada 4 Januari 2026. Bagaimana dampaknya pada alur kreatif Anda?", "Pengumuman Grok Imagine pada 4 Januari memunculkan pertanyaan: detail apa yang Anda cari dalam pembaruan produk?", "Grok Imagine mengumumkan peningkatan besar pada 4 Januari. Apa yang ingin Anda coba di pembaruan berikutnya?"], editLabel: "Edit teks",
    methodTitle: "Bagaimana penilaiannya?", methodBody: "Contoh ini mencocokkan konteks sumber dengan kategori akun lalu menyarankan draf yang dapat diedit. Dalam penggunaan nyata, periksa sumber dan alasannya.", limitsBody: "Tidak ada jaminan viral atau tumbuh. Draf AI tidak diterbitkan otomatis. Gunakan kunci AI sendiri; biaya penyedia menjadi tanggungan Anda.", openSourceLabel: "Periksa kode", licenseLabel: "AGPL-3.0-or-later",
  },
  de: {
    topicLabel: "Thema", topicTitle: "Eine Ankündigung. Drei Blickwinkel.", topicBrief: "Wie kann jeder Account diese Ankündigung zum Grok-Imagine-Update für sein Publikum aufgreifen?", sourceLinkLabel: "Beitrag öffnen",
    categoryLabel: "Account-Kontext", fitLabel: "Ein möglicher Ansatz für diesen Account",
    fitReasons: ["Verknüpfe die Ankündigung mit Kundenbedürfnissen, ohne nicht angekündigte Funktionen zu behaupten.", "Sprich darüber, was Produktupdates versprechen und wie Nutzende sie verstehen.", "Frage Kreative, was sie bei einem künftigen Update ausprobieren möchten."], beforeLabel: "Ausgangsidee", beforeDraft: "Release Notes vorzubereiten kostet viel Zeit.", afterLabel: "KI-Entwurf ⁜ bearbeitbar",
    drafts: ["Grok Imagine kündigte am 4. Januar 2026 ein großes Upgrade an. Was könnte das für deinen kreativen Ablauf bedeuten?", "Die Ankündigung von Grok Imagine am 4. Januar wirft eine gute Frage auf: Worauf achtest du bei einem Produktupdate?", "Grok Imagine kündigte am 4. Januar ein großes Upgrade an. Was würdest du bei einem künftigen Update gern ausprobieren?"], editLabel: "Text bearbeiten",
    methodTitle: "Wie wird es eingeschätzt?", methodBody: "Das Beispiel verknüpft den Quellenkontext mit einer Account-Kategorie und schlägt einen bearbeitbaren Entwurf vor. Im echten Einsatz lassen sich Quelle und Begründung prüfen.", limitsBody: "Keine Garantie für Viralität oder Wachstum. KI-Entwürfe werden nicht automatisch veröffentlicht. Nutze deinen eigenen KI-Schlüssel; Anbietergebühren trägst du selbst.", openSourceLabel: "Quellcode ansehen", licenseLabel: "AGPL-3.0-or-later",
  },
  sw: {
    topicLabel: "Mada", topicTitle: "Tangazo moja. Mitazamo mitatu.", topicBrief: "Kila akaunti inaweza kueleza tangazo hili la sasisho la Grok Imagine kwa hadhira yake kwa mtazamo upi?", sourceLinkLabel: "Fungua chapisho",
    categoryLabel: "Muktadha wa akaunti", fitLabel: "Mtazamo unaoweza kuifaa akaunti hii",
    fitReasons: ["Linganisha tangazo na mahitaji ya wateja bila kudai vipengele ambavyo havijatangazwa.", "Jadili ahadi za masasisho ya bidhaa na jinsi watumiaji wanavyozielewa.", "Waulize wabunifu wangependa kujaribu nini katika sasisho lijalo."], beforeLabel: "Wazo la awali", beforeDraft: "Kuandaa maelezo ya toleo huchukua muda mwingi.", afterLabel: "Rasimu ya AI ⁜ inaweza kuhaririwa",
    drafts: ["Grok Imagine ilitangaza uboreshaji mkubwa tarehe 4 Januari 2026. Hilo linaweza kuathirije mtiririko wako wa ubunifu?", "Tangazo la Grok Imagine la tarehe 4 Januari linaibua swali: unatafuta maelezo gani kwenye sasisho la bidhaa?", "Grok Imagine ilitangaza uboreshaji mkubwa tarehe 4 Januari. Ungependa kujaribu nini katika sasisho lijalo?"], editLabel: "Hariri maandishi",
    methodTitle: "Tathmini hufanyikaje?", methodBody: "Mfano huu unaunganisha muktadha wa chanzo na aina ya akaunti kisha unapendekeza rasimu inayoweza kuhaririwa. Katika matumizi halisi, kagua chanzo na sababu.", limitsBody: "Hakuna dhamana ya kusambaa sana au kukua. Rasimu za AI hazichapishwi zenyewe. Tumia ufunguo wako wa AI; ada za mtoa huduma ni zako.", openSourceLabel: "Kagua msimbo", licenseLabel: "AGPL-3.0-or-later",
  },
  vi: {
    topicLabel: "Chủ đề", topicTitle: "Một thông báo. Ba góc nhìn.", topicBrief: "Mỗi tài khoản có thể trình bày thông báo cập nhật Grok Imagine này với đối tượng của mình như thế nào?", sourceLinkLabel: "Mở bài đăng",
    categoryLabel: "Bối cảnh tài khoản", fitLabel: "Góc tiếp cận có thể phù hợp với tài khoản này",
    fitReasons: ["Liên hệ thông báo với nhu cầu khách hàng, không khẳng định tính năng chưa được công bố.", "Thảo luận về cam kết trong bản cập nhật và cách người dùng hiểu chúng.", "Hỏi người sáng tạo muốn thử điều gì trong bản cập nhật tiếp theo."], beforeLabel: "Ý tưởng ban đầu", beforeDraft: "Chuẩn bị ghi chú phát hành tốn nhiều thời gian.", afterLabel: "Bản nháp AI ⁜ có thể chỉnh sửa",
    drafts: ["Grok Imagine công bố một đợt nâng cấp lớn vào ngày 4 tháng 1 năm 2026. Điều này có thể ảnh hưởng quy trình sáng tạo của bạn ra sao?", "Thông báo Grok Imagine ngày 4 tháng 1 gợi ra một câu hỏi: bạn chú ý chi tiết nào trong bản cập nhật sản phẩm?", "Grok Imagine công bố nâng cấp lớn vào ngày 4 tháng 1. Bạn muốn thử gì trong bản cập nhật tiếp theo?"], editLabel: "Chỉnh sửa văn bản",
    methodTitle: "Đánh giá như thế nào?", methodBody: "Ví dụ kết nối ngữ cảnh nguồn với danh mục tài khoản rồi đề xuất bản nháp có thể chỉnh sửa. Khi dùng thật, hãy xem nguồn và lý do.", limitsBody: "Không đảm bảo lan truyền hay tăng trưởng. Bản nháp AI không tự đăng. Hãy dùng khóa AI của bạn; phí nhà cung cấp do bạn chi trả.", openSourceLabel: "Xem mã nguồn", licenseLabel: "AGPL-3.0-or-later",
  },
  ko: {
    topicLabel: "주제", topicTitle: "하나의 발표, 세 가지 관점.", topicBrief: "각 계정은 Grok Imagine 업데이트 발표를 각자의 독자에게 어떻게 전할 수 있을까요?", sourceLinkLabel: "게시물 열기",
    categoryLabel: "계정 맥락", fitLabel: "이 계정에 맞을 수 있는 관점",
    fitReasons: ["발표를 고객의 필요와 연결하되 발표되지 않은 기능을 사실처럼 말하지 않습니다.", "제품 업데이트가 무엇을 약속하고 사용자가 이를 어떻게 받아들이는지 이야기합니다.", "크리에이터에게 다음 업데이트에서 무엇을 시험하고 싶은지 묻습니다."], beforeLabel: "시작 아이디어", beforeDraft: "릴리스 노트를 준비하는 데 시간이 많이 듭니다.", afterLabel: "AI 초안 ⁜ 편집 가능",
    drafts: ["Grok Imagine은 2026년 1월 4일 큰 업그레이드를 발표했습니다. 창작 작업 흐름에 어떤 영향을 줄까요?", "1월 4일 Grok Imagine 발표를 보면 이런 질문이 생깁니다. 제품 업데이트에서 어떤 정보를 확인하나요?", "Grok Imagine은 1월 4일 큰 업그레이드를 발표했습니다. 다음 업데이트에서 무엇을 시험해 보고 싶나요?"], editLabel: "텍스트 편집",
    methodTitle: "어떻게 평가하나요?", methodBody: "예시는 출처 맥락을 계정 카테고리와 연결한 뒤 편집 가능한 초안을 제안합니다. 실제 사용에서는 출처와 근거를 확인할 수 있습니다.", limitsBody: "바이럴이나 성장을 보장하지 않습니다. AI 초안은 자동 게시되지 않습니다. 본인의 AI 키를 사용하며 제공업체 비용은 사용자가 부담합니다.", openSourceLabel: "코드 확인", licenseLabel: "AGPL-3.0-or-later",
  },
  ar: {
    topicLabel: "الموضوع", topicTitle: "إعلان واحد. ثلاث زوايا.", topicBrief: "كيف يمكن لكل حساب تقديم إعلان تحديث Grok Imagine هذا إلى جمهوره؟", sourceLinkLabel: "افتح المنشور",
    categoryLabel: "سياق الحساب", fitLabel: "زاوية محتملة لهذا الحساب",
    fitReasons: ["اربط الإعلان باحتياجات العملاء دون الادعاء بوجود ميزات لم تُعلن.", "ناقش ما تعد به تحديثات المنتجات وكيف يفهمها المستخدمون.", "اسأل المبدعين عما يرغبون في تجربته في تحديث قادم."], beforeLabel: "الفكرة الأولية", beforeDraft: "إعداد ملاحظات الإصدار يستغرق وقتًا طويلًا.", afterLabel: "مسودة بالذكاء الاصطناعي ⁜ قابلة للتحرير",
    drafts: ["أعلنت Grok Imagine عن ترقية كبيرة في 4 يناير 2026. كيف يمكن أن تؤثر في سير عملك الإبداعي؟", "يثير إعلان Grok Imagine في 4 يناير سؤالًا مفيدًا: ما التفاصيل التي تبحث عنها في تحديث المنتج؟", "أعلنت Grok Imagine عن ترقية كبيرة في 4 يناير. ما الذي تود تجربته في تحديث قادم؟"], editLabel: "حرّر النص",
    methodTitle: "كيف يتم التقييم؟", methodBody: "يربط المثال سياق المصدر بفئة الحساب ثم يقترح مسودة قابلة للتحرير. في الاستخدام الفعلي يمكن مراجعة المصدر وأسباب الاختيار.", limitsBody: "لا نضمن الانتشار أو النمو. لا تُنشر مسودات الذكاء الاصطناعي تلقائيًا. استخدم مفتاحك الخاص؛ وتتحمل رسوم المزوّد.", openSourceLabel: "افحص الشيفرة", licenseLabel: "AGPL-3.0-or-later",
  },
  bn: {
    topicLabel: "বিষয়", topicTitle: "একটি ঘোষণা। তিনটি দৃষ্টিভঙ্গি।", topicBrief: "প্রতিটি অ্যাকাউন্ট কীভাবে নিজের পাঠকদের কাছে Grok Imagine-এর এই আপডেট ঘোষণা তুলে ধরতে পারে?", sourceLinkLabel: "পোস্ট খুলুন",
    categoryLabel: "অ্যাকাউন্টের প্রেক্ষাপট", fitLabel: "এই অ্যাকাউন্টের সম্ভাব্য দৃষ্টিকোণ",
    fitReasons: ["ঘোষণাটিকে গ্রাহকের প্রয়োজনের সঙ্গে যুক্ত করুন, অঘোষিত বৈশিষ্ট্যের দাবি করবেন না।", "পণ্য আপডেট কী প্রতিশ্রুতি দেয় এবং ব্যবহারকারীরা তা কীভাবে বোঝেন তা আলোচনা করুন।", "পরবর্তী আপডেটে নির্মাতারা কী চেষ্টা করতে চান তা জিজ্ঞেস করুন।"], beforeLabel: "প্রাথমিক ধারণা", beforeDraft: "রিলিজ নোট তৈরি করতে অনেক সময় লাগে।", afterLabel: "AI খসড়া ⁜ সম্পাদনাযোগ্য",
    drafts: ["Grok Imagine ৪ জানুয়ারি ২০২৬-এ বড় আপগ্রেডের ঘোষণা দিয়েছে। এটি আপনার সৃজনশীল কাজের ধারায় কী প্রভাব ফেলতে পারে?", "৪ জানুয়ারির Grok Imagine ঘোষণা একটি প্রশ্ন তোলে: পণ্য আপডেটে আপনি কোন তথ্য খোঁজেন?", "Grok Imagine ৪ জানুয়ারি বড় আপগ্রেডের ঘোষণা দিয়েছে। পরবর্তী আপডেটে আপনি কী চেষ্টা করতে চান?"], editLabel: "লেখা সম্পাদনা করুন",
    methodTitle: "কীভাবে মূল্যায়ন করা হয়?", methodBody: "উদাহরণটি উৎসের প্রেক্ষাপটকে অ্যাকাউন্টের শ্রেণির সঙ্গে মেলায় এবং সম্পাদনাযোগ্য খসড়া প্রস্তাব করে। বাস্তব ব্যবহারে উৎস ও যুক্তি দেখুন।", limitsBody: "ভাইরাল হওয়া বা বৃদ্ধির নিশ্চয়তা নেই। AI খসড়া নিজে থেকে প্রকাশিত হয় না। নিজের AI কী ব্যবহার করুন; সরবরাহকারীর খরচ আপনার।", openSourceLabel: "কোড দেখুন", licenseLabel: "AGPL-3.0-or-later",
  },
  ur: {
    topicLabel: "موضوع", topicTitle: "ایک اعلان۔ تین زاویے۔", topicBrief: "ہر اکاؤنٹ Grok Imagine کی اس اپ ڈیٹ کے اعلان کو اپنے سامعین کے سامنے کیسے پیش کر سکتا ہے؟", sourceLinkLabel: "پوسٹ کھولیں",
    categoryLabel: "اکاؤنٹ کا سیاق", fitLabel: "اس اکاؤنٹ کے لیے ممکنہ زاویہ",
    fitReasons: ["اعلان کو صارفین کی ضرورت سے جوڑیں، غیر اعلانیہ فیچرز کا دعویٰ نہ کریں۔", "بات کریں کہ پروڈکٹ اپ ڈیٹس کیا وعدہ کرتے ہیں اور صارفین انہیں کیسے سمجھتے ہیں۔", "تخلیق کاروں سے پوچھیں کہ وہ آئندہ اپ ڈیٹ میں کیا آزمانا چاہیں گے۔"], beforeLabel: "ابتدائی خیال", beforeDraft: "ریلیز نوٹس تیار کرنے میں بہت وقت لگتا ہے۔", afterLabel: "AI مسودہ ⁜ قابلِ ترمیم",
    drafts: ["Grok Imagine نے 4 جنوری 2026 کو بڑے اپ گریڈ کا اعلان کیا۔ یہ آپ کے تخلیقی طریقۂ کار پر کیسے اثر ڈال سکتا ہے؟", "4 جنوری کا Grok Imagine اعلان ایک سوال اٹھاتا ہے: پروڈکٹ اپ ڈیٹ میں آپ کون سی تفصیل دیکھتے ہیں؟", "Grok Imagine نے 4 جنوری کو بڑے اپ گریڈ کا اعلان کیا۔ آئندہ اپ ڈیٹ میں آپ کیا آزمانا چاہیں گے؟"], editLabel: "متن میں ترمیم کریں",
    methodTitle: "جائزہ کیسے لیا جاتا ہے؟", methodBody: "مثال ماخذ کے سیاق کو اکاؤنٹ کے زمرے سے جوڑ کر قابلِ ترمیم مسودہ تجویز کرتی ہے۔ حقیقی استعمال میں ماخذ اور وجہ دیکھیں۔", limitsBody: "وائرل ہونے یا ترقی کی ضمانت نہیں۔ AI مسودے خود شائع نہیں ہوتے۔ اپنی AI کلید استعمال کریں؛ فراہم کنندہ کی فیس آپ کے ذمے ہے۔", openSourceLabel: "کوڈ دیکھیں", licenseLabel: "AGPL-3.0-or-later",
  },
  ja: {
    topicLabel: "テーマ", topicTitle: "ひとつの発表。三つの切り口。", topicBrief: "Grok Imagine のこのアップデート発表を、それぞれのアカウントはどう伝えられるでしょうか？", sourceLinkLabel: "投稿を開く",
    categoryLabel: "アカウントの文脈", fitLabel: "このアカウントに合う可能性のある切り口",
    fitReasons: ["発表を顧客のニーズにつなげ、未発表の機能を事実のように述べない。", "製品アップデートが何を約束し、利用者がどう受け取るかを話す。", "次のアップデートで試したいことをクリエイターに尋ねる。"], beforeLabel: "最初のアイデア", beforeDraft: "リリースノートの準備には時間がかかる。", afterLabel: "AI 下書き ⁜ 編集可能",
    drafts: ["Grok Imagine は 2026 年 1 月 4 日に大規模なアップグレードを発表しました。創作の流れにどんな影響がありそうですか？", "1 月 4 日の発表から考えたい問いがあります。製品アップデートでどんな情報を確認しますか？", "Grok Imagine は 1 月 4 日に大規模なアップグレードを発表しました。次の更新で何を試したいですか？"], editLabel: "文章を編集",
    methodTitle: "どのように評価する？", methodBody: "例では出典の文脈をアカウントのカテゴリに結び付け、編集可能な下書きを提案します。実際の利用では出典と理由を確認できます。", limitsBody: "拡散や成長は保証しません。AIの下書きは自動投稿されません。ご自身のAIキーをご利用ください。プロバイダー料金は利用者負担です。", openSourceLabel: "コードを確認", licenseLabel: "AGPL-3.0-or-later",
  },
  mr: {
    topicLabel: "विषय", topicTitle: "एक घोषणा. तीन दृष्टिकोन.", topicBrief: "Grok Imagine च्या या अपडेट घोषणेची प्रत्येक खाते आपल्या प्रेक्षकांसाठी कशी मांडू शकते?", sourceLinkLabel: "पोस्ट उघडा",
    categoryLabel: "खात्याचा संदर्भ", fitLabel: "या खात्यासाठी संभाव्य दृष्टिकोन",
    fitReasons: ["घोषणेला ग्राहकांच्या गरजेशी जोडा; जाहीर न झालेल्या सुविधांचा दावा करू नका.", "उत्पादन अपडेट काय आश्वासन देतात आणि वापरकर्ते ते कसे समजतात यावर बोला.", "पुढील अपडेटमध्ये निर्मात्यांना काय वापरून पाहायचे आहे ते विचारा."], beforeLabel: "सुरुवातीची कल्पना", beforeDraft: "आवृत्ती नोंदी तयार करण्यास खूप वेळ लागतो.", afterLabel: "AI मसुदा ⁜ संपादनयोग्य",
    drafts: ["Grok Imagine ने ४ जानेवारी २०२६ रोजी मोठ्या अपग्रेडची घोषणा केली. याचा तुमच्या सर्जनशील कामावर काय परिणाम होऊ शकतो?", "४ जानेवारीच्या घोषणेमुळे एक प्रश्न पडतो: उत्पादन अपडेटमध्ये तुम्ही कोणते तपशील पाहता?", "Grok Imagine ने ४ जानेवारीला मोठ्या अपग्रेडची घोषणा केली. पुढील अपडेटमध्ये तुम्हाला काय वापरून पाहायचे आहे?"], editLabel: "मजकूर संपादित करा",
    methodTitle: "मूल्यांकन कसे होते?", methodBody: "उदाहरण स्रोताचा संदर्भ खात्याच्या श्रेणीशी जोडते आणि संपादनयोग्य मसुदा सुचवते. प्रत्यक्ष वापरात स्रोत आणि कारण तपासा.", limitsBody: "व्हायरल होण्याची किंवा वाढीची हमी नाही. AI मसुदे आपोआप प्रकाशित होत नाहीत. स्वतःची AI की वापरा; प्रदात्याचे शुल्क तुमचे असेल.", openSourceLabel: "कोड तपासा", licenseLabel: "AGPL-3.0-or-later",
  },
  te: {
    topicLabel: "అంశం", topicTitle: "ఒక ప్రకటన. మూడు కోణాలు.", topicBrief: "Grok Imagine అప్‌డేట్ ప్రకటనను ప్రతి ఖాతా తన ప్రేక్షకులకు ఎలా అందించగలదు?", sourceLinkLabel: "పోస్ట్ తెరవండి",
    categoryLabel: "ఖాతా సందర్భం", fitLabel: "ఈ ఖాతాకు సరిపోయే అవకాశం ఉన్న కోణం",
    fitReasons: ["ప్రకటనను కస్టమర్ అవసరాలతో అనుసంధానించండి; ప్రకటించని ఫీచర్లను ఉన్నట్లు చెప్పవద్దు.", "ఉత్పత్తి అప్‌డేట్‌లు ఏమి వాగ్దానం చేస్తాయి, వినియోగదారులు వాటిని ఎలా అర్థం చేసుకుంటారో చర్చించండి.", "తదుపరి అప్‌డేట్‌లో సృష్టికర్తలు ఏమి ప్రయత్నించాలనుకుంటున్నారో అడగండి."], beforeLabel: "ప్రారంభ ఆలోచన", beforeDraft: "విడుదల గమనికలు సిద్ధం చేయడానికి చాలా సమయం పడుతుంది.", afterLabel: "AI ముసాయిదా ⁜ సవరించవచ్చు",
    drafts: ["Grok Imagine 2026 జనవరి 4న పెద్ద అప్‌గ్రేడ్‌ను ప్రకటించింది. ఇది మీ సృజనాత్మక పని విధానాన్ని ఎలా ప్రభావితం చేయవచ్చు?", "జనవరి 4 ప్రకటన ఒక ఉపయోగకరమైన ప్రశ్నను లేవనెత్తుతుంది: ఉత్పత్తి అప్‌డేట్‌లో మీరు ఏ వివరాలను చూస్తారు?", "Grok Imagine జనవరి 4న పెద్ద అప్‌గ్రేడ్‌ను ప్రకటించింది. తదుపరి అప్‌డేట్‌లో మీరు ఏమి ప్రయత్నించాలనుకుంటున్నారు?"], editLabel: "వచనాన్ని సవరించండి",
    methodTitle: "ఎలా అంచనా వేస్తుంది?", methodBody: "ఈ ఉదాహరణ మూల సందర్భాన్ని ఖాతా వర్గంతో కలిపి సవరించగల ముసాయిదాను సూచిస్తుంది. నిజమైన వినియోగంలో మూలం, కారణాన్ని చూడండి.", limitsBody: "వైరల్ అవుతుందని లేదా వృద్ధి ఉంటుందని హామీ లేదు. AI ముసాయిదాలు స్వయంగా ప్రచురించబడవు. మీ AI కీని వాడండి; ప్రొవైడర్ ఛార్జీలు మీవే.", openSourceLabel: "కోడ్ పరిశీలించండి", licenseLabel: "AGPL-3.0-or-later",
  },
  ta: {
    topicLabel: "தலைப்பு", topicTitle: "ஒரு அறிவிப்பு. மூன்று கோணங்கள்.", topicBrief: "Grok Imagine புதுப்பிப்பு அறிவிப்பை ஒவ்வொரு கணக்கும் தன் பார்வையாளர்களிடம் எப்படிக் கூறலாம்?", sourceLinkLabel: "பதிவைத் திற",
    categoryLabel: "கணக்கு சூழல்", fitLabel: "இந்தக் கணக்கிற்கான சாத்தியமான கோணம்",
    fitReasons: ["அறிவிப்பை வாடிக்கையாளர் தேவையுடன் இணைக்கவும்; அறிவிக்கப்படாத அம்சங்கள் இருப்பதாகக் கூற வேண்டாம்.", "தயாரிப்பு புதுப்பிப்புகள் என்ன உறுதியளிக்கின்றன, பயனர்கள் அவற்றை எப்படிப் புரிந்துகொள்கிறார்கள் எனப் பேசுங்கள்.", "அடுத்த புதுப்பிப்பில் படைப்பாளர்கள் எதை முயற்சிக்க விரும்புகிறார்கள் எனக் கேளுங்கள்."], beforeLabel: "தொடக்க யோசனை", beforeDraft: "வெளியீட்டுக் குறிப்புகளைத் தயாரிக்க நிறைய நேரம் ஆகிறது.", afterLabel: "AI வரைவு ⁜ திருத்தலாம்",
    drafts: ["Grok Imagine 2026 ஜனவரி 4 அன்று பெரிய மேம்பாட்டை அறிவித்தது. இது உங்கள் படைப்புப் பணியை எப்படிப் பாதிக்கலாம்?", "ஜனவரி 4 அறிவிப்பு ஒரு கேள்வியை எழுப்புகிறது: தயாரிப்பு புதுப்பிப்பில் எந்த விவரங்களைப் பார்க்கிறீர்கள்?", "Grok Imagine ஜனவரி 4 அன்று பெரிய மேம்பாட்டை அறிவித்தது. அடுத்த புதுப்பிப்பில் எதை முயற்சிக்க விரும்புகிறீர்கள்?"], editLabel: "உரையைத் திருத்து",
    methodTitle: "எவ்வாறு மதிப்பிடப்படுகிறது?", methodBody: "இந்த எடுத்துக்காட்டு மூலச் சூழலைக் கணக்கு வகையுடன் இணைத்து திருத்தக்கூடிய வரைவை முன்வைக்கிறது. உண்மையான பயன்பாட்டில் மூலத்தையும் காரணத்தையும் பாருங்கள்.", limitsBody: "வைரலாகும் அல்லது வளர்ச்சி அடையும் என உத்தரவாதம் இல்லை. AI வரைவுகள் தானாக வெளியிடப்படாது. உங்கள் AI விசையைப் பயன்படுத்துங்கள்; வழங்குநர் கட்டணங்கள் உங்களுடையவை.", openSourceLabel: "குறியீட்டைப் பாருங்கள்", licenseLabel: "AGPL-3.0-or-later",
  },
};
