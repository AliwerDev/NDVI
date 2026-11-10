import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  ArrowRightIcon,
  CheckIcon,
  DropletIcon,
  GlobeIcon,
  HistoryIcon,
  ImageIcon,
  InfoIcon,
  LayersIcon,
  LeafIcon,
  PinIcon,
  SearchIcon,
  SendIcon,
  WarningIcon,
  WiltedLeafIcon,
} from "@/components/icons";
import LogoMark from "@/components/Logo";
import MapAccessLink from "@/components/MapAccessLink";
import { formatIndex, type IndexName, indexColor, indexTextColor, INDICES, rampGradient, rampPercent } from "@/lib/ndvi";

import "./home.css";

export const metadata: Metadata = {
  title: "NDVI monitoring — dalangizni kosmosdan kuzating",
  description:
    "Sentinel-2 sunʼiy yoʻldosh suratlaridan NDVI, NDMI va NDRE: oʻsimlik holati, suv stressi va azot. Muammo boshlansa, Telegram orqali xabar.",
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

// The same field as an NDVI picture for the "Rangli rasm" card: a weak corner at the lower left.
const MINI_PIXELS = [
  ["#1a9850", "#138a4a", "#0b7a41", "#1a9850", "#138a4a", "#1a9850", "#60b865", "#a6d96a"],
  ["#138a4a", "#006837", "#0b7a41", "#138a4a", "#1a9850", "#60b865", "#a6d96a", "#d2dc7b"],
  ["#d73027", "#ea8865", "#fee08b", "#60b865", "#1a9850", "#1a9850", "#60b865", "#a6d96a"],
  ["#d73027", "#d73027", "#fee08b", "#a6d96a", "#60b865", "#138a4a", "#1a9850", "#60b865"],
];

const HERO_VALUES: { index: IndexName; value: number; status: string }[] = [
  { index: "ndvi", value: 0.62, status: "Sogʻlom ekin" },
  { index: "ndmi", value: 0.18, status: "Namlik yetarli" },
  { index: "ndre", value: 0.31, status: "Azot yetarli" },
];

// Mean NDVI of a sample cotton field from April to October.
const SEASON = [0.18, 0.24, 0.33, 0.45, 0.58, 0.68, 0.74, 0.76, 0.71, 0.66, 0.62, 0.55, 0.47, 0.4];

const INDEX_QUESTIONS: { index: IndexName; question: string; text: string; pixel: string }[] = [
  { index: "ndvi", question: "Ekin sogʻlommi?", text: "Oʻsimlik zichligi va sogʻligʻi.", pixel: "Piksel 10 × 10 m" },
  { index: "ndmi", question: "Suv yetarlimi?", text: "Barg namligi. 0 dan past — suv stressi.", pixel: "Piksel 20 × 20 m" },
  { index: "ndre", question: "Azot yetarlimi?", text: "Xlorofill. 0.20 dan past — azot kam.", pixel: "Piksel 20 × 20 m" },
];

// The numbers in the alert texts come from the backend settings: NDVI_DROP_THRESHOLD,
// NDMI_STRESS_THRESHOLD and NDRE_LOW_THRESHOLD.
const ALERTS = [
  { tone: "danger", title: "NDVI keskin tushdi", text: "«Paxta-1»: 0.71 → 0.54. Pasayish 0.17." },
  { tone: "water", title: "Suv stressi", text: "«Paxta-1»: NDMI −0.05. Chegara 0.00. Sugʻorishni tekshiring." },
  { tone: "warn", title: "Azot kam", text: "«Paxta-1»: NDRE 0.18. Chegara 0.20. Dalani koʻzdan kechiring." },
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

// The numbers come from the backend settings: NDMI_STRESS_THRESHOLD, NDMI_DROP_THRESHOLD,
// NDRE_LOW_THRESHOLD, NDRE_OK_THRESHOLD and NDRE_MIN_NDVI.
const WATER_NITROGEN: {
  index: "ndmi" | "ndre";
  title: string;
  sub: string;
  text: string;
  formula: string;
  Icon: typeof LeafIcon;
  rules: { tone: string; head: string; text: string }[];
}[] = [
  {
    index: "ndmi",
    title: "NDMI — barg namligi",
    sub: "Suv stressini koʻrsatadi",
    text: "Barg ichidagi suv qisqa toʻlqinli infraqizil (SWIR) nurni yutadi. Barg qancha nam boʻlsa, SWIR shuncha kam qaytadi va NDMI shuncha yuqori boʻladi.",
    formula: "NDMI = (NIR − SWIR) ÷ (NIR + SWIR)",
    Icon: DropletIcon,
    rules: [
      { tone: "danger", head: "0 dan past —", text: "suv stressi. Bot ogohlantiradi." },
      { tone: "warn", head: "0.10 yoki koʻproq tushsa —", text: "namlik tez kamaymoqda. Bot ogohlantiradi." },
      { tone: "water", head: "0 dan yuqori —", text: "barglarda namlik yetarli." },
    ],
  },
  {
    index: "ndre",
    title: "NDRE — azot holati",
    sub: "Azot tavsiyasini beradi",
    text: "Qizil chegara (red-edge) nuri xlorofillga sezgir. Xlorofill miqdori azotga bogʻliq: azot kam boʻlsa, barg xlorofilli va NDRE pasayadi.",
    formula: "NDRE = (NIR − RedEdge) ÷ (NIR + RedEdge)",
    Icon: LeafIcon,
    rules: [
      { tone: "danger", head: "0.20 dan past —", text: "azot kam boʻlishi ehtimoli bor. Bot ogohlantiradi." },
      { tone: "warn", head: "0.20 – 0.30 —", text: "oʻrtacha." },
      {
        tone: "ok",
        head: "0.30 va undan yuqori —",
        text: "azot yetarli. NDVI 0.30 dan past boʻlsa, ekin siyrak va baho berilmaydi.",
      },
    ],
  },
];

// The numbers come from the backend settings: SCHEDULER_HOUR, MIN_CLEAR_FRACTION, NDVI_DROP_THRESHOLD,
// NDMI_STRESS_THRESHOLD, NDRE_LOW_THRESHOLD. The season starts on 1 March, see seasonStart() in lib/ndvi.ts.
const STEPS = [
  { title: "Dalangizni chizing", text: "Joy nomini qidiring. Xaritada dala burchaklarini bosing va nom bering. Kamida 3 ta nuqta kerak." },
  {
    title: "Sunʼiy yoʻldosh suratga oladi",
    text: "Sentinel-2 Oʻzbekistonni har 2–5 kunda suratga oladi. NDVI pikseli 10 × 10 m, NDMI va NDRE pikseli 20 × 20 m.",
  },
  {
    title: "Biz uchta indeks hisoblaymiz",
    text: "Har kuni soat 07:00 da yangi surat tekshiriladi. Dalaning kamida 80% qismi ochiq koʻrinmasa, surat tashlanadi.",
  },
  {
    title: "Mavsum tarixini yuklang",
    text: "Bitta tugma 1-martdan bugungacha boʻlgan tiniq suratlarni fonda yuklaydi. Grafik darhol toʻladi.",
  },
  {
    title: "Telegram xabar beradi",
    text: "NDVI 0.15 yoki koʻproq tushsa, NDMI 0 dan pastga tushsa yoki NDRE 0.20 dan past boʻlsa, bot yozadi. Telegram orqali kirsangiz, xabarlar oʻsha Telegramga keladi.",
  },
];

const RISKS = [
  "Suv yetishmasligi yoki sugʻorish uzilishi — NDMI qatlamida koʻrinadi",
  "Zararkunandalar",
  "Kasallik",
  "Oʻgʻit, ayniqsa azot yetishmasligi — NDRE qatlamida koʻrinadi",
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
    q: "Oʻtgan oylarni ham koʻrsa boʻladimi?",
    a: "Ha. «Mavsum tarixini yuklash» tugmasi 1-martdan bugungacha boʻlgan barcha tiniq suratlarni fonda yuklaydi. Grafik va hisobot yangi kuzatuvlar bilan toʻlib boradi.",
  },
  {
    q: "Azot tavsiyasiga ishonsa boʻladimi?",
    a: "Bu sunʼiy yoʻldosh bahosi. NDRE past boʻlsa, dalaning oʻsha qismini koʻzdan kechiring va oʻgʻit berishni agronom bilan kelishing. NDVI 0.30 dan past boʻlsa, ekin siyrak va baho berilmaydi.",
  },
  {
    q: "NDMI va NDRE xaritasi nega xiraroq?",
    a: "Ular Sentinel-2 ning 20 metrli kanallaridan hisoblanadi. Shuning uchun ularning piksellari NDVI piksellaridan 4 marta katta.",
  },
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

// The season chart in the "Butun mavsum tarixi" card: x from 6 to 294, y from 88 (NDVI 0) up.
const SEASON_POINTS = SEASON.map((value, i) => ({
  x: +(6 + (i * 288) / (SEASON.length - 1)).toFixed(1),
  y: +(88 - value * 80).toFixed(1),
}));
const SEASON_LINE = SEASON_POINTS.map(({ x, y }) => `${x},${y}`).join(" ");
const SEASON_AREA = `M${SEASON_POINTS[0].x} 88 L${SEASON_POINTS.map(({ x, y }) => `${x} ${y}`).join(" L")} L${SEASON_POINTS[SEASON_POINTS.length - 1].x} 88 Z`;

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

/** An index ramp with a black mark at the alert threshold, if the index has one. */
function IndexRamp({ index, className }: { index: IndexName; className: string }) {
  const threshold = INDICES[index].threshold;
  return (
    <span className={className} aria-hidden="true" style={{ background: rampGradient(INDICES[index].stops) }}>
      {threshold && <span style={{ left: `calc(${rampPercent(index, threshold.value)}% - 1px)` }} />}
    </span>
  );
}

function FeatureHead({ Icon, title, children }: { Icon: typeof LeafIcon; title: string; children?: ReactNode }) {
  return (
    <div className="home-feature-head">
      <span className="home-feature-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      {children}
    </div>
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
            <a href="#imkoniyatlar">Imkoniyatlar</a>
            <a href="#nima">NDVI nima?</a>
            <a href="#suv-azot">Suv va azot</a>
            <a href="#qanday">Qanday ishlaydi</a>
            <a href="#savollar">Savollar</a>
            <MapAccessLink className="home-btn home-btn-primary home-btn-sm" iconSize={16} />
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
              Har bir dalangiz uchun Sentinel-2 sunʼiy yoʻldosh suratlaridan uchta indeks hisoblaymiz:{" "}
              <strong>NDVI</strong> — oʻsimlik holati, <strong>NDMI</strong> — barg namligi, <strong>NDRE</strong> — azot.
              Muammo boshlansa, Telegram orqali darhol xabar beramiz.
            </p>
            <div className="home-actions">
              <MapAccessLink className="home-btn home-btn-primary home-btn-lg" />
              <a href="#imkoniyatlar" className="home-btn home-btn-outline home-btn-lg">
                Imkoniyatlar
              </a>
            </div>
            <dl className="home-facts">
              <div>
                <dt>Indekslar</dt>
                <dd>NDVI · NDMI · NDRE</dd>
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
              <dl className="home-hero-values">
                {HERO_VALUES.map(({ index, value, status }) => (
                  <div key={index}>
                    <dt>{INDICES[index].label}</dt>
                    <dd
                      className="home-hero-value"
                      style={{ background: indexColor(index, value), color: indexTextColor(index, value) }}
                    >
                      {formatIndex(value)}
                    </dd>
                    <dd className={`home-tone-${index}`}>{status}</dd>
                  </div>
                ))}
              </dl>
            </figcaption>
          </figure>
        </section>

        <section className="home-divided" aria-labelledby="imkoniyatlar">
          <div className="home-container home-section">
            <SectionHead
              id="imkoniyatlar"
              eyebrow="01 · IMKONIYATLAR"
              title="Bitta xaritada — dalaning toʻliq holati"
              lead="NDVI «nimadir oʻzgardi» deydi. NDMI va NDRE sababini topishga yordam beradi: suv yetmayaptimi yoki azot. Hammasi bitta xaritada, bitta grafikda."
            />

            <div className="home-features">
              <article className="home-feature home-feature-wide">
                <FeatureHead Icon={LayersIcon} title="Uchta indeks — uchta savol" />
                <div className="home-index-grid">
                  {INDEX_QUESTIONS.map(({ index, question, text, pixel }) => (
                    <div key={index} className="home-index">
                      <span className={`home-index-label home-tone-${index}`}>{INDICES[index].label}</span>
                      <strong>{question}</strong>
                      <span>{text}</span>
                      <IndexRamp index={index} className="home-index-ramp" />
                      <span className="home-index-ends">
                        <span>{INDICES[index].rampEnds[0].word}</span>
                        <span>{INDICES[index].rampEnds[1].word}</span>
                      </span>
                      <span className="home-index-meta">{pixel}</span>
                    </div>
                  ))}
                </div>
                <a href="#suv-azot" className="home-more">
                  Suv va azot haqida batafsil
                  <ArrowRightIcon size={16} />
                </a>
              </article>

              <article className="home-feature home-feature-tall home-feature-dark">
                <FeatureHead Icon={SendIcon} title="Telegram ogohlantirish" />
                <p>Har kuni 07:00 da yangi surat tekshiriladi. Muammo boshlansa, bot darhol yozadi.</p>
                <ul className="home-alerts">
                  {ALERTS.map(({ tone, title, text }) => (
                    <li key={title}>
                      <span className={`status-chip home-chip-${tone}`}>
                        <span className="status-dot" aria-hidden="true" />
                        {title}
                      </span>
                      <span>{text}</span>
                      <span className="home-alert-time">07:02</span>
                    </li>
                  ))}
                </ul>
                <p className="home-feature-foot">Telegram orqali parolsiz kiring. Xabarlar oʻsha akkauntga keladi.</p>
              </article>

              <article className="home-feature">
                <FeatureHead Icon={HistoryIcon} title="Butun mavsum tarixi" />
                <p>Bitta tugma 1-martdan bugungacha boʻlgan barcha tiniq suratlarni yuklaydi. Hisobotda uchala indeks jadvali bor.</p>
                <svg
                  className="home-season"
                  viewBox="0 0 300 96"
                  role="img"
                  aria-label="Mavsum davomida NDVI, namuna: aprelda 0.18, iyulda 0.76, oktyabrda 0.40"
                >
                  <line x1="0" x2="300" y1="88" y2="88" />
                  <line x1="0" x2="300" y1="48" y2="48" />
                  <line x1="0" x2="300" y1="8" y2="8" />
                  <path d={SEASON_AREA} className="home-season-area" />
                  <polyline points={SEASON_LINE} className="home-season-line" />
                  {SEASON_POINTS.map(({ x, y }) => (
                    <circle key={x} cx={x} cy={y} r="3" className="home-season-point" />
                  ))}
                </svg>
                <span className="home-season-months" aria-hidden="true">
                  <span>aprel</span>
                  <span>iyul</span>
                  <span>oktyabr</span>
                </span>
              </article>

              <article className="home-feature">
                <FeatureHead Icon={LeafIcon} title="Azot tavsiyasi">
                  <span className="status-chip status-danger">
                    <span className="status-dot" aria-hidden="true" />
                    Azot kam
                  </span>
                </FeatureHead>
                <p>NDRE boʻyicha azot yetishmasligi ehtimolini koʻrsatamiz. Oʻgʻit berishdan oldin dalani tekshiring.</p>
                {/* The same 0–0.5 scale as NitrogenCard: low below 0.20, enough from 0.30. */}
                <div className="n-scale home-n-scale" aria-hidden="true">
                  <div className="n-scale-bar" style={{ gridTemplateColumns: "40fr 20fr 40fr" }}>
                    <span />
                    <span />
                    <span />
                    <span className="n-scale-marker" style={{ left: "calc(36% - 2px)" }} />
                  </div>
                  <div className="n-scale-labels" style={{ gridTemplateColumns: "40fr 20fr 40fr" }}>
                    <span>Kam · &lt; 0.20</span>
                    <span>Oʻrtacha</span>
                    <span>Yetarli · ≥ 0.30</span>
                  </div>
                </div>
                <span className="home-feature-meta">
                  «Paxta-1»: NDRE <strong>0.18</strong>
                </span>
              </article>

              <article className="home-feature">
                <FeatureHead Icon={SearchIcon} title="Joyni toping, dalani chizing" />
                <p>Qishloq, tuman yoki shahar nomini yozing. Xarita oʻsha joyga oʻtadi. Keyin dala burchaklarini bosib chizasiz.</p>
                <div className="home-search-demo" aria-hidden="true">
                  <div className="home-search-input">
                    <SearchIcon size={16} />
                    Qoʻrgʻontepa
                  </div>
                  <div className="home-search-result">
                    <strong>Qoʻrgʻontepa</strong>
                    <span>Andijon viloyati, Oʻzbekiston</span>
                  </div>
                </div>
              </article>

              <article className="home-feature home-feature-wide home-feature-row">
                <div className="home-feature-text">
                  <FeatureHead Icon={ImageIcon} title="Rangli rasm" />
                  <p>Shu sananing oddiy suratini ham koʻring. Qizargan joy yoʻlmi, ariqmi yoki haqiqatan zaif ekinmi — rasmda koʻrinadi.</p>
                </div>
                <div className="home-pics">
                  <figure>
                    <svg viewBox="0 0 200 120" aria-hidden="true">
                      <rect width="200" height="120" fill="#8a7d5c" />
                      <rect x="18" y="16" width="164" height="88" fill="#556b2f" />
                      <rect x="18" y="72" width="54" height="32" fill="#8f835f" />
                      <rect x="72" y="84" width="40" height="20" fill="#7a7448" />
                      <path d="M18 50h164M18 30h164" stroke="#4b5f28" strokeWidth="3" />
                      <rect x="18" y="16" width="164" height="88" fill="none" stroke="#ffffff" strokeWidth="2.5" />
                    </svg>
                    <figcaption>Rasm</figcaption>
                  </figure>
                  <figure>
                    <svg viewBox="0 0 200 120" aria-hidden="true" shapeRendering="crispEdges">
                      <rect width="200" height="120" fill="#8a7d5c" />
                      {MINI_PIXELS.map((row, r) =>
                        row.map((color, c) => (
                          <rect key={`${r}-${c}`} x={18 + c * 20.5} y={16 + r * 22} width="21" height="22" fill={color} />
                        )),
                      )}
                      <rect x="18" y="16" width="164" height="88" fill="none" stroke="#ffffff" strokeWidth="2.5" />
                    </svg>
                    <figcaption>NDVI</figcaption>
                  </figure>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="home-band" aria-labelledby="nima">
          <div className="home-container home-section">
            <div className="home-section-head">
              <span className="home-eyebrow">02 · ASOSIY TUSHUNCHA</span>
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
            eyebrow="03 · XARITANI OʻQISH"
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

        <section className="home-band" aria-labelledby="suv-azot">
          <div className="home-container home-section">
            <SectionHead
              id="suv-azot"
              eyebrow="04 · SUV VA AZOT"
              title="NDMI va NDRE: sababni topish"
              lead="NDVI tushsa, sabab har xil boʻlishi mumkin. Ikki qoʻshimcha indeks eng koʻp uchraydigan ikki sababni alohida koʻrsatadi: suv yetishmasligi va azot yetishmasligi."
            />
            <div className="home-row">
              {WATER_NITROGEN.map(({ index, title, sub, text, formula, Icon, rules }) => (
                <article key={index} id={index} className="home-card home-wn">
                  <div className="home-leaf-head">
                    <span className={`home-leaf-icon home-wn-icon-${index}`} aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <div className="home-wn-title">
                      <h3>{title}</h3>
                      <span>{sub}</span>
                    </div>
                  </div>
                  <p className="home-wn-text">{text}</p>
                  <p className="home-mono home-wn-formula">{formula}</p>
                  <div className="home-wn-scale" aria-hidden="true">
                    <IndexRamp index={index} className="home-wn-ramp" />
                    <span className="home-wn-ends">
                      <span>
                        <strong>{INDICES[index].rampEnds[0].word}</strong> · {INDICES[index].rampEnds[0].value}
                      </span>
                      <span>
                        {INDICES[index].rampEnds[1].value} · <strong>{INDICES[index].rampEnds[1].word}</strong>
                      </span>
                    </span>
                  </div>
                  <ul className="home-wn-rules">
                    {rules.map(({ tone, head, text: ruleText }) => (
                      <li key={head}>
                        <span className={`home-wn-dot home-wn-dot-${tone}`} aria-hidden="true" />
                        <span>
                          <strong>{head}</strong> {ruleText}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <p className="home-note">
              <InfoIcon size={20} />
              <span>
                NDMI va NDRE piksellari 20 × 20 m, NDVI dan yirikroq. Bu sunʼiy yoʻldosh bahosi:{" "}
                <strong>sugʻorish yoki oʻgʻit qarori oldidan dalani tekshiring</strong>.
              </span>
            </p>
          </div>
        </section>

        <section className="home-container home-section" aria-labelledby="qanday">
          <SectionHead id="qanday" eyebrow="05 · XIZMAT" title="Qanday ishlaydi" />
          <ol className="home-row home-steps">
            {STEPS.map(({ title, text }, index) => (
              <li key={title} className="home-card home-step">
                <span className="home-step-number">{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-band" aria-labelledby="tushsa">
          <div className="home-container home-section">
            <SectionHead
              id="tushsa"
              eyebrow="06 · AMALDA"
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
          </div>
        </section>

        <section className="home-container home-container-narrow home-section" aria-labelledby="savollar">
          <SectionHead id="savollar" eyebrow="07 · SAVOLLAR" title="Koʻp soʻraladigan savollar" />
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
        </section>

        <section className="home-cta-wrap" aria-labelledby="cta-title">
          <div className="home-container home-cta">
            <div>
              <h2 id="cta-title">Birinchi dalangizni qoʻshing</h2>
              <p>Xaritada dalani chizing. Qolganini sunʼiy yoʻldosh va biz bajaramiz.</p>
            </div>
            <MapAccessLink className="home-btn home-btn-light home-btn-lg" />
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
