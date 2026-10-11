# النشر — Railway + Vercel

```
 📱 الموبايل / 💻 اللابتوب
        │  https
        ▼
 ┌──────────────────────┐     REST + بث مباشر (SSE)     ┌──────────────────────────┐
 │  Vercel  (platform/) │ ─────────────────────────────▶ │ Railway: egic-platform    │
 │  الواجهة + موديلات   │                                │ node server/server.js     │
 │  المتصفح (WebGL/WASM)│ ── صور (اختياري: محرك السيرفر) ▶│ Railway: egic-ai (Python) │──▶ أحداث للـ platform
 └──────────────────────┘                                └──────────────────────────┘
```

- **egic-platform:** فيه الـ API والبث المباشر لكل الشاشات، وبيحفظ صور الأدلة وسجل الأحداث. وكمان بيعرض الواجهة نفسها، يعني ينفع تفتحها من Railway مباشرة من غير Vercel.
- **egic-ai:** محرك الـ Python بالموديلات التقيلة (PPE، والحريق، والتدخين بالموديلين مع بعض، والـ Pose، واللوحات). ده اختياري، لأن الواجهة بتشغّل الموديلات على الموبايل نفسه.

## 1) Railway: سيرفر المنصة

1. ارفع الريبو على GitHub.
2. من Railway اعمل **New Project ← Deploy from GitHub repo**.
3. في الـ Service افتح **Settings**:
   - **Root Directory** = `platform`، وهو هيقرا `platform/railway.json` و `platform/Dockerfile` لوحده.
   - **Networking ← Generate Domain**.
4. اختياري، عشان الأدلة تفضل محفوظة بعد كل deploy: اعمل **Volume** على المسار `/data`، وحط المتغير `DATA_DIR=/data`.
5. اختياري: `CORS_ORIGIN=https://<your-app>.vercel.app`، عشان مفيش موقع تاني يقدر يكلّم الـ API.

اختبره: افتح `https://<platform>.up.railway.app/api/v1/health`، المفروض يرجّع `{"engine":"ONLINE"}`.

## 2) Railway: محرك الذكاء (اختياري)

1. في نفس المشروع اعمل **New Service ← GitHub repo**، واختار نفس الريبو.
   - **Root Directory** = `/`، وهيستخدم `railway.json` و `Dockerfile` اللي في الروت.
2. المتغيرات:
   - `EGIC_PLATFORM_URL=https://<platform>.up.railway.app`، عشان أحداث السيرفر توصل للوحة القيادة.
   - `CORS_ORIGINS=*`، أو دومين Vercel.
3. **Generate Domain**.
4. محتاج رام 2GB على الأقل، لأن torch على CPU مع 7 موديلات بياخدوا حوالي 1.5GB. أول build بياخد حوالي 6 دقايق.

اختبره: افتح `https://<ai>.up.railway.app/health`، المفروض كل الموديلات تبقى `true`. وفيه توثيق تفاعلي على `/docs`.

## 3) Vercel: الواجهة

1. **Add New ← Project**، واختار نفس الريبو.
2. **Root Directory** = `platform`. الـ Framework = **Other**. الـ build بيتظبط لوحده من `vercel.json`.
3. **Environment Variables:**
   - `EGIC_API_BASE` = `https://<platform>.up.railway.app`
   - `EGIC_AI_URL` = `https://<ai>.up.railway.app`، ودي اختيارية.
4. Deploy، وبعدها افتح `https://<app>.vercel.app/console.html` من الموبايل.

## 4) التجربة من الموبايل

1. افتح `https://<app>.vercel.app/console.html#/live`. لازم HTTPS عشان الموبايل يسمح بالكاميرا، و Vercel بيوفّره لوحده.
2. اختار **الحريق والدخان** أو **كشف التدخين** أو **الوضع الشامل**، وبعدها **تشغيل الكاميرا**، واسمح للكاميرا.
3. افتح لوحة القيادة على اللابتوب في نفس الوقت. أول ما الموبايل يكشف حريق أو تدخين، الإنذار والصفارة هيشتغلوا على **الشاشتين**.
   - المتصفح مش بيسمح بالصوت إلا بعد ما تضغط في الصفحة مرة، فاضغط في أي حتة على لوحة القيادة الأول.
4. **محرك الذكاء** ليه اختيارين:
   - **داخل الجهاز:** أسرع، ومفيش صور بتطلع برّه الموبايل.
   - **خادم EGIC AI:** بيستخدم الموديلات الأتقل والأدق، زي التدخين بالموديلين مع بعض.

## 📱 كاميرا الموبايل (QR)

الكاميرا اللي بيشتغل عليها النظام ممكن تبقى كاميرا الموبايل بدل كاميرا الكمبيوتر:

1. في **المختبر الحي** أو **قارئ اللوحات**، دوس على زرار **«📱 كاميرا الموبايل»**، هيظهرلك QR code.
2. اعمل سكان للكود بالموبايل، وبعدين دوس «تشغيل الكاميرا». الموبايل هيستخدم الكاميرا الخلفية.
3. الكمبيوتر هيتحوّل لوحده لكاميرا الموبايل، والموديلات تشتغل عليها: الحريق والتدخين والـ PPE والسلوك واللوحات.
4. أي كشف أو إنذار هيظهر **على شاشة الموبايل كمان**، ومعاه اهتزاز.

**إزاي بيشتغل:**
- **الطريقة الأساسية هي WebRTC:** الفيديو بيروح مباشرة من الموبايل لشاشة المنصة، 30 فريم في الثانية وتأخير أقل من ربع ثانية. السيرفر دوره إنه يوصّل الطرفين ببعض في الأول بس: `POST/GET /api/v1/cam/<session>/offer|answer`.
- **الطريقة البديلة تلقائية:** لو الشبكة منعت الاتصال المباشر، الموبايل يبعت صور JPEG على `POST /api/v1/cam/<session>/frame`، والمنصة تعرضها كبث MJPEG.

**TURN، عشان الفيديو المباشر يشتغل من أي شبكة:** بعض شبكات الموبايل بتمنع الاتصال المباشر، فبيرجع للطريقة البديلة اللي أبطأ. عشان تضمن الفيديو المباشر دايمًا، ضيف TURN server (مثلًا من metered.ca أو Cloudflare Calls) في المتغير ده:
```
EGIC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:<host>:3478","username":"<user>","credential":"<pass>"}]
```
- **على Railway:** حطه في خدمة المنصة، وسيرفر المنصة بيطلّع `config.js` منه. وفي نفس الخدمة تقدر تحط `EGIC_AI_URL` كمان.
- **على Vercel:** حطه في Environment Variables.

**HTTPS:** الموبايل مش بيسمح بالكاميرا من غير HTTPS.
- على Railway و Vercel: HTTPS موجود لوحده.
- محليًا: شغّل `bash platform/scripts/make-local-cert.sh` مرة واحدة، وبعدين أعد تشغيل السيرفر. هيشتغل كمان على `https://<IP الجهاز>:8443`، والموبايل لازم يكون على نفس الواي فاي. أول مرة هيظهر تحذير أمان، دوس «خيارات متقدمة» وبعدين «متابعة».
- لو Windows Firewall سألك، اسمح لـ Node.js على الشبكة الخاصة.

## تشغيل محلي

```bash
# الواجهة + API
cd platform && HOST=0.0.0.0 node server/server.js          # http://localhost:8080/console.html
# محرك الذكاء
python -m venv .venv && .venv/Scripts/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu && .venv/Scripts/pip install -r requirements.txt
EGIC_PLATFORM_URL=http://localhost:8080 .venv/Scripts/python -m uvicorn app.main:app --port 8765
# أو الاتنين بدوكر
docker compose up --build
```

> الموبايل على نفس الشبكة مش هيفتح الكاميرا على `http://192.168.x.x`، لأنه محتاج HTTPS. استخدم Vercel، أو اعمل نفق: `cloudflared tunnel --url http://localhost:8080`.
