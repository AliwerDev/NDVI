import type { Metadata } from "next";
import Link from "next/link";

import {
  ArrowRightIcon,
  CheckIcon,
  GlobeIcon,
  InfoIcon,
  LeafIcon,
  PinIcon,
  WarningIcon,
  WiltedLeafIcon,
} from "@/components/icons";
import LogoMark from "@/components/Logo";

import "./home.css";

export const metadata: Metadata = {
  title: "NDVI nima? — NDVI monitoring",
  description: "NDVI nima, ranglar nimani bildiradi va dalangizni sunʼiy yoʻldosh orqali qanday kuzatish mumkin.",
};

const RAMP =
  "linear-gradient(to right, rgb(165,0,38) 0%, rgb(215,48,39) 18.18%, rgb(254,224,139) 36.36%, rgb(166,217,106) 54.55%, rgb(26,152,80) 72.73%, rgb(0,104,55) 100%)";

// Sample NDVI pixels for the hero picture: greener in the middle, weaker in the lower left corner.
const SAMPLE_PIXELS = [
  ["#a6d96a", "#1a9850", "#138a4a", "#138a4a", "#1a9850", "#0b7a41", "#138a4a", "#1a9850", "#60b865"],
  ["#d2dc7b", "#60b865", "#1a9850", "#0b7a41", "#138a4a", "#006837", "#0b7a41", "#138a4a", "#1a9850"],
  ["#fee08b", "#d2dc7b", "#60b865", "#1a9850", "#60b865", "#1a9850", "#138a4a", "#1a9850", "#a6d96a"],
  ["#ea8865", "#fee08b", "#a6d96a", "#60b865", "#1a9850", "#60b865", "#1a9850", "#60b865", "#d2dc7b"],
  ["#d73027", "#ea8865", "#fee08b", "#a6d96a", "#60b865", "#a6d96a", "#60b865", "#a6d96a", "#fee08b"],
];

const LEAVES = [
  { title: "Sogʻlom barg", red: 8, nir: 50, ndvi: "0.72", tone: "healthy", Icon: LeafIcon },
  { title: "Zaif yoki qurigan barg", red: 20, nir: 30, ndvi: "0.20", tone: "weak", Icon: WiltedLeafIcon },
] as const;

const CLASSES = [
  { range: "0 dan past", title: "Suv, bulut, qor", text: "Oʻsimlik yoʻq.", color: "rgb(165,0,38)" },
  { range: "0 – 0.2", title: "Ochiq tuproq", text: "Shudgorlangan yoki endi ekilgan dala, qum, yoʻl.", color: "rgb(215,48,39)" },
  { range: "0.2 – 0.4", title: "Siyrak yoki zaif", text: "Unib chiqish davri yoki stress belgisi.", color: "rgb(254,224,139)" },
  { range: "0.4 – 0.6", title: "Oʻsayotgan ekin", text: "Oʻrtacha zichlik, normal rivojlanish.", color: "rgb(166,217,106)" },
  { range: "0.6 dan yuqori", title: "Zich, sogʻlom ekin", text: "Yerni toʻliq qoplagan, faol oʻsayotgan oʻsimlik.", color: "rgb(26,152,80)" },
];

// The numbers come from the backend settings: SCHEDULER_HOUR, MIN_CLEAR_FRACTION, NDVI_DROP_THRESHOLD.
const STEPS = [
  { title: "Dalangizni chizing", text: "Xaritada dala burchaklarini bosing va nom bering. Kamida 3 ta nuqta kerak." },
  {
    title: "Sunʼiy yoʻldosh suratga oladi",
    text: "Sentinel-2 sunʼiy yoʻldoshlari Oʻzbekistonni har 2–5 kunda suratga oladi. Har bir piksel 10 × 10 m: 1 gektarda 100 ta piksel.",
  },
  {
    title: "Biz NDVI hisoblaymiz",
    text: "Har kuni soat 07:00 da yangi surat tekshiriladi. Bulutli suratlar tashlanadi: dalaning kamida 80% qismi ochiq koʻrinishi kerak.",
  },
  {
    title: "Telegram xabar beradi",
    text: "Oʻrtacha NDVI oldingi kuzatuvdan 0.15 yoki koʻproq tushsa, bot ogohlantiradi. Ulash uchun «Telegramda ulash» tugmasini bosing.",
  },
];

const RISKS = [
  "Suv yetishmasligi yoki sugʻorish uzilishi",
  "Zararkunandalar",
  "Kasallik",
  "Oʻgʻit, ayniqsa azot yetishmasligi",
  "Doʻl, kuchli shamol yoki suv bosishi",
];

const NATURAL = [
  "Hosil yigʻib olindi yoki beda oʻrildi",
  "Ekin pishib, barglari sargʻaydi",
  "Defoliatsiya: gʻoʻza barglari ataylab toʻkildi",
  "Yupqa bulut yoki tuman suratga taʼsir qildi",
];

const FAQ = [
  {
    q: "Bulutli kunlarda nima boʻladi?",
    a: "Sunʼiy yoʻldosh bulut ostini koʻrmaydi. Bunday suratlar tashlanadi va keyingi ochiq kun kutiladi. Bulutli mavsumda kuzatuvlar orasidagi tanaffus uzoqroq boʻladi.",
  },
  {
    q: "Maʼlumotlar qayerdan olinadi?",
    a: "Copernicus dasturining Sentinel-2 suratlaridan. Ularni Yevropa Kosmik Agentligi (ESA) ochiq va bepul tarqatadi. Biz ularni Microsoft Planetary Computer orqali olamiz.",
  },
  {
    q: "Kichik dalani ham koʻradimi?",
    a: "Ha. Lekin piksel 10 m boʻlgani uchun 0.5 gektardan kichik dalalarda chegaradagi piksellar (yoʻl, ariq, daraxt) natijaga koʻproq taʼsir qiladi.",
  },
  {
    q: "Bahorda NDVI past chiqyapti. Bu yomonmi?",
    a: "Yoʻq. Unib chiqish davrida tuproq koʻp koʻrinadi, shuning uchun NDVI past boʻladi. Ekin oʻsgani sari u koʻtariladi.",
  },
  {
    q: "NDVI dalaga borishni almashtiradimi?",
    a: "Yoʻq. NDVI qayerga va qachon qarash kerakligini koʻrsatadi. Sababini joyida tekshirish kerak.",
  },
];

function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="home-section-head">
      <span className="home-eyebrow">{eyebrow}</span>
      <h2 id={id} className="home-h2">
        {title}
      </h2>
      {lead && <p className="home-lead">{lead}</p>}
    </div>
  );
}

function OpenMapLink({ className }: { className: string }) {
  return (
    <Link href="/monitoring" className={className}>
      Xaritani ochish
      <ArrowRightIcon size={18} />
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="home">
      <header className="home-header">
        <nav className="home-nav home-container" aria-label="Asosiy menyu">
          <a href="#top" className="home-logo">
            <LogoMark size={40} className="home-logo-mark" />
            <span>NDVI monitoring</span>
          </a>
          <div className="home-nav-links">
            <a href="#nima">NDVI nima?</a>
            <a href="#ranglar">Ranglar</a>
            <a href="#qanday">Qanday ishlaydi</a>
            <a href="#savollar">Savollar</a>
            <Link href="/login">Kirish</Link>
            <OpenMapLink className="home-btn home-btn-primary home-btn-sm" />
          </div>
        </nav>
      </header>

      <main>
        <section id="top" className="home-hero home-container">
          <div className="home-hero-text">
            <span className="home-pill">
              <GlobeIcon size={14} />
              Sunʼiy yoʻldosh orqali dala nazorati
            </span>
            <h1 className="home-h1">Dalangiz sogʻligʻini kosmosdan kuzating</h1>
            <p className="home-hero-lead">
              NDVI oʻsimlik qanchalik yashil va baquvvat ekanini bitta raqam bilan koʻrsatadi. Biz uni har bir dalangiz
              uchun Sentinel-2 sunʼiy yoʻldosh suratlaridan hisoblaymiz. Raqam keskin tushsa, Telegram orqali darhol xabar
              beramiz.
            </p>
            <div className="home-actions">
              <OpenMapLink className="home-btn home-btn-primary home-btn-lg" />
              <a href="#nima" className="home-btn home-btn-outline home-btn-lg">
                NDVI nima?
              </a>
            </div>
            <dl className="home-facts">
              <div>
                <dt>Har bir piksel</dt>
                <dd>10 × 10 m</dd>
              </div>
              <div>
                <dt>Yangi surat</dt>
                <dd>har 2–5 kunda</dd>
              </div>
              <div>
                <dt>Tekshiruv</dt>
                <dd>har kuni 07:00</dd>
              </div>
            </dl>
          </div>

          <figure className="home-hero-figure">
            <div className="home-hero-image">
              <svg viewBox="0 0 500 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <rect width="500" height="400" fill="#7d7354" />
                <g transform="rotate(-8 250 200)">
                  <rect x="-60" y="-40" width="230" height="170" fill="#6a7440" />
                  <rect x="180" y="-40" width="400" height="90" fill="#857a5c" />
                  <rect x="-60" y="300" width="620" height="160" fill="#5b6b34" />
                  <rect x="400" y="60" width="200" height="230" fill="#8c7a58" />
                  <g shapeRendering="crispEdges">
                    {SAMPLE_PIXELS.map((row, r) =>
                      row.map((color, c) => (
                        <rect key={`${r}-${c}`} x={70 + c * 33} y={140 + r * 30} width="33" height="30" fill={color} />
                      )),
                    )}
                  </g>
                  <rect x="70" y="140" width="297" height="150" fill="none" stroke="#ffffff" strokeWidth="7" />
                  <rect x="70" y="140" width="297" height="150" fill="none" stroke="#2563eb" strokeWidth="3.5" />
                </g>
              </svg>
              <span className="home-sample">Namuna</span>
            </div>
            <figcaption className="home-hero-card">
              <div className="home-hero-card-head">
                <span>Paxta-1</span>
                <span>05.11.2026</span>
              </div>
              <div className="home-hero-card-value">
                <span className="home-ndvi home-ndvi-healthy">0.62</span>
                <span>Sogʻlom ekin</span>
              </div>
              <svg viewBox="0 0 228 40" role="img" aria-label="Mavsum davomida NDVI oʻsishi, namuna">
                <polyline
                  points="0,34 19,32 38,28 57,23 76,17 95,12 114,8 133,6 152,7 171,9 190,11 209,12 228,12"
                  fill="none"
                  stroke="#2e6b3d"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="228" cy="12" r="4" fill="#1a9850" stroke="#141413" strokeWidth="1.5" />
              </svg>
            </figcaption>
          </figure>
        </section>

        <section className="home-band" aria-labelledby="nima">
          <div className="home-container home-section">
            <div className="home-section-head">
              <span className="home-eyebrow">01 · ASOSIY TUSHUNCHA</span>
              <h2 id="nima" className="home-h2">
                NDVI nima?
              </h2>
              <p className="home-lead">
                <strong>NDVI</strong> (Normalized Difference Vegetation Index — normallashtirilgan vegetatsiya indeksi) —
                oʻsimlikning «yashillik darajasi». Bu −1 dan +1 gacha boʻlgan raqam. Qancha katta boʻlsa, ekin shuncha zich
                va sogʻlom.
              </p>
              <p className="home-text">
                Sir barg ichida. Sogʻlom bargdagi xlorofill quyoshning <strong className="home-red">qizil nurini</strong>{" "}
                fotosintez uchun yutib oladi. Bargning ichki tuzilishi esa koʻzimiz koʻrmaydigan{" "}
                <strong className="home-green">yaqin infraqizil (NIR) nurni</strong> oynadek qaytaradi. Oʻsimlik
                suvsizlansa, kasallansa yoki siyraklashsa, qizil nurni kamroq yutadi va NIR ni kamroq qaytaradi.
              </p>
            </div>

            <div className="home-row">
              {LEAVES.map(({ title, red, nir, ndvi, tone, Icon }) => (
                <article key={title} className="home-card home-leaf">
                  <div className="home-leaf-head">
                    <span className={`home-leaf-icon home-leaf-${tone}`} aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <h3>{title}</h3>
                  </div>
                  <div className="home-bar">
                    <div>
                      <span>Qizil nur qaytadi</span>
                      <strong>{red}%</strong>
                    </div>
                    <span className="home-bar-track" aria-hidden="true">
                      <span className="home-bar-red" style={{ width: `${red}%` }} />
                    </span>
                  </div>
                  <div className="home-bar">
                    <div>
                      <span>NIR qaytadi</span>
                      <strong>{nir}%</strong>
                    </div>
                    <span className="home-bar-track" aria-hidden="true">
                      <span className="home-bar-nir" style={{ width: `${nir}%` }} />
                    </span>
                  </div>
                  <div className="home-leaf-result">
                    <span>NDVI</span>
                    <span className={`home-ndvi home-ndvi-${tone}`}>≈ {ndvi}</span>
                  </div>
                </article>
              ))}

              <article className="home-card home-formula">
                <h3>Formula</h3>
                <p className="home-mono">NDVI = (NIR − Qizil) ÷ (NIR + Qizil)</p>
                <p className="home-mono home-formula-example">(0.50 − 0.08) ÷ (0.50 + 0.08) = 0.72</p>
                <p className="home-formula-note">
                  Shifokor isitmani termometr bilan oʻlchaganidek, NDVI dalaning holatini bitta raqam bilan oʻlchaydi. U
                  kasallik nomini aytmaydi, lekin «nimadir oʻzgardi» degan signalni beradi.
                </p>
              </article>
            </div>
            <p className="home-footnote">Foizlar tushuntirish uchun misol.</p>
          </div>
        </section>

        <section className="home-container home-section" aria-labelledby="ranglar">
          <SectionHead
            id="ranglar"
            eyebrow="02 · XARITANI OʻQISH"
            title="Ranglar nimani bildiradi"
            lead="Xaritada dalangiz piksellarga boʻlinib, har biri oʻz NDVI rangida koʻrinadi. Qizil — oʻsimlik kam, yashil — oʻsimlik zich."
          />
          <div>
            <div className="home-ramp" aria-hidden="true" style={{ background: RAMP }} />
            <div className="home-ramp-labels" aria-hidden="true">
              <span>−0.2</span>
              <span>0</span>
              <span>0.2</span>
              <span>0.4</span>
              <span>0.6</span>
              <span>0.9</span>
            </div>
          </div>
          <ul className="home-row home-classes">
            {CLASSES.map(({ range, title, text, color }) => (
              <li key={range} className="home-card home-class">
                <span className="home-class-swatch" aria-hidden="true" style={{ background: color }} />
                <span className="home-class-range">{range}</span>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <p className="home-note">
            <InfoIcon size={20} />
            <span>
              Chegaralar taxminiy. Gʻoʻza, bugʻdoy va bedaning meʼyori har xil, mavsum bosqichiga qarab ham oʻzgaradi. Eng
              muhimi bitta raqam emas, <strong>vaqt boʻyicha oʻzgarish</strong>.
            </span>
          </p>
        </section>

        <section className="home-band" aria-labelledby="qanday">
          <div className="home-container home-section">
            <SectionHead id="qanday" eyebrow="03 · XIZMAT" title="Qanday ishlaydi" />
            <ol className="home-row home-steps">
              {STEPS.map(({ title, text }, index) => (
                <li key={title} className="home-card home-step">
                  <span className="home-step-number">{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-container home-section" aria-labelledby="tushsa">
          <SectionHead
            id="tushsa"
            eyebrow="04 · AMALDA"
            title="NDVI tushdi. Nima qilish kerak?"
            lead="Har bir tushish xavf emas. Avval sababini aniqlang."
          />
          <div className="home-row">
            <div className="home-card home-causes home-causes-risk">
              <h3>
                <WarningIcon size={20} />
                Tekshirish kerak
              </h3>
              <ul>
                {RISKS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="home-card home-causes">
              <h3>
                <CheckIcon size={20} />
                Tabiiy sabablar
              </h3>
              <ul>
                {NATURAL.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="home-note home-note-green">
            <PinIcon size={20} />
            <span>Xabar kelsa, xaritada dalaning qaysi qismi qizargan ekanini koʻring va oʻsha joyni birinchi tekshiring.</span>
          </p>
        </section>

        <section className="home-band home-band-last" aria-labelledby="savollar">
          <div className="home-container home-container-narrow home-section">
            <SectionHead id="savollar" eyebrow="05 · SAVOLLAR" title="Koʻp soʻraladigan savollar" />
            <div className="home-faq">
              {FAQ.map(({ q, a }, index) => (
                <details key={q} open={index === 0}>
                  <summary>
                    {q}
                    <span className="home-faq-plus" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="home-cta-wrap" aria-labelledby="cta-title">
          <div className="home-container home-cta">
            <div>
              <h2 id="cta-title">Birinchi dalangizni qoʻshing</h2>
              <p>Xaritada dalani chizing. Qolganini sunʼiy yoʻldosh va biz bajaramiz.</p>
            </div>
            <OpenMapLink className="home-btn home-btn-light home-btn-lg" />
          </div>
        </section>
      </main>

      <footer className="home-container home-footer">
        <span>NDVI monitoring</span>
        <span>Maʼlumotlar: Copernicus Sentinel-2 (ESA), Microsoft Planetary Computer orqali</span>
      </footer>
    </div>
  );
}
