import { LOCALES, type Locale } from "./config";

export const authKeys = [
  "loginDesc", "signupDesc", "forgotTitle", "forgotDesc", "forgotButton", "resetTitle", "resetDesc", "resetButton",
  "withX", "xUnavailable", "xFailure", "email", "password", "newPassword", "minLength", "wait",
  "forgotLink", "missingToken", "resetSent", "passwordUpdated", "genericError", "signInUnavailable", "signInRetry",
  "links", "xEmailMissing", "xProfileMissing", "xContinueError", "xBadUrl",
] as const;
export type AuthCopyKey = typeof authKeys[number];
export type AuthCopy = Record<AuthCopyKey, string>;

/** Auth messages are reviewed locale strings, not live machine-translated form inputs. */
const rows: Record<Locale, readonly string[]> = {
  en: [
    "Continue to your opportunities, drafts, and results.", "Create an account and discover opportunities for you.",
    "Reset your password", "We'll email you a reset link.", "Send link", "Set a new password", "Choose a new password for your account.", "Update password",
    "Continue with X", "X sign-in is not enabled here.", "X sign-in failed. Try again or use email.",
    "Email", "Password", "New password", "At least 12 characters.", "Please wait…", "Forgot password?",
    "Reset link is invalid or missing. Request a new one.", "If an account exists for this address, a reset link has been sent.", "Password updated. You can sign in.", "Could not complete the request. Try again.",
    "Sign-in is temporarily unavailable", "Refresh this page and try again shortly.", "Account links",
    "X did not share a verified email. Use email sign-in or check X permissions.", "X profile details or permissions could not be retrieved. Review permissions and try again.", "Could not continue with X. Try email or retry.", "The X sign-in URL could not be verified.",
  ],
  "zh-CN": [
    "继续查看你的机会、草稿和成果。","创建账号，发现适合你的机会。","重置密码","我们会向你的邮箱发送重置链接。","发送链接","设置新密码","为账号选择新密码。","更新密码",
    "通过 X 继续","此服务尚未启用 X 登录。","X 登录失败，请重试或使用邮箱。","电子邮箱","密码","新密码","至少 12 个字符。","请稍候…","忘记密码？",
    "重置链接无效或缺失，请重新申请。","如果该邮箱存在账号，重置链接已发送。","密码已更新，可以登录。","操作失败，请重试。","暂时无法登录","请稍后刷新页面重试。","账号链接",
    "X 未提供已验证邮箱，请使用邮箱登录或检查授权。","无法获取 X 资料或所需权限，请检查后重试。","无法通过 X 继续，请使用邮箱或重试。","无法验证 X 登录链接。",
  ],
  hi: [
    "अपने अवसरों, ड्राफ़्ट और परिणामों पर लौटें।","खाता बनाएँ और अपने लिए अवसर खोजें।","पासवर्ड रीसेट करें","हम ईमेल पर रीसेट लिंक भेजेंगे।","लिंक भेजें","नया पासवर्ड बनाएँ","अपने खाते के लिए नया पासवर्ड चुनें।","पासवर्ड बदलें",
    "X से जारी रखें","इस सेवा में X से लॉगिन चालू नहीं है।","X लॉगिन विफल हुआ। फिर कोशिश करें या ईमेल इस्तेमाल करें।","ईमेल","पासवर्ड","नया पासवर्ड","कम से कम 12 अक्षर।","कृपया प्रतीक्षा करें…","पासवर्ड भूल गए?",
    "रीसेट लिंक अमान्य या गायब है। नया लिंक माँगें।","यदि इस पते का खाता है, तो रीसेट लिंक भेज दिया गया है।","पासवर्ड अपडेट हो गया। अब साइन इन करें।","कार्रवाई पूरी नहीं हुई। फिर कोशिश करें।","साइन इन अभी उपलब्ध नहीं है","कुछ देर बाद पेज रीफ़्रेश करके फिर कोशिश करें।","खाता लिंक",
    "X ने सत्यापित ईमेल साझा नहीं किया। ईमेल से लॉगिन करें या अनुमति जाँचें।","X प्रोफ़ाइल या आवश्यक अनुमतियाँ नहीं मिल सकीं। अनुमतियाँ जाँचें।","X से जारी नहीं रख सके। ईमेल से प्रयास करें।","X लॉगिन लिंक सत्यापित नहीं हो सका।",
  ],
  es: [
    "Continúa con tus oportunidades, borradores y resultados.","Crea una cuenta y descubre oportunidades para ti.","Restablecer contraseña","Te enviaremos un enlace por correo.","Enviar enlace","Establecer nueva contraseña","Elige una contraseña nueva para tu cuenta.","Actualizar contraseña",
    "Continuar con X","El acceso con X no está habilitado aquí.","No se pudo iniciar sesión con X. Reinténtalo o usa el correo.","Correo electrónico","Contraseña","Nueva contraseña","Al menos 12 caracteres.","Espera un momento…","¿Olvidaste tu contraseña?",
    "El enlace no es válido o falta. Solicita otro.","Si existe una cuenta con este correo, se ha enviado un enlace.","Contraseña actualizada. Ya puedes iniciar sesión.","No se pudo completar la operación. Inténtalo de nuevo.","El inicio de sesión no está disponible temporalmente","Actualiza la página e inténtalo más tarde.","Enlaces de cuenta",
    "X no compartió un correo verificado. Usa el correo o revisa los permisos.","No se obtuvieron el perfil de X o los permisos necesarios. Revísalos.","No se pudo continuar con X. Usa el correo o reinténtalo.","No se pudo verificar el enlace de X.",
  ],
  fr: [
    "Reprenez vos opportunités, brouillons et résultats.","Créez un compte et découvrez vos opportunités.","Réinitialiser le mot de passe","Nous enverrons un lien de réinitialisation par e-mail.","Envoyer le lien","Définir un nouveau mot de passe","Choisissez un nouveau mot de passe pour votre compte.","Mettre à jour le mot de passe",
    "Continuer avec X","La connexion avec X n'est pas activée ici.","Connexion X échouée. Réessayez ou utilisez votre e-mail.","E-mail","Mot de passe","Nouveau mot de passe","Au moins 12 caractères.","Veuillez patienter…","Mot de passe oublié ?",
    "Lien invalide ou absent. Demandez-en un nouveau.","Si ce compte existe, un lien de réinitialisation a été envoyé.","Mot de passe modifié. Vous pouvez vous connecter.","Opération impossible. Réessayez.","Connexion temporairement indisponible","Actualisez la page et réessayez dans un instant.","Liens du compte",
    "X n'a pas transmis d'e-mail vérifié. Utilisez l'e-mail ou vérifiez les autorisations.","Impossible d'obtenir le profil X ou les autorisations requises. Vérifiez-les.","Impossible de continuer avec X. Essayez par e-mail.","Impossible de vérifier le lien de connexion X.",
  ],
  ar: [
    "تابع فرصك ومسوداتك ونتائجك.","أنشئ حسابًا واكتشف الفرص المناسبة لك.","إعادة تعيين كلمة المرور","سنرسل رابط إعادة التعيين إلى بريدك الإلكتروني.","إرسال الرابط","تعيين كلمة مرور جديدة","اختر كلمة مرور جديدة لحسابك.","تحديث كلمة المرور",
    "المتابعة باستخدام X","تسجيل الدخول عبر X غير مفعّل هنا.","فشل تسجيل الدخول عبر X. حاول مجددًا أو استخدم البريد الإلكتروني.","البريد الإلكتروني","كلمة المرور","كلمة مرور جديدة","12 حرفًا على الأقل.","يرجى الانتظار…","هل نسيت كلمة المرور؟",
    "رابط إعادة التعيين غير صالح أو مفقود. اطلب رابطًا جديدًا.","إذا كان لهذا العنوان حساب، فقد أُرسل رابط إعادة التعيين.","تم تحديث كلمة المرور. يمكنك تسجيل الدخول.","تعذّر إكمال العملية. حاول مجددًا.","تسجيل الدخول غير متاح مؤقتًا","حدّث الصفحة وحاول بعد قليل.","روابط الحساب",
    "لم يشارك X بريدًا إلكترونيًا موثّقًا. استخدم البريد أو راجع الأذونات.","تعذّر الحصول على ملف X أو الأذونات المطلوبة. راجع الأذونات.","تعذّرت المتابعة باستخدام X. حاول بالبريد الإلكتروني.","تعذّر التحقق من رابط تسجيل الدخول عبر X.",
  ],
  bn: [
    "আপনার সুযোগ, খসড়া ও ফলাফলে ফিরে যান।","অ্যাকাউন্ট তৈরি করে আপনার উপযোগী সুযোগ খুঁজুন।","পাসওয়ার্ড রিসেট করুন","আমরা ইমেইলে রিসেট লিংক পাঠাব।","লিংক পাঠান","নতুন পাসওয়ার্ড দিন","অ্যাকাউন্টের জন্য নতুন পাসওয়ার্ড বেছে নিন।","পাসওয়ার্ড আপডেট করুন",
    "X দিয়ে চালিয়ে যান","এখানে X দিয়ে লগইন চালু নেই।","X লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন বা ইমেইল ব্যবহার করুন।","ইমেইল","পাসওয়ার্ড","নতুন পাসওয়ার্ড","কমপক্ষে ১২ অক্ষর।","অনুগ্রহ করে অপেক্ষা করুন…","পাসওয়ার্ড ভুলে গেছেন?",
    "রিসেট লিংকটি অবৈধ বা নেই। নতুন লিংক চান।","এই ইমেইলে অ্যাকাউন্ট থাকলে রিসেট লিংক পাঠানো হয়েছে।","পাসওয়ার্ড বদলানো হয়েছে। এখন লগইন করুন।","কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।","লগইন সাময়িকভাবে বন্ধ","কিছুক্ষণ পরে পেজ রিফ্রেশ করে চেষ্টা করুন।","অ্যাকাউন্টের লিংক",
    "X যাচাইকৃত ইমেইল দেয়নি। ইমেইলে লগইন করুন বা অনুমতি দেখুন।","X প্রোফাইল বা প্রয়োজনীয় অনুমতি পাওয়া যায়নি। অনুমতি দেখুন।","X দিয়ে এগোনো যায়নি। ইমেইল দিয়ে চেষ্টা করুন।","X লগইন লিংক যাচাই করা যায়নি।",
  ],
  "pt-BR": [
    "Continue com suas oportunidades, rascunhos e resultados.","Crie sua conta e descubra oportunidades para você.","Redefinir senha","Enviaremos um link de redefinição por e-mail.","Enviar link","Definir nova senha","Escolha uma nova senha para sua conta.","Atualizar senha",
    "Continuar com X","O login com X não está habilitado aqui.","Falha no login com X. Tente novamente ou use e-mail.","E-mail","Senha","Nova senha","Pelo menos 12 caracteres.","Aguarde…","Esqueceu a senha?",
    "Link inválido ou ausente. Solicite outro.","Se houver conta neste e-mail, enviamos um link.","Senha atualizada. Você já pode entrar.","Não foi possível concluir. Tente novamente.","Login temporariamente indisponível","Atualize a página e tente novamente em instantes.","Links da conta",
    "X não compartilhou um e-mail verificado. Use e-mail ou confira as permissões.","Não foi possível obter o perfil do X ou as permissões. Confira-as.","Não foi possível continuar com X. Use e-mail ou tente novamente.","Não foi possível verificar o link de login do X.",
  ],
  ru: [
    "Вернитесь к возможностям, черновикам и результатам.","Создайте аккаунт и находите подходящие возможности.","Сбросить пароль","Мы отправим ссылку для сброса на почту.","Отправить ссылку","Установить новый пароль","Выберите новый пароль для аккаунта.","Обновить пароль",
    "Продолжить через X","Вход через X здесь не включён.","Не удалось войти через X. Повторите попытку или используйте почту.","Эл. почта","Пароль","Новый пароль","Не менее 12 символов.","Подождите…","Забыли пароль?",
    "Ссылка недействительна или отсутствует. Запросите новую.","Если аккаунт существует, ссылка для сброса отправлена.","Пароль обновлён. Теперь можно войти.","Не удалось выполнить действие. Повторите попытку.","Вход временно недоступен","Обновите страницу и повторите попытку позже.","Ссылки аккаунта",
    "X не передал подтверждённую почту. Войдите по почте или проверьте разрешения.","Не удалось получить профиль X или нужные разрешения. Проверьте их.","Не удалось продолжить через X. Попробуйте вход по почте.","Не удалось проверить ссылку входа через X.",
  ],
  id: [
    "Lanjutkan ke peluang, draf, dan hasil Anda.","Buat akun dan temukan peluang yang sesuai.","Atur ulang kata sandi","Kami akan mengirim tautan pengaturan ulang lewat email.","Kirim tautan","Buat kata sandi baru","Pilih kata sandi baru untuk akun Anda.","Perbarui kata sandi",
    "Lanjutkan dengan X","Login dengan X belum diaktifkan di sini.","Login X gagal. Coba lagi atau gunakan email.","Email","Kata sandi","Kata sandi baru","Minimal 12 karakter.","Harap tunggu…","Lupa kata sandi?",
    "Tautan tidak valid atau hilang. Minta tautan baru.","Jika akun dengan email ini ada, tautan sudah dikirim.","Kata sandi diperbarui. Anda bisa masuk.","Tindakan gagal. Coba lagi.","Login sementara tidak tersedia","Muat ulang halaman dan coba lagi sebentar lagi.","Tautan akun",
    "X tidak memberikan email terverifikasi. Gunakan email atau periksa izin.","Profil X atau izin yang diperlukan tidak dapat diambil. Periksa izin.","Tidak dapat melanjutkan dengan X. Coba dengan email.","Tautan login X tidak dapat diverifikasi.",
  ],
  ur: [
    "اپنے مواقع، مسودوں اور نتائج کی طرف واپس جائیں۔","اکاؤنٹ بنائیں اور اپنے لیے موزوں مواقع دریافت کریں۔","پاس ورڈ دوبارہ مقرر کریں","ہم ای میل پر ری سیٹ لنک بھیجیں گے۔","لنک بھیجیں","نیا پاس ورڈ مقرر کریں","اپنے اکاؤنٹ کے لیے نیا پاس ورڈ چنیں۔","پاس ورڈ تبدیل کریں",
    "X کے ساتھ جاری رکھیں","یہاں X کے ذریعے لاگ اِن فعال نہیں ہے۔","X لاگ اِن ناکام ہوا۔ دوبارہ کوشش کریں یا ای میل استعمال کریں۔","ای میل","پاس ورڈ","نیا پاس ورڈ","کم از کم 12 حروف۔","انتظار کریں…","پاس ورڈ بھول گئے؟",
    "ری سیٹ لنک غلط یا غائب ہے۔ نیا لنک منگوائیں۔","اگر اس پتے کا اکاؤنٹ موجود ہے تو لنک بھیج دیا گیا ہے۔","پاس ورڈ بدل گیا۔ اب لاگ اِن کر سکتے ہیں۔","درخواست مکمل نہ ہوئی۔ دوبارہ کوشش کریں۔","لاگ اِن عارضی طور پر دستیاب نہیں","صفحہ تازہ کر کے کچھ دیر بعد کوشش کریں۔","اکاؤنٹ روابط",
    "X نے تصدیق شدہ ای میل نہیں دی۔ ای میل استعمال کریں یا اجازتیں دیکھیں۔","X پروفائل یا ضروری اجازتیں حاصل نہ ہو سکیں۔ اجازتیں دیکھیں۔","X کے ذریعے آگے نہیں بڑھ سکے۔ ای میل سے کوشش کریں۔","X لاگ اِن لنک کی تصدیق نہ ہو سکی۔",
  ],
  de: [
    "Fahre mit deinen Chancen, Entwürfen und Ergebnissen fort.","Erstelle ein Konto und entdecke passende Chancen.","Passwort zurücksetzen","Wir senden dir einen Link per E-Mail.","Link senden","Neues Passwort festlegen","Wähle ein neues Passwort für dein Konto.","Passwort aktualisieren",
    "Mit X fortfahren","X-Anmeldung ist hier nicht aktiviert.","X-Anmeldung fehlgeschlagen. Versuche es erneut oder nutze E-Mail.","E-Mail","Passwort","Neues Passwort","Mindestens 12 Zeichen.","Bitte warten…","Passwort vergessen?",
    "Link ungültig oder fehlt. Fordere einen neuen an.","Falls dieses Konto existiert, wurde ein Link versendet.","Passwort aktualisiert. Du kannst dich anmelden.","Vorgang fehlgeschlagen. Bitte erneut versuchen.","Anmeldung vorübergehend nicht verfügbar","Lade die Seite neu und versuche es gleich erneut.","Kontolinks",
    "X hat keine verifizierte E-Mail geteilt. Melde dich per E-Mail an oder prüfe Berechtigungen.","X-Profil oder notwendige Berechtigungen konnten nicht geladen werden. Bitte prüfen.","Mit X konnte nicht fortgefahren werden. Nutze E-Mail oder versuche es erneut.","X-Anmeldelink konnte nicht geprüft werden.",
  ],
  ja: [
    "あなたの機会、下書き、成果の続きへ。","アカウントを作成して、あなたに合った機会を見つけましょう。","パスワードを再設定","再設定用リンクをメールで送信します。","リンクを送信","新しいパスワードを設定","アカウントの新しいパスワードを選んでください。","パスワードを更新",
    "X で続行","この環境では X ログインは無効です。","X ログインに失敗しました。再試行するかメールを使ってください。","メールアドレス","パスワード","新しいパスワード","12文字以上。","お待ちください…","パスワードをお忘れですか？",
    "再設定リンクが無効またはありません。新しいリンクをリクエストしてください。","該当アカウントがあれば再設定リンクを送信しました。","パスワードを更新しました。ログインできます。","処理できませんでした。もう一度お試しください。","現在ログインできません","しばらくしてからページを更新してください。","アカウントのリンク",
    "X から認証済みメールが提供されませんでした。メールを使用するか権限を確認してください。","X のプロフィールまたは必要な権限を取得できません。設定を確認してください。","X で続行できません。メールをご利用ください。","X ログイン用リンクを検証できませんでした。",
  ],
  sw: [
    "Endelea na fursa, rasimu na matokeo yako.","Fungua akaunti na ugundue fursa zinazokufaa.","Weka upya nenosiri","Tutakutumia kiungo cha kubadili nenosiri kwa barua pepe.","Tuma kiungo","Weka nenosiri jipya","Chagua nenosiri jipya la akaunti yako.","Sasisha nenosiri",
    "Endelea kwa X","Kuingia kwa X hakujawashwa hapa.","Kuingia kwa X kumeshindikana. Jaribu tena au tumia barua pepe.","Barua pepe","Nenosiri","Nenosiri jipya","Angalau herufi 12.","Tafadhali subiri…","Umesahau nenosiri?",
    "Kiungo si halali au hakipo. Omba kingine.","Ikiwa akaunti ipo kwa anwani hii, kiungo kimetumwa.","Nenosiri limesasishwa. Unaweza kuingia.","Hatukuweza kukamilisha. Jaribu tena.","Kuingia hakupatikani kwa muda","Onyesha upya ukurasa na ujaribu tena baadaye.","Viungo vya akaunti",
    "X haijatoa barua pepe iliyothibitishwa. Tumia barua pepe au kagua ruhusa.","Wasifu wa X au ruhusa zinazohitajika hazikupatikana. Kagua ruhusa.","Haiwezekani kuendelea kwa X. Jaribu barua pepe.","Kiungo cha kuingia kwa X hakijathibitishwa.",
  ],
  mr: [
    "तुमच्या संधी, मसुदे आणि निकालांकडे परत जा.","खाते तयार करा आणि योग्य संधी शोधा.","पासवर्ड रीसेट करा","आम्ही ईमेलवर रीसेट लिंक पाठवू.","लिंक पाठवा","नवा पासवर्ड ठेवा","खात्यासाठी नवा पासवर्ड निवडा.","पासवर्ड बदला",
    "X द्वारे पुढे जा","येथे X लॉगिन सुरू नाही.","X लॉगिन अयशस्वी. पुन्हा प्रयत्न करा किंवा ईमेल वापरा.","ईमेल","पासवर्ड","नवा पासवर्ड","किमान १२ अक्षरे.","कृपया थांबा…","पासवर्ड विसरलात?",
    "रीसेट लिंक अवैध किंवा गायब आहे. नवी मागवा.","या पत्त्यावर खाते असल्यास रीसेट लिंक पाठवली आहे.","पासवर्ड बदलला. आता लॉगिन करा.","कृती पूर्ण झाली नाही. पुन्हा प्रयत्न करा.","लॉगिन तात्पुरते उपलब्ध नाही","थोड्या वेळाने पान रिफ्रेश करून प्रयत्न करा.","खाते दुवे",
    "X ने सत्यापित ईमेल दिला नाही. ईमेल वापरा किंवा परवानग्या तपासा.","X प्रोफाइल किंवा आवश्यक परवानग्या मिळाल्या नाहीत. तपासा.","X द्वारे पुढे जाता आले नाही. ईमेल वापरा.","X लॉगिन दुवा सत्यापित झाला नाही.",
  ],
  te: [
    "మీ అవకాశాలు, డ్రాఫ్ట్‌లు, ఫలితాలకు తిరిగి వెళ్లండి.","ఖాతా సృష్టించి మీకు సరిపోయే అవకాశాలు కనుగొనండి.","పాస్‌వర్డ్ రీసెట్","ఈమెయిల్‌కు రీసెట్ లింక్ పంపుతాము.","లింక్ పంపు","కొత్త పాస్‌వర్డ్ పెట్టండి","మీ ఖాతాకు కొత్త పాస్‌వర్డ్ ఎంచుకోండి.","పాస్‌వర్డ్ మార్చు",
    "Xతో కొనసాగండి","ఇక్కడ X లాగిన్ ప్రారంభించలేదు.","X లాగిన్ విఫలమైంది. మళ్లీ ప్రయత్నించండి లేదా ఈమెయిల్ వాడండి.","ఈమెయిల్","పాస్‌వర్డ్","కొత్త పాస్‌వర్డ్","కనీసం 12 అక్షరాలు.","దయచేసి వేచి ఉండండి…","పాస్‌వర్డ్ మర్చిపోయారా?",
    "రీసెట్ లింక్ చెల్లదు లేదా లేదు. కొత్త లింక్ అడగండి.","ఈ చిరునామాకు ఖాతా ఉంటే రీసెట్ లింక్ పంపబడింది.","పాస్‌వర్డ్ మార్చబడింది. లాగిన్ అవ్వండి.","పని పూర్తికాలేదు. మళ్లీ ప్రయత్నించండి.","లాగిన్ తాత్కాలికంగా అందుబాటులో లేదు","కొద్దిసేపటి తర్వాత పేజీ రిఫ్రెష్ చేయండి.","ఖాతా లింకులు",
    "X ధృవీకరించిన ఈమెయిల్ ఇవ్వలేదు. ఈమెయిల్ వాడండి లేదా అనుమతులు చూడండి.","X ప్రొఫైల్ లేదా అవసరమైన అనుమతులు అందలేదు. పరిశీలించండి.","Xతో కొనసాగలేకపోయాం. ఈమెయిల్‌తో ప్రయత్నించండి.","X లాగిన్ లింక్‌ను ధృవీకరించలేకపోయాం.",
  ],
  tr: [
    "Fırsatlarına, taslaklarına ve sonuçlarına devam et.","Hesabını oluştur ve sana uygun fırsatları keşfet.","Şifreni sıfırla","Sıfırlama bağlantısını e-posta adresine gönderelim.","Bağlantı gönder","Yeni şifre belirle","Hesabın için yeni bir şifre seç.","Şifreyi güncelle",
    "𝕏 ile giriş yap","Bu kurulumda 𝕏 girişi henüz etkin değil.","𝕏 girişi tamamlanamadı. Yeniden dene veya e-posta ile devam et.","E-posta","Şifre","Yeni şifre","En az 12 karakter.","Lütfen bekle…","Şifremi unuttum",
    "Sıfırlama bağlantısı geçersiz veya eksik. Yeni bir bağlantı iste.","Bu adres için bir hesap varsa sıfırlama bağlantısı gönderildi.","Şifren güncellendi. Giriş yapabilirsin.","İşlem tamamlanamadı. Yeniden dene.","Oturum kontrolü geçici olarak kullanılamıyor","Biraz sonra sayfayı yenileyip tekrar dene.","Hesap bağlantıları",
    "𝕏 doğrulanmış e-posta paylaşmadı. E-posta ile devam et veya izinleri kontrol et.","𝕏 profil bilgisi ya da gerekli izinler alınamadı. İzinleri kontrol et.","𝕏 ile devam edilemedi. E-posta ile giriş yapabilir veya yeniden deneyebilirsin.","𝕏 giriş bağlantısı doğrulanamadı.",
  ],
  ta: [
    "உங்கள் வாய்ப்புகள், வரைவுகள், முடிவுகளைத் தொடருங்கள்.","கணக்கு உருவாக்கி உங்களுக்கு ஏற்ற வாய்ப்புகளை அறியுங்கள்.","கடவுச்சொல்லை மீட்டமை","மீட்டமைப்பு இணைப்பை மின்னஞ்சலில் அனுப்புவோம்.","இணைப்பை அனுப்பு","புதிய கடவுச்சொல் அமை","கணக்கிற்குப் புதிய கடவுச்சொல்லைத் தேர்ந்தெடுங்கள்.","கடவுச்சொல்லைப் புதுப்பி",
    "X மூலம் தொடரவும்","இங்கே X உள்நுழைவு செயல்பாட்டில் இல்லை.","X உள்நுழைவு தோல்வி. மீண்டும் முயற்சிக்கவும் அல்லது மின்னஞ்சலைப் பயன்படுத்தவும்.","மின்னஞ்சல்","கடவுச்சொல்","புதிய கடவுச்சொல்","குறைந்தது 12 எழுத்துகள்.","காத்திருக்கவும்…","கடவுச்சொல் மறந்துவிட்டதா?",
    "மீட்டமைப்பு இணைப்பு செல்லாது அல்லது இல்லை. புதிய இணைப்பைக் கோரவும்.","இந்த மின்னஞ்சலில் கணக்கு இருந்தால் இணைப்பு அனுப்பப்பட்டது.","கடவுச்சொல் மாற்றப்பட்டது. உள்நுழையலாம்.","செயலை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.","உள்நுழைவு தற்காலிகமாகக் கிடைக்கவில்லை","சிறிது நேரத்தில் பக்கத்தைப் புதுப்பித்து முயற்சிக்கவும்.","கணக்கு இணைப்புகள்",
    "X சரிபார்க்கப்பட்ட மின்னஞ்சலை வழங்கவில்லை. மின்னஞ்சலைப் பயன்படுத்தவும்.","X சுயவிவரம் அல்லது தேவையான அனுமதிகள் கிடைக்கவில்லை. சரிபார்க்கவும்.","X மூலம் தொடர முடியவில்லை. மின்னஞ்சலைப் பயன்படுத்தவும்.","X உள்நுழைவு இணைப்பைச் சரிபார்க்க முடியவில்லை.",
  ],
  vi: [
    "Tiếp tục với cơ hội, bản nháp và kết quả của bạn.","Tạo tài khoản và khám phá cơ hội phù hợp.","Đặt lại mật khẩu","Chúng tôi sẽ gửi liên kết đặt lại qua email.","Gửi liên kết","Đặt mật khẩu mới","Chọn mật khẩu mới cho tài khoản.","Cập nhật mật khẩu",
    "Tiếp tục bằng X","Đăng nhập bằng X chưa được bật ở đây.","Đăng nhập X thất bại. Thử lại hoặc dùng email.","Email","Mật khẩu","Mật khẩu mới","Ít nhất 12 ký tự.","Vui lòng chờ…","Quên mật khẩu?",
    "Liên kết không hợp lệ hoặc bị thiếu. Hãy yêu cầu liên kết mới.","Nếu tài khoản tồn tại, liên kết đặt lại đã được gửi.","Đã cập nhật mật khẩu. Bạn có thể đăng nhập.","Không thể hoàn tất. Vui lòng thử lại.","Đăng nhập tạm thời không khả dụng","Tải lại trang và thử lại sau ít phút.","Liên kết tài khoản",
    "X không chia sẻ email đã xác minh. Dùng email hoặc kiểm tra quyền.","Không lấy được hồ sơ X hoặc quyền cần thiết. Hãy kiểm tra.","Không thể tiếp tục bằng X. Hãy dùng email.","Không thể xác minh liên kết đăng nhập X.",
  ],
  ko: [
    "기회, 초안, 결과를 이어서 살펴보세요.","계정을 만들고 나에게 맞는 기회를 찾아보세요.","비밀번호 재설정","재설정 링크를 이메일로 보내드립니다.","링크 보내기","새 비밀번호 설정","계정에 사용할 새 비밀번호를 선택하세요.","비밀번호 변경",
    "X로 계속하기","이 환경에서는 X 로그인이 비활성화되어 있습니다.","X 로그인에 실패했습니다. 다시 시도하거나 이메일을 사용하세요.","이메일","비밀번호","새 비밀번호","12자 이상 입력하세요.","잠시만 기다려 주세요…","비밀번호를 잊으셨나요?",
    "재설정 링크가 없거나 유효하지 않습니다. 새 링크를 요청하세요.","해당 이메일에 계정이 있으면 재설정 링크를 보냈습니다.","비밀번호를 변경했습니다. 로그인할 수 있습니다.","요청을 완료하지 못했습니다. 다시 시도하세요.","로그인을 일시적으로 사용할 수 없습니다","잠시 후 페이지를 새로고침해 주세요.","계정 링크",
    "X에서 인증된 이메일을 제공하지 않았습니다. 이메일을 사용하거나 권한을 확인하세요.","X 프로필이나 필요한 권한을 가져오지 못했습니다. 권한을 확인하세요.","X로 계속할 수 없습니다. 이메일을 사용하세요.","X 로그인 링크를 확인할 수 없습니다.",
  ],
};

export const authCopy: Record<Locale, AuthCopy> = Object.fromEntries(LOCALES.map(locale => {
  const values = rows[locale];
  if (!values || values.length !== authKeys.length || values.some(text => !text.trim())) {
    throw new Error("Incomplete auth translation: " + locale);
  }
  return [locale, Object.fromEntries(authKeys.map((key, index) => [key, values[index]]))];
})) as Record<Locale, AuthCopy>;
