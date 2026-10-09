import type { Locale } from "./config";

export type ExcuseCampaignCopy = {
  title: string;
  intro: string;
  action: string;
  reset: string;
  hint: string;
  label: string;
  choices: readonly { excuse: string; response: string }[];
};

/** Direct, practical campaign copy. Every supported public locale has its own text. */
export const EXCUSE_CAMPAIGN: Record<Locale, ExcuseCampaignCopy> = {
  en: {
    title: "Blame the algorithm. Then burn the excuse.",
    intro: "Same feed. Same clichés. Expecting a different result. Pick an excuse and replace it with one move you can make today.",
    action: "Set up your desk", reset: "I have another excuse", hint: "Pick your excuse", label: "Today's move",
    choices: [
      { excuse: "The algorithm buries me.", response: "Put your last three posts side by side. Remove their opening lines. Can you still tell what they say? Rewrite just one today with a concrete example." },
      { excuse: "There is nothing new to say.", response: "Pick the last small problem you solved. What did you try, what failed, what changed? Drop the abstract advice and write those three details." },
      { excuse: "Everyone writes the same thing.", response: "Find a claim you disagree with. Challenge the claim, not the person. Build your position with one source and one counterexample." },
    ],
  },
  "zh-CN": {
    title: "怪算法之前，先烧掉这个借口。",
    intro: "信息流没变，套话没变，你却期待不同结果。选一个借口，换成今天就能做的一步。",
    action: "搭起你的工作台", reset: "我还有别的借口", hint: "选一个借口", label: "今天的一步",
    choices: [
      { excuse: "算法把我埋没了。", response: "把最近三条帖子并排放好，删掉开头几句。这样还能看出它们在说什么吗？今天只挑一条，用一个具体例子重写。" },
      { excuse: "没什么新东西可说。", response: "想想你最近解决的一个小问题。试过什么，哪里没成，后来有什么变化？别写空泛建议，把这三件事写下来。" },
      { excuse: "大家写的都一样。", response: "找一个你不同意的观点。反驳观点，不针对发言的人。用一个来源和一个反例写出自己的看法。" },
    ],
  },
  hi: {
    title: "एल्गोरिदम को दोष दो। फिर बहाना जला दो।",
    intro: "वही फ़ीड, वही घिसी-पिटी बातें, फिर भी अलग नतीजे की उम्मीद। एक बहाना चुनें और उसकी जगह आज उठाया जा सकने वाला एक कदम रखें।",
    action: "अपनी मेज़ तैयार करें", reset: "मेरे पास एक और बहाना है", hint: "अपना बहाना चुनें", label: "आज का कदम",
    choices: [
      { excuse: "एल्गोरिदम मेरी पोस्ट दबा देता है।", response: "अपनी पिछली तीन पोस्ट साथ रखें और उनकी शुरुआती पंक्तियाँ हटा दें। क्या फिर भी समझ आता है कि वे क्या कहती हैं? आज सिर्फ़ एक पोस्ट को ठोस उदाहरण के साथ दोबारा लिखें।" },
      { excuse: "कहने को कुछ नया नहीं है।", response: "हाल में हल की गई कोई छोटी समस्या चुनें। आपने क्या आज़माया, क्या नहीं चला, क्या बदला? अमूर्त सलाह छोड़ें और ये तीन बातें लिखें।" },
      { excuse: "सब एक जैसी बातें लिखते हैं।", response: "ऐसा दावा ढूँढ़ें जिससे आप असहमत हों। व्यक्ति पर नहीं, दावे पर सवाल उठाएँ। एक स्रोत और एक विपरीत उदाहरण से अपना पक्ष रखें।" },
    ],
  },
  es: {
    title: "Échale la culpa al algoritmo. Luego quema la excusa.",
    intro: "El mismo feed. Los mismos clichés. Y esperas otro resultado. Elige una excusa y cámbiala por algo que puedas hacer hoy.",
    action: "Prepara tu espacio", reset: "Tengo otra excusa", hint: "Elige tu excusa", label: "El paso de hoy",
    choices: [
      { excuse: "El algoritmo me hunde.", response: "Pon tus tres últimas publicaciones una al lado de otra y quítales las primeras frases. ¿Aún se entiende qué dicen? Reescribe solo una hoy con un ejemplo concreto." },
      { excuse: "No hay nada nuevo que decir.", response: "Elige el último problema pequeño que resolviste. ¿Qué probaste, qué falló y qué cambió? Deja los consejos abstractos y escribe esos tres detalles." },
      { excuse: "Todo el mundo escribe lo mismo.", response: "Busca una afirmación con la que no estés de acuerdo. Cuestiona la afirmación, no a la persona. Construye tu postura con una fuente y un contraejemplo." },
    ],
  },
  fr: {
    title: "Accuse l’algorithme. Puis brûle l’excuse.",
    intro: "Le même fil. Les mêmes clichés. Et tu attends un autre résultat. Choisis une excuse et remplace-la par une action faisable aujourd’hui.",
    action: "Installe ton espace", reset: "J’ai une autre excuse", hint: "Choisis ton excuse", label: "Le geste du jour",
    choices: [
      { excuse: "L’algorithme m’enterre.", response: "Mets tes trois derniers posts côte à côte et retire leurs premières phrases. Comprend-on encore leur propos ? Réécris-en un seul aujourd’hui avec un exemple concret." },
      { excuse: "Il n’y a rien de nouveau à dire.", response: "Choisis le dernier petit problème que tu as résolu. Qu’as-tu essayé, qu’est-ce qui a échoué, qu’est-ce qui a changé ? Oublie les conseils abstraits et écris ces trois détails." },
      { excuse: "Tout le monde écrit la même chose.", response: "Trouve une affirmation avec laquelle tu n’es pas d’accord. Conteste l’idée, pas la personne. Construis ton point de vue avec une source et un contre-exemple." },
    ],
  },
  ar: {
    title: "لُم الخوارزمية. ثم أحرق العذر.",
    intro: "الخلاصة نفسها، والعبارات المستهلكة نفسها، ومع ذلك تنتظر نتيجة مختلفة. اختر عذرًا واستبدله بخطوة تستطيع تنفيذها اليوم.",
    action: "جهّز مكتبك", reset: "لدي عذر آخر", hint: "اختر عذرك", label: "خطوة اليوم",
    choices: [
      { excuse: "الخوارزمية تدفن منشوراتي.", response: "ضع منشوراتك الثلاثة الأخيرة جنبًا إلى جنب واحذف مقدماتها. هل ما زال معناها واضحًا؟ أعد كتابة منشور واحد اليوم مستخدمًا مثالًا ملموسًا." },
      { excuse: "ليس لدي شيء جديد لأقوله.", response: "اختر آخر مشكلة صغيرة حللتها. ماذا جرّبت؟ ما الذي لم ينجح؟ وما الذي تغيّر؟ اترك النصائح العامة واكتب هذه التفاصيل الثلاثة." },
      { excuse: "الجميع يكتب الشيء نفسه.", response: "ابحث عن ادعاء لا توافق عليه. ناقش الادعاء لا صاحبه. ابنِ رأيك بمصدر واحد ومثال مضاد واحد." },
    ],
  },
  bn: {
    title: "অ্যালগরিদমকে দোষ দাও। তারপর অজুহাতটা পুড়িয়ে ফেলো।",
    intro: "একই ফিড, একই গতানুগতিক কথা, তবু ভিন্ন ফলের আশা। একটি অজুহাত বেছে নাও, আর তার বদলে আজই করা যায় এমন একটি পদক্ষেপ নাও।",
    action: "নিজের কাজের জায়গা গড়ো", reset: "আমার আরেকটি অজুহাত আছে", hint: "অজুহাত বেছে নাও", label: "আজকের পদক্ষেপ",
    choices: [
      { excuse: "অ্যালগরিদম আমাকে আড়াল করে দেয়।", response: "তোমার শেষ তিনটি পোস্ট পাশাপাশি রাখো, শুরুর বাক্যগুলো সরিয়ে দাও। তবু কি বোঝা যায় সেগুলো কী বলছে? আজ একটি পোস্টই নির্দিষ্ট উদাহরণ দিয়ে নতুন করে লেখো।" },
      { excuse: "নতুন করে বলার কিছু নেই।", response: "সম্প্রতি সমাধান করা ছোট একটি সমস্যা বেছে নাও। কী চেষ্টা করেছিলে, কী কাজ করেনি, কী বদলেছিল? বিমূর্ত উপদেশ বাদ দিয়ে এই তিনটি তথ্য লেখো।" },
      { excuse: "সবাই একই কথা লেখে।", response: "এমন একটি দাবি খুঁজে বের করো যার সঙ্গে তুমি একমত নও। ব্যক্তিকে নয়, দাবিটিকে প্রশ্ন করো। একটি উৎস ও একটি পাল্টা উদাহরণ দিয়ে নিজের অবস্থান লেখো।" },
    ],
  },
  "pt-BR": {
    title: "Culpe o algoritmo. Depois, queime a desculpa.",
    intro: "O mesmo feed. Os mesmos clichês. E você espera um resultado diferente. Escolha uma desculpa e troque por uma ação que possa fazer hoje.",
    action: "Monte seu espaço", reset: "Tenho outra desculpa", hint: "Escolha sua desculpa", label: "O passo de hoje",
    choices: [
      { excuse: "O algoritmo me esconde.", response: "Coloque seus três últimos posts lado a lado e remova as frases iniciais. Ainda dá para entender o que dizem? Reescreva apenas um hoje com um exemplo concreto." },
      { excuse: "Não há nada novo para dizer.", response: "Escolha o último problema pequeno que você resolveu. O que tentou, o que não funcionou, o que mudou? Deixe os conselhos abstratos de lado e escreva esses três detalhes." },
      { excuse: "Todo mundo escreve a mesma coisa.", response: "Encontre uma afirmação da qual discorda. Conteste a afirmação, não a pessoa. Construa sua posição com uma fonte e um contraexemplo." },
    ],
  },
  ru: {
    title: "Вини алгоритм. А потом сожги отговорку.",
    intro: "Та же лента. Те же штампы. А ты ждёшь другого результата. Выбери отговорку и замени её одним делом, которое можно сделать сегодня.",
    action: "Обустроить рабочее место", reset: "У меня есть другая отговорка", hint: "Выбери отговорку", label: "Шаг на сегодня",
    choices: [
      { excuse: "Алгоритм меня прячет.", response: "Поставь рядом три последних поста и убери первые фразы. Всё ещё понятно, о чём они? Перепиши сегодня только один, добавив конкретный пример." },
      { excuse: "Мне нечего сказать нового.", response: "Вспомни последнюю небольшую проблему, которую решил. Что попробовал, что не сработало, что изменилось? Забудь об общих советах и запиши эти три детали." },
      { excuse: "Все пишут одно и то же.", response: "Найди утверждение, с которым не согласен. Возражай против утверждения, а не человека. Обоснуй свою позицию одним источником и одним контрпримером." },
    ],
  },
  id: {
    title: "Salahkan algoritma. Lalu bakar alasannya.",
    intro: "Linimasa yang sama. Klise yang sama. Tapi berharap hasilnya berbeda. Pilih satu alasan dan ganti dengan satu langkah yang bisa kamu lakukan hari ini.",
    action: "Siapkan mejamu", reset: "Aku punya alasan lain", hint: "Pilih alasanmu", label: "Langkah hari ini",
    choices: [
      { excuse: "Algoritma menenggelamkan unggahanku.", response: "Letakkan tiga unggahan terakhirmu berdampingan dan hapus kalimat pembukanya. Masih jelas apa yang mereka sampaikan? Tulis ulang satu saja hari ini dengan contoh konkret." },
      { excuse: "Tidak ada hal baru untuk dikatakan.", response: "Pilih masalah kecil terakhir yang berhasil kamu selesaikan. Apa yang dicoba, apa yang gagal, apa yang berubah? Tinggalkan saran abstrak dan tulis tiga detail itu." },
      { excuse: "Semua orang menulis hal yang sama.", response: "Temukan klaim yang tidak kamu setujui. Sanggah klaimnya, bukan orangnya. Susun pendapatmu dengan satu sumber dan satu contoh tandingan." },
    ],
  },
  ur: {
    title: "الگورتھم کو الزام دو۔ پھر بہانے کو جلا دو۔",
    intro: "وہی فیڈ، وہی گھسے پٹے جملے، پھر بھی مختلف نتیجے کی امید۔ ایک بہانہ چنیں اور اس کی جگہ آج کیا جا سکنے والا ایک قدم رکھیں۔",
    action: "اپنی میز سجائیں", reset: "میرے پاس ایک اور بہانہ ہے", hint: "اپنا بہانہ چنیں", label: "آج کا قدم",
    choices: [
      { excuse: "الگورتھم میری پوسٹس دبا دیتا ہے۔", response: "اپنی پچھلی تین پوسٹس ساتھ رکھیں اور ابتدائی جملے ہٹا دیں۔ کیا پھر بھی سمجھ آتا ہے کہ وہ کیا کہتی ہیں؟ آج صرف ایک پوسٹ کو ٹھوس مثال کے ساتھ دوبارہ لکھیں۔" },
      { excuse: "کہنے کو کچھ نیا نہیں ہے۔", response: "حال ہی میں حل کیا گیا کوئی چھوٹا مسئلہ چنیں۔ کیا آزمایا، کیا ناکام ہوا، کیا بدلا؟ عمومی مشورہ چھوڑیں اور یہ تین تفصیلات لکھیں۔" },
      { excuse: "ہر کوئی ایک ہی بات لکھتا ہے۔", response: "ایسا دعویٰ تلاش کریں جس سے آپ متفق نہیں۔ شخص کے بجائے دعوے کو چیلنج کریں۔ ایک ماخذ اور ایک متضاد مثال سے اپنا مؤقف بنائیں۔" },
    ],
  },
  de: {
    title: "Gib dem Algorithmus die Schuld. Dann verbrenn die Ausrede.",
    intro: "Derselbe Feed. Dieselben Floskeln. Und du erwartest ein anderes Ergebnis. Wähle eine Ausrede und ersetze sie durch einen Schritt, den du heute gehen kannst.",
    action: "Richte deinen Platz ein", reset: "Ich habe noch eine Ausrede", hint: "Wähle deine Ausrede", label: "Der Schritt für heute",
    choices: [
      { excuse: "Der Algorithmus versteckt mich.", response: "Lege deine letzten drei Beiträge nebeneinander und streiche ihre Einstiege. Ist noch klar, was sie sagen? Schreibe heute nur einen mit einem konkreten Beispiel neu." },
      { excuse: "Es gibt nichts Neues zu sagen.", response: "Denk an das letzte kleine Problem, das du gelöst hast. Was hast du versucht, was ging schief, was änderte sich? Lass abstrakte Ratschläge weg und notiere diese drei Details." },
      { excuse: "Alle schreiben dasselbe.", response: "Finde eine Aussage, der du widersprichst. Fordere die Aussage heraus, nicht die Person. Begründe deine Sicht mit einer Quelle und einem Gegenbeispiel." },
    ],
  },
  ja: {
    title: "アルゴリズムのせいにして。それから言い訳を燃やそう。",
    intro: "同じフィード、同じ決まり文句。それでも違う結果を期待している。言い訳を一つ選び、今日できる一歩に置き換えよう。",
    action: "自分の作業台を整える", reset: "ほかにも言い訳がある", hint: "言い訳を選ぶ", label: "今日の一歩",
    choices: [
      { excuse: "アルゴリズムに埋もれてしまう。", response: "最近の投稿を三つ並べて、冒頭の一文を取り除いてみよう。それでも何を伝えているか分かる？今日は一つだけ、具体例を加えて書き直そう。" },
      { excuse: "新しく言えることがない。", response: "最近解決した小さな問題を一つ選ぼう。何を試し、何がうまくいかず、何が変わった？抽象的な助言はやめて、その三つを書こう。" },
      { excuse: "みんな同じことを書いている。", response: "賛成できない主張を一つ見つけよう。人ではなく主張に異議を唱える。一つの出典と一つの反例を使って、自分の考えを組み立てよう。" },
    ],
  },
  sw: {
    title: "Ilaumu algoriti. Kisha choma kisingizio.",
    intro: "Mlisho uleule. Misemo ileile. Lakini unatarajia matokeo tofauti. Chagua kisingizio, kisha ubadilishe kwa hatua moja unayoweza kuchukua leo.",
    action: "Andaa dawati lako", reset: "Nina kisingizio kingine", hint: "Chagua kisingizio", label: "Hatua ya leo",
    choices: [
      { excuse: "Algoriti inanizika.", response: "Weka machapisho yako matatu ya mwisho pamoja na uondoe sentensi za mwanzo. Bado inaeleweka yanasema nini? Leo andika upya moja tu kwa kutumia mfano halisi." },
      { excuse: "Hakuna jambo jipya la kusema.", response: "Chagua tatizo dogo la mwisho ulilotatua. Ulijaribu nini, nini hakikufanikiwa, nini kilibadilika? Acha ushauri wa jumla na uandike maelezo hayo matatu." },
      { excuse: "Kila mtu anaandika jambo lilelile.", response: "Tafuta dai usilokubaliana nalo. Pinga dai, si mtu. Jenga msimamo wako kwa chanzo kimoja na mfano mmoja unaolipinga." },
    ],
  },
  mr: {
    title: "अल्गोरिदमला दोष द्या. मग सबब जाळून टाका.",
    intro: "तोच फीड. तेच साचेबद्ध वाक्य. तरीही वेगळ्या परिणामाची अपेक्षा. एक सबब निवडा आणि तिच्या जागी आज करता येईल असे एक पाऊल ठेवा.",
    action: "तुमची कामाची जागा तयार करा", reset: "माझ्याकडे आणखी एक सबब आहे", hint: "तुमची सबब निवडा", label: "आजचे पाऊल",
    choices: [
      { excuse: "अल्गोरिदम माझ्या पोस्ट दडपतो.", response: "तुमच्या शेवटच्या तीन पोस्ट शेजारी ठेवा आणि सुरुवातीची वाक्ये काढा. तरी त्यांचा अर्थ समजतो का? आज फक्त एक पोस्ट ठोस उदाहरणासह पुन्हा लिहा." },
      { excuse: "नवीन सांगण्यासारखे काही नाही.", response: "अलीकडे सोडवलेली एखादी छोटी समस्या निवडा. काय करून पाहिले, काय जमले नाही, काय बदलले? अमूर्त सल्ला सोडा आणि हे तीन तपशील लिहा." },
      { excuse: "सगळे सारखेच लिहितात.", response: "ज्या दाव्याशी तुम्ही असहमत आहात असा दावा शोधा. व्यक्तीला नव्हे, दाव्याला आव्हान द्या. एका स्रोताने आणि एका प्रतिउदाहरणाने तुमचे मत मांडा." },
    ],
  },
  te: {
    title: "అల్గారిథమ్‌ను నిందించు. ఆ తర్వాత సాకును కాల్చేయి.",
    intro: "అదే ఫీడ్. అవే మూస మాటలు. అయినా వేరే ఫలితాన్ని ఆశిస్తున్నావు. ఒక సాకును ఎంచుకుని, దాని బదులు ఈరోజే చేయగల ఒక అడుగు వేయి.",
    action: "నీ పని స్థలాన్ని సిద్ధం చేసుకో", reset: "నా దగ్గర ఇంకో సాకు ఉంది", hint: "నీ సాకును ఎంచుకో", label: "ఈరోజు అడుగు",
    choices: [
      { excuse: "అల్గారిథమ్ నన్ను కనిపించకుండా చేస్తోంది.", response: "నీ చివరి మూడు పోస్టులను పక్కపక్కన పెట్టి, మొదటి వాక్యాలను తీసేయి. అవి ఏమి చెబుతున్నాయో ఇంకా అర్థమవుతోందా? ఈరోజు ఒకదాన్నే ఒక స్పష్టమైన ఉదాహరణతో మళ్లీ రాయి." },
      { excuse: "కొత్తగా చెప్పడానికి ఏమీ లేదు.", response: "ఇటీవల పరిష్కరించిన చిన్న సమస్యను ఎంచుకో. ఏమి ప్రయత్నించావు, ఏమి పనిచేయలేదు, ఏమి మారింది? అస్పష్టమైన సలహా వదిలి ఆ మూడు వివరాలు రాయి." },
      { excuse: "అందరూ ఒకటే రాస్తున్నారు.", response: "నువ్వు ఏకీభవించని వాదనను కనుగొను. వ్యక్తిని కాదు, వాదనను ప్రశ్నించు. ఒక మూలం, ఒక ప్రతివాద ఉదాహరణతో నీ అభిప్రాయాన్ని నిర్మించు." },
    ],
  },
  tr: {
    title: "Algoritmayı suçla. Sonra bahaneyi yak.",
    intro: "Aynı akış. Aynı klişeler. Başka bir sonuç bekliyorsun. Bir bahaneyi seç; yerine bugün yapabileceğin tek bir hamle koy.",
    action: "Kendi masanı kur", reset: "Başka bahanem var", hint: "Bahaneyi seç", label: "Bugünün hamlesi",
    choices: [
      { excuse: "Algoritma beni gömüyor.", response: "Son üç gönderini yan yana koy. İlk cümleleri çıkar. Hâlâ ne söylediğin anlaşılıyor mu? Bugün yalnızca birini, somut bir örnekle yeniden yaz." },
      { excuse: "Söyleyecek yeni bir şey yok.", response: "En son çözdüğün küçük sorunu seç. Ne denedin, ne olmadı, ne değişti? Soyut tavsiyeyi bırak; o üç ayrıntıyı yaz." },
      { excuse: "Herkes aynı şeyi yazıyor.", response: "Katılmadığın bir iddiayı bul. Kişiye değil, iddiaya karşı çık. Bir kaynak ve tek bir karşı örnekle kendi görüşünü kur." },
    ],
  },
  ta: {
    title: "அல்காரிதத்தைப் பழி சொல். பிறகு சாக்கைக் கொளுத்து.",
    intro: "அதே ஊட்டம். அதே பழைய சொற்கள். ஆனால் வேறு முடிவை எதிர்பார்க்கிறாய். ஒரு சாக்கைத் தேர்ந்தெடுத்து, இன்று செய்யக்கூடிய ஒரு செயலால் அதை மாற்று.",
    action: "உன் மேசையை அமை", reset: "என்னிடம் இன்னொரு சாக்கு உள்ளது", hint: "உன் சாக்கைத் தேர்ந்தெடு", label: "இன்றைய செயல்",
    choices: [
      { excuse: "அல்காரிதம் என்னை மறைக்கிறது.", response: "உன் கடைசி மூன்று பதிவுகளையும் அருகருகே வை. தொடக்க வரிகளை நீக்கு. அவை என்ன சொல்கின்றன என்பது இன்னும் புரிகிறதா? இன்று ஒன்றை மட்டும் ஓர் உறுதியான எடுத்துக்காட்டுடன் மீண்டும் எழுது." },
      { excuse: "புதிதாகச் சொல்ல ஒன்றுமில்லை.", response: "சமீபத்தில் நீ தீர்த்த சிறிய சிக்கலைத் தேர்ந்தெடு. என்ன முயன்றாய், எது பலிக்கவில்லை, என்ன மாறியது? பொதுவான அறிவுரையை விடுத்து அந்த மூன்று விவரங்களையும் எழுது." },
      { excuse: "எல்லோரும் ஒரே விஷயத்தையே எழுதுகிறார்கள்.", response: "நீ ஏற்காத கூற்று ஒன்றைக் கண்டுபிடி. நபரை அல்ல, கூற்றை எதிர்த்து வாதிடு. ஒரு ஆதாரத்தையும் ஓர் எதிர் எடுத்துக்காட்டையும் கொண்டு உன் நிலைப்பாட்டை அமை." },
    ],
  },
  vi: {
    title: "Đổ lỗi cho thuật toán. Rồi đốt lời bào chữa.",
    intro: "Bảng tin vẫn vậy. Lời sáo rỗng vẫn vậy. Nhưng bạn lại mong kết quả khác. Hãy chọn một lời bào chữa và thay bằng một việc bạn có thể làm hôm nay.",
    action: "Sắp xếp bàn làm việc", reset: "Tôi còn một lời bào chữa", hint: "Chọn lời bào chữa", label: "Việc hôm nay",
    choices: [
      { excuse: "Thuật toán vùi lấp bài của tôi.", response: "Đặt ba bài gần nhất cạnh nhau rồi bỏ phần mở đầu. Người đọc còn hiểu chúng nói gì không? Hôm nay chỉ viết lại một bài với một ví dụ cụ thể." },
      { excuse: "Chẳng có gì mới để nói.", response: "Chọn vấn đề nhỏ gần đây nhất bạn đã giải quyết. Bạn thử gì, điều gì không hiệu quả, điều gì thay đổi? Bỏ lời khuyên chung chung và viết ba chi tiết đó." },
      { excuse: "Ai cũng viết giống nhau.", response: "Tìm một nhận định bạn không đồng ý. Phản biện nhận định, đừng công kích người nói. Dùng một nguồn và một ví dụ đối lập để trình bày quan điểm." },
    ],
  },
  ko: {
    title: "알고리즘 탓을 해. 그리고 그 핑계를 태워 버려.",
    intro: "같은 피드, 같은 진부한 말. 그런데 다른 결과를 기대하고 있어. 핑계 하나를 골라 오늘 할 수 있는 행동 하나로 바꿔 봐.",
    action: "나만의 작업 공간 만들기", reset: "다른 핑계가 있어", hint: "핑계를 골라 봐", label: "오늘 할 일",
    choices: [
      { excuse: "알고리즘이 내 게시물을 묻어 버려.", response: "최근 게시물 세 개를 나란히 놓고 첫 문장을 지워 봐. 그래도 무슨 말을 하는지 알 수 있어? 오늘 하나만 구체적인 사례를 넣어 다시 써 봐." },
      { excuse: "새롭게 할 말이 없어.", response: "최근에 해결한 작은 문제 하나를 골라 봐. 무엇을 시도했고, 무엇이 안 됐고, 무엇이 달라졌어? 막연한 조언은 빼고 그 세 가지를 적어 봐." },
      { excuse: "다들 똑같은 말을 써.", response: "동의하지 않는 주장을 하나 찾아 봐. 사람을 공격하지 말고 주장에 이의를 제기해. 출처 하나와 반례 하나로 네 관점을 세워 봐." },
    ],
  },
};
