import type { Locale } from './config';
export type PreviewActions = {approve:string;approved:string;edited:string;draft:string;restore:string;copy:string;copied:string;approveAll:string;copyFailed:string};
const labels:Record<Locale,readonly [string,string,string,string,string,string,string,string,string]>={
 en:['Approve draft','Approved','Edited','Draft','Restore original','Copy text','Copied','Approve all','Copy failed. Select and copy the text.'],
 tr:['Taslağı onayla','Onaylandı','Düzenlendi','Taslak','İlk metne dön','Metni kopyala','Kopyalandı','Tümünü onayla','Kopyalanamadı. Metni seçip kopyalayabilirsin.'],
 'zh-CN':['批准草稿','已批准','已编辑','草稿','恢复原文','复制文本','已复制','全部批准','复制失败。请选中文本后复制。'],
 hi:['मसौदा मंज़ूर करें','मंज़ूर','संपादित','मसौदा','मूल पाठ बहाल करें','पाठ कॉपी करें','कॉपी हो गया','सभी मंज़ूर करें','कॉपी नहीं हुआ। पाठ चुनकर कॉपी करें।'],
 es:['Aprobar borrador','Aprobado','Editado','Borrador','Restaurar original','Copiar texto','Copiado','Aprobar todos','No se pudo copiar. Selecciona y copia el texto.'],
 fr:['Approuver le brouillon','Approuvé','Modifié','Brouillon','Rétablir l’original','Copier le texte','Copié','Tout approuver','Échec de la copie. Sélectionnez et copiez le texte.'],
 ar:['اعتماد المسودة','معتمدة','معدّلة','مسودة','استعادة الأصل','نسخ النص','تم النسخ','اعتماد الكل','تعذر النسخ. حدد النص وانسخه.'],
 bn:['খসড়া অনুমোদন করুন','অনুমোদিত','সম্পাদিত','খসড়া','মূল লেখা ফিরিয়ে আনুন','লেখা কপি করুন','কপি হয়েছে','সব অনুমোদন করুন','কপি হয়নি। লেখা নির্বাচন করে কপি করুন।'],
 'pt-BR':['Aprovar rascunho','Aprovado','Editado','Rascunho','Restaurar original','Copiar texto','Copiado','Aprovar todos','Não foi possível copiar. Selecione e copie o texto.'],
 ru:['Одобрить черновик','Одобрено','Изменено','Черновик','Вернуть оригинал','Копировать текст','Скопировано','Одобрить все','Не удалось скопировать. Выделите и скопируйте текст.'],
 id:['Setujui draf','Disetujui','Diedit','Draf','Pulihkan teks awal','Salin teks','Disalin','Setujui semua','Gagal menyalin. Pilih dan salin teks.'],
 ur:['مسودہ منظور کریں','منظور شدہ','ترمیم شدہ','مسودہ','اصل متن بحال کریں','متن کاپی کریں','کاپی ہو گیا','سب منظور کریں','کاپی نہیں ہوا۔ متن منتخب کر کے کاپی کریں۔'],
 de:['Entwurf freigeben','Freigegeben','Bearbeitet','Entwurf','Original wiederherstellen','Text kopieren','Kopiert','Alle freigeben','Kopieren fehlgeschlagen. Text auswählen und kopieren.'],
 ja:['下書きを承認','承認済み','編集済み','下書き','元の文章に戻す','文章をコピー','コピーしました','すべて承認','コピーできませんでした。文章を選択してコピーしてください。'],
 sw:['Idhinisha rasimu','Imeidhinishwa','Imehaririwa','Rasimu','Rejesha maandishi ya awali','Nakili maandishi','Imenakiliwa','Idhinisha zote','Imeshindwa kunakili. Chagua maandishi na unakili.'],
 mr:['मसुदा मंजूर करा','मंजूर','संपादित','मसुदा','मूळ मजकूर परत आणा','मजकूर कॉपी करा','कॉपी झाला','सर्व मंजूर करा','कॉपी झाला नाही. मजकूर निवडून कॉपी करा.'],
 te:['ముసాయిదాను ఆమోదించు','ఆమోదించబడింది','సవరించబడింది','ముసాయిదా','మూల వచనాన్ని పునరుద్ధరించు','వచనాన్ని కాపీ చేయి','కాపీ అయింది','అన్నింటినీ ఆమోదించు','కాపీ కాలేదు. వచనాన్ని ఎంచుకుని కాపీ చేయండి.'],
 ta:['வரைவை ஒப்புதல் செய்','ஒப்புதல் அளிக்கப்பட்டது','திருத்தப்பட்டது','வரைவு','அசல் உரையை மீட்டமை','உரையை நகலெடு','நகலெடுக்கப்பட்டது','அனைத்தையும் ஒப்புதல் செய்','நகலெடுக்க முடியவில்லை. உரையைத் தேர்ந்தெடுத்து நகலெடுக்கவும்.'],
 vi:['Duyệt bản nháp','Đã duyệt','Đã sửa','Bản nháp','Khôi phục bản gốc','Sao chép văn bản','Đã sao chép','Duyệt tất cả','Không thể sao chép. Hãy chọn và sao chép văn bản.'],
 ko:['초안 승인','승인됨','수정됨','초안','원문 복원','텍스트 복사','복사됨','모두 승인','복사하지 못했습니다. 텍스트를 선택해 복사하세요.'],
};
export const previewActions = Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,{approve:v[0],approved:v[1],edited:v[2],draft:v[3],restore:v[4],copy:v[5],copied:v[6],approveAll:v[7],copyFailed:v[8]}])) as Record<Locale,PreviewActions>;
