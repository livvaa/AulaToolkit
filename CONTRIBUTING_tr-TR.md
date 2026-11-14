## AULA Toolkit katkı rehberine hoş geldin!

### Bu katkı rehberinin diğer dillerdeki sürümleri:
* [English contributing guide](CONTRIBUTING.md)

Bu projeye katkıda bulunmak için zaman ayırdığın için teşekkürler! AULA Toolkit boş zamanlarda geliştiriliyor; katkının sorunsuz ilerlemesi için birkaç kural var.

<br/>

_Bu kurallara uymayan konular ayrıca haber verilmeden kapatılabilir._

<br/>

**1. Sorun bildirmeden önce README'yi oku**

[README](README_tr-TR.md) en sık sorulan soruları [SSS](README_tr-TR.md#sss) bölümünde yanıtlar ve Bluetooth üzerinden ayar yapılamaması gibi bilinen sınırlamaları listeler. Konu açmadan önce bir göz at.

**2. Daha önce bildirilen sorunlara bak**

Önceden açılmış [konuları](https://github.com/livvaa/AulaToolkit/issues?q=is%3Aissue) incele. Aynı konuyu tekrar açma. Konu kapatılmış olsa bile altına yorum yazabilirsin. Bilinen sorunları [Discord sunucumuzda](https://discord.gg/u9FbaJGtCe) da konuşabilirsin.

**3. İngilizce veya Türkçe yaz**

Böylece herkes konuşmayı takip edebilir.

**4. Projenin kapsamına saygı göster**

AULA Toolkit, AULA klavye ve fareleri için resmi AULA yazılımının yerini almayı, hepsi için tek bir uygulama olmayı hedefler. Başka markaların cihazları veya AULA cihazlarıyla ilgisi olmayan özellikler kapsam dışıdır.

**5. Konu açmadan önce sorununu doğrula**

Sorunun gerçekten AULA Toolkit'te olduğundan emin ol. Önce resmi AULA yazılımını kapat: iki programın aynı cihazla aynı anda konuşması hata gibi görünen sorunlara yol açar. Başka bir USB girişi veya kablo dene, sorunun resmi yazılımda da olup olmadığına bak.

**6. Sorununu olabildiğince iyi anlat**

AULA Toolkit sürümünü (**Ayarlar → Hakkında**), Windows sürümünü, cihazı ve nasıl bağlandığını (USB veya 2.4 GHz alıcı), ne yaptığını, ne beklediğini ve bunun yerine ne olduğunu yaz. **Her zaman bir tanılama paketi ekle** (**Ayarlar → Hakkında → Tanılama paketi kaydet**); [Günlükler nasıl toplanır?](README_tr-TR.md#günlükler-nasıl-toplanır) bölümüne bak.

**7. Konulara iyi bir başlık ver**

"S75 Pro: 2.4 GHz'de uykudan sonra parlaklık sıfırlanıyor" iyi bir başlıktır. "Çalışmıyor" değildir.

**8. Konunun dışına çıkma**

Gereksiz yorum veya spam bırakma. "+1" yorumu yerine 👍 tepkisini kullan.

**9. Her konuya tek sorun**

Tek bir konuda birden fazla sorun bildirme veya birden fazla özellik isteme. Her sorun veya fikir için ayrı konu aç; böylece takip etmek ve kapatmak kolaylaşır.

**10. Yeni bir cihaz için destek istemek**

AULA cihazlarının çoğu AULA Toolkit'in zaten desteklediği bir protokolü kullanır; yeni modeller için çoğunlukla test eden birine ihtiyaç vardır. İsteğine şunları ekle:
* modelin tam adı (örneğin *AULA F87 Pro*) ve ürün sayfasının bağlantısı,
* **Aygıt Yöneticisi → cihazın → Özellikler → Ayrıntılar → Donanım Kimlikleri** bölümündeki USB kimlikleri (örneğin `VID_0C45&PID_800A`), hem kablo hem de 2.4 GHz alıcı için,
* cihazın resmi AULA sürücüsünün adı ve sürümü,
* cihaz bağlıyken alınmış bir tanılama paketi,
* test sürümlerini denemeye istekli olup olmadığın.

**11. Çeviriler**

Her dil [`src/shared/locales`](src/shared/locales) klasöründe tek bir dosyadır; kaynak dosya [`en.ts`](src/shared/locales/en.ts)'dir. Çevirilerin hepsi henüz anadili konuşanlar tarafından gözden geçirilmedi; bu yüzden düzeltmelere çok açığız. `{name}` gibi yer tutucuları ve mevcut metinlerin üslubunu koru. Git kullanmakta rahat değilsen düzeltmelerini bir konu olarak aç.

**12. Pull request'ler**

Pull request'ler memnuniyetle karşılanır. Değişiklik küçük ve açık değilse önce bir konu aç ve çözdüğün sorunu anlat: projeye uymadığı için reddedilecek bir fikir üzerinde zaman harcamanın anlamı yok. Büyük değişiklikleri önce [Discord sunucumuzda](https://discord.gg/u9FbaJGtCe) konuşmanı öneririz. Projenin kod stiline ve mimarisine uy, her pull request'i tek bir konuyla sınırla ve hangi cihazları ve bağlantıları gerçek donanımda denediğini yaz. Bir cihaza asla yazılım (firmware) güncelleme veya bootloader komutu gönderme ve protokol komutlarını tahmin etme: salt okunur denemelerle başla.

<br/>

### Kaynaktan derleme

Windows 10 veya 11, [Node.js](https://nodejs.org/) 22 LTS ve [Git](https://git-scm.com/) gerekir.

```bash
git clone https://github.com/livvaa/AulaToolkit.git
cd AulaToolkit
npm install
npm run dev
```

Elinde cihaz yok mu? Sanal cihazlarla başlat: `$env:AULA_SIM = "s75pro,sc900,f75"; npm run dev` (PowerShell).

Pull request açmadan önce `npm run typecheck` ve `npm test` çalıştır. `npm run dist`, kurulum dosyasını ve taşınabilir exe'yi `release/` klasörüne derler.

Katkıda bulunarak katkılarının [GNU Genel Kamu Lisansı v3.0 veya sonrası](LICENSE) altında lisanslanmasını kabul etmiş olursun.

<br/>

AULA Toolkit'i daha iyi hale getirmeye yardım ettiğin için bir kez daha teşekkürler!
