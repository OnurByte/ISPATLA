import { LOCALES, type Locale } from "./config";

export const socialKeys = [
  "options", "copied", "copyLink", "image", "copyError", "shareProof",
  "observation", "publishedBy", "publishedAt", "observedAt", "openX", "metricTitle",
  "views", "likes", "replies", "reposts", "quotes", "unknown",
  "disclaimer", "profile", "unnamed", "noBio", "notFound", "shareText",
] as const;
export type SocialCopy = Record<typeof socialKeys[number], string>;

const rows: Record<Locale, readonly string[]> = {
  en: [
    "Sharing options","Copied","Copy link","Card image","Clipboard unavailable. Copy the link from the address bar.","Share this observation",
    "Official X API observation","Post by","Published","Observed","Open post on X","Engagement reported by X",
    "Views","Likes","Replies","Reposts","Quotes","Not supplied by X",
    "This card shows only values observed through the official X API, not a verified hit classification. Other platforms may keep previously cached previews after a link is revoked.",
    "Profile","Unnamed profile","No bio has been added to this profile.","Share not found","Official X observation",
  ],
  "zh-CN": [
    "分享选项","已复制","复制链接","卡片图片","无法访问剪贴板，请从地址栏复制链接。","分享此观察结果",
    "X 官方 API 观察记录","发布者","发布时间","观察时间","在 X 打开帖子","X 提供的互动数据",
    "浏览量","点赞","回复","转发","引用","X 未提供",
    "此卡片仅显示通过 X 官方 API 观察到的数据，不代表帖子已被判定为热门。撤销分享后，其他平台仍可能保留之前缓存的预览。",
    "个人资料","未命名资料","此资料尚未添加简介。","分享不存在","X 官方观察记录",
  ],
  hi: [
    "शेयर विकल्प","कॉपी हो गया","लिंक कॉपी करें","कार्ड की तस्वीर","क्लिपबोर्ड उपलब्ध नहीं है। एड्रेस बार से लिंक कॉपी करें।","यह अवलोकन शेयर करें",
    "आधिकारिक X API अवलोकन","पोस्ट करने वाला","प्रकाशित","अवलोकन समय","X पर पोस्ट खोलें","X द्वारा दिए गए एंगेजमेंट आँकड़े",
    "व्यूज़","लाइक","जवाब","रीपोस्ट","कोट","X ने नहीं दिया",
    "यह कार्ड केवल आधिकारिक X API से देखे गए आँकड़े दिखाता है, सत्यापित हिट का दावा नहीं करता। शेयर रद्द होने के बाद भी अन्य प्लेटफ़ॉर्म पुराने प्रीव्यू रख सकते हैं।",
    "प्रोफ़ाइल","बिना नाम की प्रोफ़ाइल","इस प्रोफ़ाइल में अभी बायो नहीं है।","शेयर नहीं मिला","आधिकारिक X अवलोकन",
  ],
  es: [
    "Opciones para compartir","Copiado","Copiar enlace","Imagen de la tarjeta","Portapapeles no disponible. Copia el enlace de la barra de direcciones.","Compartir esta observación",
    "Observación oficial de la API de X","Publicación de","Publicado","Observado","Abrir publicación en X","Interacciones facilitadas por X",
    "Visualizaciones","Me gusta","Respuestas","Republicaciones","Citas","X no lo proporcionó",
    "Esta tarjeta solo muestra datos observados mediante la API oficial de X, no una clasificación de éxito verificado. Otras plataformas pueden conservar vistas previas en caché tras revocar el enlace.",
    "Perfil","Perfil sin nombre","Este perfil todavía no tiene biografía.","No se encontró la publicación compartida","Observación oficial de X",
  ],
  fr: [
    "Options de partage","Copié","Copier le lien","Image de la carte","Presse-papiers indisponible. Copiez le lien dans la barre d'adresse.","Partager cette observation",
    "Observation officielle via l'API X","Publication de","Publication","Observation","Ouvrir sur X","Interactions fournies par X",
    "Vues","J'aime","Réponses","Republications","Citations","Non fourni par X",
    "Cette carte affiche uniquement les mesures observées via l'API officielle de X et ne certifie pas un succès. D'autres plateformes peuvent garder l'aperçu en cache après révocation du lien.",
    "Profil","Profil sans nom","Aucune biographie n'a encore été ajoutée.","Partage introuvable","Observation officielle de X",
  ],
  ar: [
    "خيارات المشاركة","تم النسخ","نسخ الرابط","صورة البطاقة","الحافظة غير متاحة. انسخ الرابط من شريط العنوان.","مشاركة هذه الملاحظة",
    "رصد رسمي عبر واجهة X","منشور بواسطة","تاريخ النشر","وقت الرصد","فتح المنشور على X","التفاعلات المقدمة من X",
    "المشاهدات","الإعجابات","الردود","إعادات النشر","الاقتباسات","لم يقدمه X",
    "تعرض هذه البطاقة القيم المرصودة عبر واجهة X الرسمية فقط، وليست تصنيفًا لنجاح موثّق. قد تحتفظ المنصات الأخرى بالمعاينات المخزنة بعد إلغاء الرابط.",
    "الملف الشخصي","ملف بلا اسم","لم تُضف نبذة لهذا الملف بعد.","المشاركة غير موجودة","رصد X الرسمي",
  ],
  bn: [
    "শেয়ার করার বিকল্প","কপি হয়েছে","লিংক কপি করুন","কার্ডের ছবি","ক্লিপবোর্ড পাওয়া যাচ্ছে না। ঠিকানা বার থেকে লিংক কপি করুন।","এই পর্যবেক্ষণ শেয়ার করুন",
    "অফিশিয়াল X API পর্যবেক্ষণ","পোস্ট করেছেন","প্রকাশিত","পর্যবেক্ষণের সময়","X-এ পোস্ট খুলুন","X-এর দেওয়া এনগেজমেন্টের সংখ্যা",
    "ভিউ","লাইক","উত্তর","রিপোস্ট","উদ্ধৃতি","X দেয়নি",
    "এই কার্ডে কেবল অফিশিয়াল X API-তে দেখা তথ্য রয়েছে; এটি যাচাইকৃত হিটের ঘোষণা নয়। লিংক বাতিলের পরও অন্য প্ল্যাটফর্ম পুরোনো প্রিভিউ সংরক্ষণ করতে পারে।",
    "প্রোফাইল","নামহীন প্রোফাইল","এখনও এই প্রোফাইলে বায়ো নেই।","শেয়ার পাওয়া যায়নি","অফিশিয়াল X পর্যবেক্ষণ",
  ],
  "pt-BR": [
    "Opções de compartilhamento","Copiado","Copiar link","Imagem do cartão","Área de transferência indisponível. Copie o link da barra de endereço.","Compartilhar esta observação",
    "Observação oficial da API do X","Publicação de","Publicado","Observado","Abrir publicação no X","Interações fornecidas pelo X",
    "Visualizações","Curtidas","Respostas","Republicações","Citações","Não fornecido pelo X",
    "Este cartão mostra apenas dados observados pela API oficial do X, não uma classificação de sucesso verificado. Outras plataformas podem manter prévias em cache após a revogação.",
    "Perfil","Perfil sem nome","Este perfil ainda não tem biografia.","Compartilhamento não encontrado","Observação oficial do X",
  ],
  ru: [
    "Поделиться","Скопировано","Копировать ссылку","Изображение карточки","Буфер обмена недоступен. Скопируйте ссылку из адресной строки.","Поделиться наблюдением",
    "Официальное наблюдение через API X","Публикация от","Опубликовано","Зафиксировано","Открыть пост в X","Показатели взаимодействия от X",
    "Просмотры","Лайки","Ответы","Репосты","Цитирования","X не предоставил",
    "Карточка показывает только данные официального API X, а не подтверждённый статус хита. Другие платформы могут хранить старое превью после отзыва ссылки.",
    "Профиль","Профиль без имени","Описание профиля пока не добавлено.","Публикация не найдена","Официальное наблюдение X",
  ],
  id: [
    "Opsi berbagi","Disalin","Salin tautan","Gambar kartu","Papan klip tidak tersedia. Salin tautan dari bilah alamat.","Bagikan pengamatan ini",
    "Pengamatan resmi API X","Kiriman oleh","Diterbitkan","Diamati","Buka kiriman di X","Interaksi yang diberikan X",
    "Tayangan","Suka","Balasan","Unggahan ulang","Kutipan","Tidak disediakan X",
    "Kartu ini hanya menampilkan data pengamatan API resmi X, bukan klasifikasi hit terverifikasi. Platform lain dapat menyimpan pratinjau dalam cache setelah tautan dicabut.",
    "Profil","Profil tanpa nama","Belum ada bio pada profil ini.","Tautan berbagi tidak ditemukan","Pengamatan resmi X",
  ],
  ur: [
    "شیئر کے اختیارات","کاپی ہو گیا","لنک کاپی کریں","کارڈ کی تصویر","کلپ بورڈ دستیاب نہیں۔ ایڈریس بار سے لنک کاپی کریں۔","یہ مشاہدہ شیئر کریں",
    "سرکاری X API مشاہدہ","پوسٹ کرنے والا","شائع شدہ","مشاہدے کا وقت","X پر پوسٹ کھولیں","X کے فراہم کردہ تعاملات",
    "مناظر","پسند","جوابات","دوبارہ پوسٹس","اقتباسات","X نے فراہم نہیں کیا",
    "یہ کارڈ صرف سرکاری X API سے مشاہدہ شدہ اعداد دکھاتا ہے، تصدیق شدہ ہٹ کا اعلان نہیں۔ لنک منسوخ ہونے کے بعد بھی دوسرے پلیٹ فارم پرانا پیش نظارہ رکھ سکتے ہیں۔",
    "پروفائل","بے نام پروفائل","ابھی اس پروفائل کی تفصیل شامل نہیں ہوئی۔","شیئر نہیں ملا","سرکاری X مشاہدہ",
  ],
  de: [
    "Teilen","Kopiert","Link kopieren","Kartenbild","Zwischenablage nicht verfügbar. Kopiere den Link aus der Adresszeile.","Beobachtung teilen",
    "Offizielle X-API-Beobachtung","Beitrag von","Veröffentlicht","Beobachtet","Beitrag auf X öffnen","Von X bereitgestellte Interaktionen",
    "Aufrufe","Likes","Antworten","Reposts","Zitate","Nicht von X bereitgestellt",
    "Diese Karte zeigt nur Werte der offiziellen X-API und bestätigt keinen Hit-Status. Andere Plattformen können bereits gespeicherte Vorschauen nach Widerruf des Links behalten.",
    "Profil","Profil ohne Namen","Für dieses Profil wurde noch keine Bio angegeben.","Freigabe nicht gefunden","Offizielle X-Beobachtung",
  ],
  ja: [
    "共有オプション","コピーしました","リンクをコピー","カード画像","クリップボードを使えません。アドレスバーからコピーしてください。","この観測を共有",
    "X 公式 API の観測記録","投稿者","公開日時","観測日時","X で投稿を開く","X が提供するエンゲージメント数",
    "表示回数","いいね","返信","リポスト","引用","X から提供されていません",
    "このカードは X 公式 API の観測値のみを示し、ヒット認定ではありません。リンクを無効化しても他サービスに古いプレビューが残る場合があります。",
    "プロフィール","名前のないプロフィール","このプロフィールにはまだ自己紹介がありません。","共有が見つかりません","X 公式観測",
  ],
  sw: [
    "Chaguo za kushiriki","Imenakiliwa","Nakili kiungo","Picha ya kadi","Ubao wa kunakili haupatikani. Nakili kiungo kwenye sehemu ya anwani.","Shiriki uchunguzi huu",
    "Uchunguzi rasmi wa API ya X","Chapisho la","Ilichapishwa","Ilionekana","Fungua chapisho kwenye X","Mwingiliano uliotolewa na X",
    "Mionekano","Zilizopendwa","Majibu","Machapisho tena","Nukuu","X haikutoa",
    "Kadi hii inaonyesha vipimo vilivyoonekana kupitia API rasmi ya X pekee, si uthibitisho wa chapisho maarufu. Majukwaa mengine yanaweza kuhifadhi onyesho la zamani baada ya kiungo kufutwa.",
    "Wasifu","Wasifu usio na jina","Hakuna maelezo ya wasifu bado.","Kiungo cha kushiriki hakijapatikana","Uchunguzi rasmi wa X",
  ],
  mr: [
    "शेअर पर्याय","कॉपी झाले","दुवा कॉपी करा","कार्डचे चित्र","क्लिपबोर्ड उपलब्ध नाही. पत्त्याच्या पट्टीतून दुवा कॉपी करा.","हे निरीक्षण शेअर करा",
    "अधिकृत X API निरीक्षण","पोस्ट करणारा","प्रकाशित","निरीक्षण वेळ","X वर पोस्ट उघडा","X ने दिलेली एंगेजमेंट आकडेवारी",
    "व्ह्यूज","लाइक्स","उत्तरे","रीपोस्ट","कोट्स","X ने दिले नाही",
    "हे कार्ड फक्त अधिकृत X API निरीक्षणाचे आकडे दाखवते; ते सत्यापित हिट वर्गीकरण नाही. दुवा रद्द केल्यानंतरही इतर प्लॅटफॉर्म जुने प्रिव्ह्यू ठेवू शकतात.",
    "प्रोफाइल","नाव नसलेले प्रोफाइल","या प्रोफाइलमध्ये अजून बायो नाही.","शेअर सापडला नाही","अधिकृत X निरीक्षण",
  ],
  te: [
    "షేర్ ఎంపికలు","కాపీ అయింది","లింక్ కాపీ చేయి","కార్డ్ చిత్రం","క్లిప్‌బోర్డ్ అందుబాటులో లేదు. చిరునామా బార్ నుంచి లింక్ కాపీ చేయండి.","ఈ పరిశీలనను షేర్ చేయండి",
    "అధికారిక X API పరిశీలన","పోస్ట్ చేసినవారు","ప్రచురణ","పరిశీలన","Xలో పోస్ట్ తెరువు","X అందించిన స్పందనల సంఖ్య",
    "వ్యూలు","లైకులు","సమాధానాలు","రీపోస్టులు","కోట్స్","X అందించలేదు",
    "ఈ కార్డ్ అధికారిక X APIలో పరిశీలించిన సంఖ్యలను మాత్రమే చూపుతుంది; ధృవీకరించిన హిట్ కాదు. లింక్ రద్దయినా ఇతర వేదికల్లో పాత ప్రివ్యూ ఉండవచ్చు.",
    "ప్రొఫైల్","పేరులేని ప్రొఫైల్","ఈ ప్రొఫైల్‌కు ఇంకా బయో లేదు.","షేర్ కనబడలేదు","అధికారిక X పరిశీలన",
  ],
  tr: [
    "Paylaşım seçenekleri","Kopyalandı","Bağlantıyı kopyala","Kart görseli","Pano erişimi sağlanamadı. Bağlantıyı adres çubuğundan kopyala.","Bu gözlemi paylaş",
    "Resmî X API gözlemi","Gönderiyi yayımlayan","Yayımlanma","Gözlem","Gönderiyi X'te aç","X'in sunduğu etkileşim sayıları",
    "Görüntülenme","Beğeni","Yanıt","Yeniden paylaşım","Alıntı","X tarafından sunulmadı",
    "Bu kart yalnızca resmî X API gözlem değerlerini gösterir; doğrulanmış hit sınıflandırması içermez. Bağlantı iptal edilse bile sosyal platformlar eski önizlemeleri bir süre saklayabilir.",
    "Profil","İsimsiz profil","Bu profil için henüz bir bio eklenmemiş.","Paylaşım bulunamadı","Resmî X gözlemi",
  ],
  ta: [
    "பகிர்வு விருப்பங்கள்","நகலெடுக்கப்பட்டது","இணைப்பை நகலெடு","அட்டை படம்","கிளிப்போர்டு கிடைக்கவில்லை. முகவரிப் பட்டியிலிருந்து இணைப்பை நகலெடுக்கவும்.","இந்தக் கண்காணிப்பைப் பகிரவும்",
    "அதிகாரப்பூர்வ X API கண்காணிப்பு","பதிவிட்டவர்","வெளியீடு","கண்காணிப்பு நேரம்","X இல் பதிவைத் திற","X வழங்கிய ஈடுபாட்டு அளவுகள்",
    "பார்வைகள்","விருப்பங்கள்","பதில்கள்","மறுபதிவுகள்","மேற்கோள்கள்","X வழங்கவில்லை",
    "இந்த அட்டை அதிகாரப்பூர்வ X API-யில் கண்ட அளவுகளை மட்டுமே காட்டும்; சரிபார்க்கப்பட்ட வெற்றி எனக் கருத முடியாது. இணைப்பை நீக்கிய பிறகும் பிற தளங்களில் பழைய முன்னோட்டம் இருக்கலாம்.",
    "சுயவிவரம்","பெயரில்லா சுயவிவரம்","இந்தச் சுயவிவரத்திற்கு இன்னும் அறிமுகம் சேர்க்கப்படவில்லை.","பகிர்வு கிடைக்கவில்லை","அதிகாரப்பூர்வ X கண்காணிப்பு",
  ],
  vi: [
    "Tùy chọn chia sẻ","Đã sao chép","Sao chép liên kết","Ảnh thẻ","Không thể dùng bộ nhớ tạm. Hãy sao chép từ thanh địa chỉ.","Chia sẻ quan sát này",
    "Quan sát chính thức từ API X","Bài đăng của","Đăng lúc","Quan sát lúc","Mở bài đăng trên X","Tương tác do X cung cấp",
    "Lượt xem","Lượt thích","Trả lời","Đăng lại","Trích dẫn","X không cung cấp",
    "Thẻ này chỉ hiển thị dữ liệu quan sát từ API chính thức của X, không phải xác nhận một lượt hit. Nền tảng khác có thể giữ bản xem trước đã lưu sau khi thu hồi liên kết.",
    "Hồ sơ","Hồ sơ chưa có tên","Hồ sơ này chưa có tiểu sử.","Không tìm thấy chia sẻ","Quan sát chính thức của X",
  ],
  ko: [
    "공유 옵션","복사됨","링크 복사","카드 이미지","클립보드를 사용할 수 없습니다. 주소창에서 링크를 복사하세요.","이 관측 공유",
    "X 공식 API 관측","게시자","게시 시각","관측 시각","X에서 게시물 열기","X가 제공한 참여 지표",
    "조회수","좋아요","답글","재게시","인용","X에서 제공하지 않음",
    "이 카드는 X 공식 API에서 관측한 수치만 표시하며 검증된 히트 판정이 아닙니다. 링크를 철회해도 다른 플랫폼에 이전 미리보기가 남을 수 있습니다.",
    "프로필","이름 없는 프로필","이 프로필에는 아직 소개가 없습니다.","공유를 찾을 수 없습니다","X 공식 관측",
  ],
};

export const socialCopy: Record<Locale, SocialCopy> = Object.fromEntries(LOCALES.map(locale => {
  const values = rows[locale];
  if (!values || values.length !== socialKeys.length || values.some(text => !text.trim())) {
    throw new Error("Incomplete public social translation: " + locale);
  }
  return [locale, Object.fromEntries(socialKeys.map((key, index) => [key, values[index]]))];
})) as Record<Locale, SocialCopy>;
