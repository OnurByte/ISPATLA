import { LOCALES, type Locale } from "./config";

export const hitSettingsKeys = [
  "title", "description", "empty", "post", "created", "createError", "revoked", "revokeError",
  "optError", "optInSuccess", "optOutSuccess", "alreadyShared", "creating", "create",
  "active", "optOut", "optIn", "revoking", "revoke", "leaderboard", "notice", "shareText",
] as const;
export type HitSettingsCopy = Record<typeof hitSettingsKeys[number], string>;

const rows: Record<Locale, readonly string[]> = {
  en: [
    "Share posts with official X observations","Only posts approved and published from your account, then observed through the official X API, are eligible. Each share is off by default.",
    "No officially observed publication is eligible for sharing yet.","X post","Official X observation card created.","Could not create the share link.","Share revoked; the link no longer works.","Could not revoke the share.","Could not update participation.","This card may appear in rankings if evidence thresholds are met.","Removed from leaderboard.","Sharing is enabled for this post; manage its link below.","Creating…","Create shareable card","Active share links","Leave leaderboard","Join leaderboard","Revoking…","Revoke share","Proof thresholds and hit ranking",
    "Only approved posts and real official X observations are public. Participation is separate and opt-in. When you opt in, all eligible official outcomes, including unshared lower results, can affect account rankings, but private texts and post IDs remain hidden. Revoked pages are inaccessible here; external preview caches may remain.",
    "My official X observation",
  ],
  "zh-CN": [
    "分享 X 官方观察帖子","只有通过你的账号审批并发布、随后由 X 官方 API 观察的帖子才能分享。每条分享默认关闭。",
    "暂无符合分享条件的官方观察帖子。","X 帖子","已创建官方 X 观察卡片。","无法创建分享链接。","分享已撤销，链接不可再用。","无法撤销分享。","无法更新参与状态。","满足证据门槛后，此卡片可能进入榜单。","已退出榜单。","这条帖子已开启分享，可在下方管理链接。","创建中…","创建可分享卡片","有效分享链接","退出榜单","加入榜单","撤销中…","撤销分享","证据门槛与热门榜单",
    "仅公开已审批帖子和真实的 X 官方观察数据。榜单参与独立且需要同意。加入后，所有符合条件的官方结果（包括未分享的较低表现）都可能影响账号排名，但私人文本和帖子 ID 不会公开。撤销后站内不可访问，其他平台可能保留缓存。",
    "我的 X 官方观察",
  ],
  hi: [
    "आधिकारिक X अवलोकन वाली पोस्ट शेयर करें","केवल आपके खाते से मंज़ूर और प्रकाशित, फिर आधिकारिक X API से देखी गई पोस्ट पात्र हैं। हर शेयर डिफ़ॉल्ट रूप से बंद है।",
    "अभी शेयर करने योग्य आधिकारिक अवलोकन नहीं है।","X पोस्ट","आधिकारिक X अवलोकन कार्ड बन गया।","शेयर लिंक नहीं बन सका।","शेयर रद्द; लिंक अब नहीं खुलेगा।","शेयर रद्द नहीं हो सका।","भागीदारी अपडेट नहीं हुई।","प्रमाण की शर्तें पूरी होने पर यह कार्ड रैंकिंग में आ सकता है।","रैंकिंग से हटा दिया गया।","इस पोस्ट का शेयर चालू है; नीचे लिंक संभालें।","बन रहा है…","शेयर कार्ड बनाएँ","सक्रिय शेयर लिंक","रैंकिंग छोड़ें","रैंकिंग में शामिल हों","रद्द हो रहा है…","शेयर रद्द करें","प्रमाण मानदंड और हिट रैंकिंग",
    "केवल मंज़ूर पोस्ट और आधिकारिक X अवलोकन सार्वजनिक हैं। रैंकिंग में भाग लेना अलग स्वैच्छिक विकल्प है। भाग लेने पर बिना शेयर के कम परिणाम भी खाते की रैंकिंग में गिने जा सकते हैं; निजी टेक्स्ट और पोस्ट ID छिपी रहती हैं। रद्द लिंक यहाँ नहीं खुलेगा, पर दूसरे प्लेटफ़ॉर्म पुराने प्रीव्यू रख सकते हैं।",
    "मेरा आधिकारिक X अवलोकन",
  ],
  es: [
    "Comparte publicaciones con observaciones oficiales de X","Solo pueden compartirse publicaciones aprobadas y emitidas desde tu cuenta, observadas después por la API oficial de X. Cada enlace está desactivado de forma predeterminada.",
    "Todavía no hay publicaciones oficiales aptas para compartir.","Publicación de X","Tarjeta de observación oficial creada.","No se pudo crear el enlace.","Se revocó el enlace y ya no funciona.","No se pudo revocar el enlace.","No se pudo actualizar la participación.","La tarjeta puede aparecer en el ranking si cumple los requisitos.","Se retiró del ranking.","Esta publicación ya se comparte; gestiona el enlace abajo.","Creando…","Crear tarjeta para compartir","Enlaces activos","Salir del ranking","Participar en el ranking","Revocando…","Revocar enlace","Criterios de prueba y clasificación",
    "Solo son públicos los posts aprobados y los datos reales de X. El ranking requiere una aceptación independiente. Al participar, los resultados oficiales aptos, incluso los bajos no compartidos, pueden influir en la clasificación; los textos e ID privados permanecen ocultos. Los enlaces revocados dejan de funcionar aquí, pero otras plataformas pueden guardar vistas previas.",
    "Mi observación oficial de X",
  ],
  fr: [
    "Partager des publications avec observations X officielles","Seules les publications approuvées et publiées depuis votre compte, puis observées via l'API officielle X, peuvent être partagées. Chaque partage est désactivé par défaut.",
    "Aucune publication observée officiellement ne peut encore être partagée.","Publication X","Carte d'observation X créée.","Impossible de créer le lien.","Partage révoqué : le lien ne fonctionne plus.","Impossible de révoquer le lien.","Impossible de modifier la participation.","Cette carte peut figurer au classement si elle satisfait les conditions.","Carte retirée du classement.","Le partage est actif pour cette publication ; gérez le lien ci-dessous.","Création…","Créer une carte partageable","Liens de partage actifs","Quitter le classement","Rejoindre le classement","Révocation…","Révoquer le partage","Critères de preuve et classement des succès",
    "Seuls les posts approuvés et les chiffres réellement observés via X sont publics. L'inscription au classement est indépendante et volontaire. Une fois inscrit, tous les résultats officiels admissibles, même faibles et non partagés, peuvent influencer le score du compte ; les textes et ID privés restent cachés. Un lien révoqué ne fonctionne plus ici, mais les aperçus externes peuvent persister.",
    "Mon observation officielle X",
  ],
  ar: [
    "مشاركة منشورات مرصودة رسميًا عبر X","تُقبل فقط المنشورات التي وافقت عليها ونشرتها من حسابك ثم رصدتها واجهة X الرسمية. تكون المشاركة معطّلة افتراضيًا لكل منشور.",
    "لا توجد منشورات مرصودة رسميًا مؤهلة للمشاركة بعد.","منشور X","تم إنشاء بطاقة الرصد الرسمية.","تعذّر إنشاء رابط المشاركة.","أُلغيت المشاركة ولم يعد الرابط يعمل.","تعذّر إلغاء المشاركة.","تعذّر تحديث المشاركة.","قد تظهر البطاقة في التصنيف عند استيفاء شروط الدليل.","أُزيلت من التصنيف.","المشاركة مفعّلة لهذا المنشور؛ يمكنك إدارة الرابط أدناه.","جارٍ الإنشاء…","إنشاء بطاقة للمشاركة","روابط المشاركة النشطة","مغادرة التصنيف","الانضمام للتصنيف","جارٍ الإلغاء…","إلغاء المشاركة","شروط الدليل وتصنيف المنشورات",
    "لا تُنشر إلا المنشورات الموافق عليها والبيانات الرسمية المرصودة. الانضمام للتصنيف قرار مستقل واختياري. عند المشاركة قد تؤثر النتائج الرسمية المؤهلة، بما فيها النتائج الأضعف غير المشاركة، في ترتيب الحساب؛ تبقى النصوص والمعرّفات الخاصة مخفية. الروابط الملغاة غير متاحة هنا لكن المعاينات الخارجية قد تبقى مخزنة.",
    "رصدي الرسمي عبر X",
  ],
  bn: [
    "অফিশিয়াল X পর্যবেক্ষণসহ পোস্ট শেয়ার করুন","শুধু আপনার অ্যাকাউন্ট থেকে অনুমোদিত ও প্রকাশিত, পরে অফিশিয়াল X API-তে দেখা পোস্ট শেয়ারযোগ্য। প্রতিটি শেয়ার শুরুতে বন্ধ থাকে।",
    "এখনও শেয়ারের উপযোগী অফিশিয়াল পোস্ট নেই।","X পোস্ট","অফিশিয়াল X পর্যবেক্ষণ কার্ড তৈরি হয়েছে।","শেয়ার লিংক তৈরি হয়নি।","শেয়ার বাতিল; লিংক আর কাজ করবে না।","শেয়ার বাতিল করা যায়নি।","অংশগ্রহণ আপডেট হয়নি।","প্রমাণের শর্ত পূরণ হলে কার্ডটি র‍্যাঙ্কিংয়ে দেখা যেতে পারে।","র‍্যাঙ্কিং থেকে সরানো হয়েছে।","এই পোস্টের শেয়ার চালু আছে; নিচে লিংক পরিচালনা করুন।","তৈরি হচ্ছে…","শেয়ারযোগ্য কার্ড তৈরি","সক্রিয় শেয়ার লিংক","র‍্যাঙ্কিং ছাড়ুন","র‍্যাঙ্কিংয়ে যোগ দিন","বাতিল হচ্ছে…","শেয়ার বাতিল করুন","প্রমাণের শর্ত ও হিট র‍্যাঙ্কিং",
    "শুধু অনুমোদিত পোস্ট ও অফিশিয়াল X পর্যবেক্ষণ প্রকাশ্য। র‍্যাঙ্কিংয়ে অংশগ্রহণ আলাদা স্বেচ্ছা সিদ্ধান্ত। অংশ নিলে শেয়ার না করা কম ফলসহ যোগ্য অফিশিয়াল ফল অ্যাকাউন্ট র‍্যাঙ্কে প্রভাব ফেলতে পারে; ব্যক্তিগত লেখা ও পোস্ট ID লুকানো থাকে। বাতিল লিংক এখানে খোলে না, তবে অন্য প্ল্যাটফর্ম পুরোনো প্রিভিউ রাখতে পারে।",
    "আমার অফিশিয়াল X পর্যবেক্ষণ",
  ],
  "pt-BR": [
    "Compartilhe posts com observações oficiais do X","Só posts aprovados e publicados pela sua conta, depois observados pela API oficial do X, são elegíveis. Cada compartilhamento começa desativado.",
    "Ainda não há posts oficiais disponíveis para compartilhar.","Post do X","Cartão de observação oficial criado.","Não foi possível criar o link.","Compartilhamento revogado; o link não funciona mais.","Não foi possível revogar.","Não foi possível atualizar a participação.","O cartão pode aparecer no ranking se atingir o mínimo de provas.","Removido do ranking.","O compartilhamento está ativo; gerencie o link abaixo.","Criando…","Criar cartão compartilhável","Links ativos","Sair do ranking","Entrar no ranking","Revogando…","Revogar compartilhamento","Critérios de prova e ranking",
    "Só posts aprovados e observações reais do X são públicos. Participar do ranking exige opção separada. Ao participar, resultados oficiais elegíveis, incluindo desempenhos baixos não compartilhados, podem afetar o ranking da conta; textos e IDs privados ficam ocultos. Links revogados deixam de funcionar aqui, mas prévias externas podem persistir.",
    "Minha observação oficial do X",
  ],
  ru: [
    "Делиться постами с официальными наблюдениями X","Доступны только посты, одобренные и опубликованные вашим аккаунтом, затем измеренные официальным API X. Публикация каждой карточки отключена по умолчанию.",
    "Пока нет официальных наблюдений для публикации.","Пост X","Карточка официального наблюдения создана.","Не удалось создать ссылку.","Публикация отозвана; ссылка больше не работает.","Не удалось отозвать ссылку.","Не удалось обновить участие.","Карточка может попасть в рейтинг при выполнении требований.","Карточка удалена из рейтинга.","Публикация этого поста разрешена; управляйте ссылкой ниже.","Создание…","Создать карточку","Активные ссылки","Покинуть рейтинг","Участвовать в рейтинге","Отзыв…","Отозвать публикацию","Порог доказательств и рейтинг",
    "Публичны только одобренные посты и реальные наблюдения официального API X. Участие в рейтинге добровольное и отдельное. После согласия все подходящие результаты, включая скрытые низкие показатели, могут влиять на рейтинг аккаунта; приватные тексты и ID остаются скрыты. Отозванная ссылка здесь недоступна, но внешние превью могут сохраниться.",
    "Моё официальное наблюдение X",
  ],
  id: [
    "Bagikan kiriman dengan pengamatan resmi X","Hanya kiriman yang disetujui dan diterbitkan dari akun Anda lalu diamati API resmi X yang dapat dibagikan. Setiap tautan nonaktif secara default.",
    "Belum ada kiriman resmi yang bisa dibagikan.","Kiriman X","Kartu pengamatan resmi berhasil dibuat.","Tautan tidak dapat dibuat.","Berbagi dicabut; tautan tidak berlaku lagi.","Gagal mencabut tautan.","Gagal memperbarui partisipasi.","Kartu ini dapat tampil di peringkat jika memenuhi syarat bukti.","Dihapus dari peringkat.","Berbagi aktif; kelola tautannya di bawah.","Membuat…","Buat kartu berbagi","Tautan aktif","Keluar dari peringkat","Ikut peringkat","Mencabut…","Cabut berbagi","Ambang bukti dan peringkat hit",
    "Hanya kiriman disetujui dan pengamatan resmi X yang dipublikasikan. Keikutsertaan peringkat terpisah dan sukarela. Jika ikut, semua hasil resmi yang memenuhi syarat, termasuk hasil rendah yang tidak dibagikan, dapat memengaruhi peringkat akun, sedangkan teks dan ID pribadi tetap tersembunyi. Tautan yang dicabut tidak berlaku di sini, tetapi pratinjau di platform lain dapat bertahan.",
    "Pengamatan resmi X saya",
  ],
  ur: [
    "سرکاری X مشاہدات والی پوسٹس شیئر کریں","صرف اپنے اکاؤنٹ سے منظور و شائع شدہ اور بعد میں سرکاری X API سے دیکھی گئی پوسٹس اہل ہیں۔ ہر شیئر ابتدا میں بند ہوتا ہے۔",
    "ابھی شیئر کے قابل سرکاری مشاہدہ شدہ پوسٹ نہیں۔","X پوسٹ","سرکاری مشاہدے کا کارڈ بنا دیا گیا۔","شیئر لنک نہیں بن سکا۔","شیئر منسوخ؛ لنک اب نہیں کھلے گا۔","شیئر منسوخ نہیں ہوا۔","شرکت کی تبدیلی ناکام ہوئی۔","ثبوت کی شرط پوری ہو تو کارڈ درجہ بندی میں آ سکتا ہے۔","درجہ بندی سے ہٹا دیا گیا۔","اس پوسٹ کا شیئر کھلا ہے؛ نیچے لنک سنبھالیں۔","بن رہا ہے…","شیئر کارڈ بنائیں","فعال شیئر لنکس","درجہ بندی چھوڑیں","درجہ بندی میں شامل ہوں","منسوخ ہو رہا ہے…","شیئر منسوخ کریں","ثبوت کی حدود اور ہٹ درجہ بندی",
    "صرف منظورشدہ پوسٹس اور حقیقی سرکاری X مشاہدات عوامی ہیں۔ درجہ بندی میں شرکت الگ اور رضاکارانہ ہے۔ شامل ہونے پر تمام اہل سرکاری نتائج، بشمول غیر شیئر کردہ کم نتائج، اکاؤنٹ درجہ بندی کو متاثر کر سکتے ہیں؛ نجی متن اور پوسٹ ID مخفی رہتے ہیں۔ منسوخ لنکس یہاں نہیں کھلتے مگر دوسرے پلیٹ فارم پرانے پیش نظارے محفوظ رکھ سکتے ہیں۔",
    "میرا سرکاری X مشاہدہ",
  ],
  de: [
    "Beiträge mit offiziellen X-Beobachtungen teilen","Nur über dein Konto genehmigte und veröffentlichte Beiträge, die anschließend per offizieller X-API gemessen wurden, sind teilbar. Jede Freigabe ist standardmäßig aus.",
    "Noch kein offizieller Beitrag kann geteilt werden.","X-Beitrag","Karte mit offizieller Beobachtung erstellt.","Freigabelink konnte nicht erstellt werden.","Freigabe widerrufen; Link funktioniert nicht mehr.","Freigabe konnte nicht widerrufen werden.","Teilnahme konnte nicht geändert werden.","Bei erfüllter Beweisschwelle kann die Karte im Ranking erscheinen.","Aus dem Ranking entfernt.","Dieser Beitrag ist freigegeben; verwalte den Link unten.","Wird erstellt…","Teilbare Karte erstellen","Aktive Freigabelinks","Ranking verlassen","Am Ranking teilnehmen","Widerruf läuft…","Freigabe widerrufen","Beweisschwellen und Hit-Ranking",
    "Nur genehmigte Beiträge und echte offizielle X-Beobachtungen sind öffentlich. Ranking-Teilnahme ist freiwillig und getrennt. Nach Zustimmung können alle geeigneten offiziellen Ergebnisse, auch nicht geteilte schwache Beiträge, das Kontoranking beeinflussen; private Texte und IDs bleiben verborgen. Widerrufene Links sind hier nicht mehr erreichbar, aber externe Vorschauen können zwischengespeichert bleiben.",
    "Meine offizielle X-Beobachtung",
  ],
  ja: [
    "X の公式観測データ付き投稿を共有","自分のアカウントで承認・公開し、その後 X 公式 API で観測された投稿だけが対象です。共有は投稿ごとに初期状態で無効です。",
    "まだ共有できる公式観測投稿がありません。","X の投稿","公式観測カードを作成しました。","共有リンクを作成できませんでした。","共有を取り消しました。リンクは使用できません。","共有を取り消せませんでした。","参加設定を変更できませんでした。","証拠基準を満たすとランキングに掲載される場合があります。","ランキングから削除しました。","この投稿は共有中です。下でリンクを管理してください。","作成中…","共有カードを作成","有効な共有リンク","ランキングを辞退","ランキングに参加","取り消し中…","共有を取り消す","証拠基準とヒットランキング",
    "承認済み投稿と X 公式の実測値だけを公開します。ランキング参加は別途の任意設定です。参加すると、共有していない低い実績も含む対象結果がアカウント順位に影響しますが、非公開の本文や投稿 ID は表示しません。取り消したリンクは当サイトで無効になりますが、外部サービスに古いプレビューが残る場合があります。",
    "私の X 公式観測",
  ],
  sw: [
    "Shiriki machapisho yenye uchunguzi rasmi wa X","Machapisho yaliyoidhinishwa na kuchapishwa na akaunti yako, kisha kupimwa na API rasmi ya X pekee yanaweza kushirikiwa. Kushiriki kumezimwa kwa kila chapisho mwanzoni.",
    "Bado hakuna chapisho rasmi la kushiriki.","Chapisho la X","Kadi ya uchunguzi rasmi imeundwa.","Kiungo cha kushiriki hakikuundwa.","Kushiriki kumeondolewa; kiungo hakifanyi kazi tena.","Kushiriki hakukuondolewa.","Ushiriki haukusasishwa.","Kadi inaweza kuonekana kwenye orodha ikiwa masharti ya ushahidi yametimizwa.","Imeondolewa kwenye orodha.","Kushiriki kumewezeshwa; dhibiti kiungo hapa chini.","Inaundwa…","Unda kadi ya kushiriki","Viungo vinavyofanya kazi","Ondoka kwenye orodha","Jiunge na orodha","Inaondolewa…","Ondoa kushiriki","Viwango vya ushahidi na orodha ya hit",
    "Machapisho yaliyoidhinishwa na uchunguzi halisi wa X pekee huwekwa hadharani. Ushiriki wa orodha ni chaguo tofauti la hiari. Ukijiunga, matokeo yote rasmi yanayofaa, hata ya chini yasiyoshirikiwa, yanaweza kuathiri nafasi ya akaunti; maandishi na ID binafsi hubaki siri. Viungo vilivyoondolewa havifanyi kazi hapa, lakini muonekano wa nje unaweza kubaki.",
    "Uchunguzi wangu rasmi wa X",
  ],
  mr: [
    "अधिकृत X निरीक्षण असलेल्या पोस्ट शेअर करा","तुमच्या खात्यातून मंजूर व प्रकाशित आणि नंतर अधिकृत X API द्वारे पाहिलेल्या पोस्टच पात्र आहेत. प्रत्येक शेअर सुरुवातीला बंद असतो.",
    "अजून शेअर करण्यास पात्र अधिकृत पोस्ट नाही.","X पोस्ट","अधिकृत निरीक्षण कार्ड तयार झाले.","शेअर लिंक तयार झाली नाही.","शेअर रद्द; लिंक आता उघडत नाही.","शेअर रद्द झाला नाही.","सहभाग बदलता आला नाही.","पुराव्याच्या अटी पूर्ण झाल्यास कार्ड क्रमवारीत दिसू शकते.","क्रमवारीतून काढले.","या पोस्टचे शेअरिंग सुरू आहे; खाली लिंक व्यवस्थापित करा.","तयार होत आहे…","शेअर कार्ड तयार करा","सक्रिय शेअर लिंक","क्रमवारी सोडा","क्रमवारीत सामील व्हा","रद्द होत आहे…","शेअर रद्द करा","पुराव्याच्या अटी आणि हिट क्रमवारी",
    "फक्त मंजूर पोस्ट व खरे अधिकृत X निरीक्षण सार्वजनिक होतात. क्रमवारीतील सहभाग स्वतंत्र व ऐच्छिक आहे. सहभागी झाल्यावर शेअर न केलेले कमी परिणामही खाते क्रमवारीवर परिणाम करू शकतात, पण खाजगी मजकूर व पोस्ट ID लपलेले राहतात. रद्द केलेल्या लिंक येथे उघडत नाहीत; बाह्य प्लॅटफॉर्म जुने प्रिव्ह्यू ठेवू शकतात.",
    "माझे अधिकृत X निरीक्षण",
  ],
  te: [
    "అధికారిక X పరిశీలనలున్న పోస్ట్‌లను షేర్ చేయండి","మీ ఖాతా నుంచి ఆమోదించి ప్రచురించిన, తర్వాత అధికారిక X APIతో పరిశీలించిన పోస్ట్‌లే అర్హులు. ప్రతి షేర్ మొదట నిలిపివేయబడి ఉంటుంది.",
    "ఇంకా షేర్ చేయదగిన అధికారిక పోస్ట్‌లు లేవు.","X పోస్ట్","అధికారిక పరిశీలన కార్డ్ రూపొందింది.","షేర్ లింక్ సృష్టించలేకపోయాం.","షేర్ రద్దయింది; లింక్ పనిచేయదు.","షేర్ రద్దు కాలేదు.","పాల్గొనడాన్ని మార్చలేకపోయాం.","ఆధార ప్రమాణాలు చేరితే కార్డ్ ర్యాంకింగ్‌లో కనిపించవచ్చు.","ర్యాంకింగ్ నుంచి తొలగించబడింది.","ఈ పోస్ట్ షేరింగ్ ఆన్‌లో ఉంది; కింద లింక్‌ను నిర్వహించండి.","సృష్టిస్తోంది…","షేర్ కార్డ్ సృష్టించు","సక్రియ షేర్ లింకులు","ర్యాంకింగ్ నుంచి బయటకు","ర్యాంకింగ్‌లో చేరండి","రద్దు చేస్తోంది…","షేర్ రద్దు","ఆధార ప్రమాణాలు మరియు హిట్ ర్యాంకింగ్",
    "ఆమోదించిన పోస్ట్‌లు, నిజమైన అధికారిక X పరిశీలనలే బహిరంగం. ర్యాంకింగ్‌లో చేరడం వేరు, స్వచ్ఛంద ఎంపిక. చేరిన తర్వాత షేర్ చేయని తక్కువ ఫలితాలూ ఖాతా ర్యాంకింగ్‌ను ప్రభావితం చేయవచ్చు; ప్రైవేట్ వచనం, పోస్ట్ IDలు దాచబడతాయి. రద్దు లింకులు ఇక్కడ తెరుచుకోవు, ఇతర వేదికల్లో పాత ప్రివ్యూలు ఉండవచ్చు.",
    "నా అధికారిక X పరిశీలన",
  ],
  tr: [
    "Resmî X gözlemiyle paylaşılabilir gönderiler","Yalnızca hesabından onaylanıp yayımlanmış, sonra resmî X API verisiyle gözlenmiş gönderiler uygundur. Her paylaşım varsayılan olarak kapalıdır.",
    "Henüz paylaşım için uygun resmî gözlem yok.","X gönderisi","Resmî X gözlem kartı oluşturuldu.","Paylaşım bağlantısı oluşturulamadı.","Paylaşım kapatıldı; bağlantı artık açılmaz.","Paylaşım kapatılamadı.","Katılım güncellenemedi.","Kanıt eşiği karşılandığında bu kart sıralamada görünebilir.","Kart sıralamadan çıkarıldı.","Bu gönderi için paylaşım açık; bağlantıyı aşağıdan yönet.","Oluşturuluyor…","Paylaşılabilir kart oluştur","Açık paylaşım bağlantıları","Sıralamadan çıkar","Sıralamaya katıl","Kapatılıyor…","Paylaşımı kapat","Kanıt eşikleri ve hit sıralaması",
    "Yalnızca onaylı gönderiler ve resmî X gözlem değerleri açıktır. Sıralamaya katılım ayrı ve isteğe bağlıdır. Katılınca paylaşılmamış düşük sonuçlar dahil tüm uygun resmî sonuçlar hesap sıralamasını etkileyebilir; özel metinler ve gönderi kimlikleri gizli kalır. Bağlantıyı kapatınca burada erişilemez, fakat sosyal platformlarda eski önizleme önbelleği kalabilir.",
    "Resmî X gözlemim",
  ],
  ta: [
    "அதிகாரப்பூர்வ X கண்காணிப்புகளுள்ள பதிவுகளைப் பகிரவும்","உங்கள் கணக்கில் ஒப்புதல் பெற்று வெளியிட்டபின் அதிகாரப்பூர்வ X API மூலம் கண்காணிக்கப்பட்ட பதிவுகள் மட்டுமே தகுதியுடையவை. ஒவ்வொரு பகிர்வும் இயல்பாக முடக்கப்பட்டுள்ளது.",
    "பகிரத்தகுந்த அதிகாரப்பூர்வ பதிவு இன்னும் இல்லை.","X பதிவு","அதிகாரப்பூர்வ கண்காணிப்பு அட்டை உருவாக்கப்பட்டது.","பகிர்வு இணைப்பை உருவாக்க முடியவில்லை.","பகிர்வு ரத்து; இணைப்பு இனி இயங்காது.","பகிர்வை ரத்து செய்ய முடியவில்லை.","பங்கேற்பை மாற்ற முடியவில்லை.","ஆதாரத் தரம் நிறைவேறினால் அட்டை தரவரிசையில் தோன்றலாம்.","தரவரிசையிலிருந்து நீக்கப்பட்டது.","இந்தப் பதிவின் பகிர்வு இயங்குகிறது; கீழே இணைப்பை நிர்வகிக்கவும்.","உருவாகிறது…","பகிர்வு அட்டையை உருவாக்கு","செயலில் உள்ள பகிர்வு இணைப்புகள்","தரவரிசையிலிருந்து விலகு","தரவரிசையில் சேர்","ரத்து செய்கிறது…","பகிர்வை ரத்து செய்","ஆதார அளவுகளும் ஹிட் தரவரிசையும்",
    "ஒப்புதல் பெற்ற பதிவுகளும் உண்மையான அதிகாரப்பூர்வ X கண்காணிப்புகளும் மட்டுமே பொதுவாகும். தரவரிசையில் சேர்வது தனியான விருப்பத் தேர்வு. சேர்ந்தால் பகிராத குறைந்த முடிவுகளும் கணக்கு தரவரிசையைப் பாதிக்கலாம்; தனிப்பட்ட உரைகளும் பதிவு IDகளும் மறைக்கப்படும். ரத்து இணைப்புகள் இங்கே இயங்காது, ஆனால் பிற தளங்களில் பழைய முன்னோட்டம் இருக்கலாம்.",
    "எனது அதிகாரப்பூர்வ X கண்காணிப்பு",
  ],
  vi: [
    "Chia sẻ bài đăng có quan sát X chính thức","Chỉ các bài đã được phê duyệt và đăng từ tài khoản của bạn, rồi được API X chính thức quan sát, mới đủ điều kiện. Mỗi lượt chia sẻ đều tắt theo mặc định.",
    "Chưa có bài đăng quan sát chính thức nào đủ điều kiện chia sẻ.","Bài đăng X","Đã tạo thẻ quan sát chính thức.","Không tạo được liên kết.","Đã thu hồi; liên kết không còn hoạt động.","Không thu hồi được.","Không thể cập nhật tham gia.","Thẻ có thể xuất hiện trong bảng xếp hạng khi đạt ngưỡng bằng chứng.","Đã gỡ khỏi bảng xếp hạng.","Đã bật chia sẻ bài này; quản lý liên kết bên dưới.","Đang tạo…","Tạo thẻ chia sẻ","Liên kết đang hoạt động","Rời bảng xếp hạng","Tham gia bảng xếp hạng","Đang thu hồi…","Thu hồi chia sẻ","Ngưỡng bằng chứng và xếp hạng hit",
    "Chỉ bài được phê duyệt và quan sát X thực tế là công khai. Tham gia bảng xếp hạng là lựa chọn riêng, tự nguyện. Khi tham gia, các kết quả chính thức đủ điều kiện, kể cả kết quả thấp chưa chia sẻ, có thể ảnh hưởng đến thứ hạng tài khoản; nội dung và ID riêng tư vẫn bị ẩn. Liên kết đã thu hồi không truy cập được tại đây, nhưng nơi khác có thể lưu bản xem trước cũ.",
    "Quan sát X chính thức của tôi",
  ],
  ko: [
    "X 공식 관측 게시물 공유","내 계정에서 승인·게시된 후 X 공식 API로 관측된 게시물만 공유할 수 있습니다. 각 게시물의 공유는 기본적으로 꺼져 있습니다.",
    "아직 공유할 수 있는 공식 관측 게시물이 없습니다.","X 게시물","공식 관측 카드가 생성되었습니다.","공유 링크를 만들 수 없습니다.","공유를 취소했습니다. 링크는 더 이상 열리지 않습니다.","공유를 취소할 수 없습니다.","참여 설정을 변경하지 못했습니다.","증거 기준을 충족하면 카드가 랭킹에 표시될 수 있습니다.","랭킹에서 제외했습니다.","이 게시물은 공유 중입니다. 아래에서 링크를 관리하세요.","생성 중…","공유 카드 만들기","활성 공유 링크","랭킹에서 나가기","랭킹에 참여","취소 중…","공유 취소","증거 기준 및 히트 랭킹",
    "승인된 게시물과 X 공식의 실제 관측만 공개합니다. 랭킹 참여는 별도의 자발적인 선택입니다. 참여하면 공유하지 않은 낮은 성과를 포함한 모든 적격 공식 결과가 계정 순위에 영향을 줄 수 있지만 비공개 본문과 게시물 ID는 숨깁니다. 취소한 링크는 사이트에서 열리지 않지만 다른 플랫폼에 예전 미리보기가 남을 수 있습니다.",
    "내 X 공식 관측",
  ],
};

export const hitSettingsCopy: Record<Locale, HitSettingsCopy> = Object.fromEntries(LOCALES.map(locale => {
  const values = rows[locale];
  if (!values || values.length !== hitSettingsKeys.length || values.some(text => !text.trim())) {
    throw new Error("Incomplete hit settings translation: " + locale);
  }
  return [locale, Object.fromEntries(hitSettingsKeys.map((key, index) => [key, values[index]]))];
})) as Record<Locale, HitSettingsCopy>;
