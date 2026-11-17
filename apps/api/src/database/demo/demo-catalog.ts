/**
 * The demo item master: ~60 real products from the Egyptian candy & chocolate market.
 * Shelf prices (EGP, per piece) come from public retailer listings (Talabat Mart, Carrefour Egypt,
 * Nov 2026); candy and gum prices are approximate. Wholesale and cost prices are derived from them.
 */
export type DemoCategoryKey =
  "bars" | "wafer" | "minis" | "dark" | "candy" | "gum";
export type DemoSupplierKey =
  "mondelez" | "mars" | "nestle" | "ferrero" | "local";

export const DEMO_CATEGORIES: Record<DemoCategoryKey, string> = {
  bars: "ألواح شوكولاتة",
  wafer: "ويفر وبسكويت بالشوكولاتة",
  minis: "عبوات ميني ومشاركة",
  dark: "شوكولاتة داكنة وصحية",
  candy: "حلوى وكاندي",
  gum: "لبان ونعناع",
};

export const DEMO_SUPPLIERS: Record<
  DemoSupplierKey,
  { name: string; phone: string; contact: string; terms: number }
> = {
  mondelez: {
    name: "مونديليز مصر للأغذية",
    phone: "0233000100",
    contact: "أ. هشام فوزي",
    terms: 30,
  },
  mars: {
    name: "مارس مصر",
    phone: "0233000200",
    contact: "أ. نادر سليم",
    terms: 30,
  },
  nestle: {
    name: "نستله مصر",
    phone: "0233000300",
    contact: "أ. رانيا عادل",
    terms: 45,
  },
  ferrero: {
    name: "الوكيل المعتمد لمنتجات فيريرو",
    phone: "0233000400",
    contact: "أ. كريم منصور",
    terms: 30,
  },
  local: {
    name: "النيل لتوزيع الحلويات والمنتجات المحلية",
    phone: "0233000500",
    contact: "أ. سامح جرجس",
    terms: 15,
  },
};

export interface DemoProduct {
  name: string;
  brand: string;
  category: DemoCategoryKey;
  supplier: DemoSupplierKey;
  /** Shelf price of one piece, EGP. */
  retail: number;
  /** Pieces in a box (علبة/دستة) and boxes in a carton. */
  perBox: number;
  boxesPerCarton: number;
  /** Shelf life from production, months (sets lot expiry dates). */
  shelfMonths: number;
}

const p = (
  name: string,
  brand: string,
  category: DemoCategoryKey,
  supplier: DemoSupplierKey,
  retail: number,
  perBox: number,
  boxesPerCarton: number,
  shelfMonths = 12,
): DemoProduct => ({
  name,
  brand,
  category,
  supplier,
  retail,
  perBox,
  boxesPerCarton,
  shelfMonths,
});

export const DEMO_PRODUCTS: DemoProduct[] = [
  // Cadbury / Moro — Mondelez
  p("كادبوري ديري ميلك سادة 30 جم", "كادبوري", "bars", "mondelez", 36, 24, 6),
  p(
    "كادبوري ديري ميلك بالبندق 30 جم",
    "كادبوري",
    "bars",
    "mondelez",
    36,
    24,
    6,
  ),
  p("كادبوري ديري ميلك أوريو 35 جم", "كادبوري", "bars", "mondelez", 40, 24, 6),
  p("كادبوري ببلي 40 جم", "كادبوري", "bars", "mondelez", 45, 24, 6),
  p("كادبوري ببلي 24 جم", "كادبوري", "bars", "mondelez", 30, 24, 8),
  p("كادبوري ببلي فراولة 27 جم", "كادبوري", "bars", "mondelez", 30, 24, 8),
  p("كادبوري فليك 28 جم", "كادبوري", "bars", "mondelez", 45, 24, 6),
  p(
    "كادبوري ديري ميلك بالبندق 85 جم",
    "كادبوري",
    "bars",
    "mondelez",
    90,
    12,
    8,
  ),
  p("كادبوري ماڤيلس كريشنز 90 جم", "كادبوري", "bars", "mondelez", 90, 12, 8),
  p("كادبوري فينجرز 124 جم", "كادبوري", "wafer", "mondelez", 100, 12, 6, 9),
  p("كادبوري ويفر رولز 22 جم", "كادبوري", "wafer", "mondelez", 9.5, 24, 12, 9),
  p("كادبوري ميني سادة 156 جم", "كادبوري", "minis", "mondelez", 150, 12, 1),
  p("مورو شوكولاتة 40 جم", "مورو", "bars", "mondelez", 18.5, 24, 8),
  p("مورو عبوة توفير 200 جم", "مورو", "minis", "mondelez", 70, 12, 1),
  // Mars Egypt
  p("جالاكسي سموث 30 جم", "جالاكسي", "bars", "mars", 40, 24, 6),
  p("جالاكسي بالبندق 36 جم", "جالاكسي", "bars", "mars", 35, 24, 6),
  p("جالاكسي سموث 56 جم", "جالاكسي", "bars", "mars", 57.5, 24, 6),
  p("جالاكسي دارك 38 جم", "جالاكسي", "dark", "mars", 35, 24, 6),
  p("جالاكسي فيوجن دارك 70% 35 جم", "جالاكسي", "dark", "mars", 65, 24, 6),
  p("جالاكسي فلوتس إصبعين 22.5 جم", "جالاكسي", "wafer", "mars", 10, 24, 12, 9),
  p("جالاكسي فلوتس 4 أصابع 45 جم", "جالاكسي", "wafer", "mars", 20, 24, 8, 9),
  p("جالاكسي ميني سموث 117 جم", "جالاكسي", "minis", "mars", 150, 12, 1),
  p("سنيكرز 40 جم", "سنيكرز", "bars", "mars", 45, 24, 6),
  p("سنيكرز قهوة 40 جم", "سنيكرز", "bars", "mars", 46.5, 24, 6),
  p("سنيكرز ميني 150 جم", "سنيكرز", "minis", "mars", 136, 12, 1),
  p("تويكس 46 جم", "تويكس", "wafer", "mars", 34.5, 24, 6, 9),
  p("تويكس رول 22.5 جم", "تويكس", "wafer", "mars", 11.5, 24, 12, 9),
  p("تويكس ميني 150 جم", "تويكس", "minis", "mars", 136, 12, 1),
  p("مارس ميني 150 جم", "مارس", "minis", "mars", 136, 12, 1),
  p("باونتي 50 جم", "باونتي", "bars", "mars", 47, 24, 6),
  p("باونتي ميني 150 جم", "باونتي", "minis", "mars", 136, 12, 1),
  p("إم آند إمز شوكولاتة 45 جم", "إم آند إمز", "candy", "mars", 43.5, 24, 6),
  p("مالتيزرز 37 جم", "مالتيزرز", "bars", "mars", 50, 24, 6),
  // Nestlé
  p("كيت كات 4 أصابع 36.5 جم", "كيت كات", "wafer", "nestle", 35, 24, 6, 9),
  p("كيت كات إصبعين 17.7 جم", "كيت كات", "wafer", "nestle", 18, 36, 6, 9),
  // Ferrero
  p("كيندر بوينو 43 جم", "كيندر", "wafer", "ferrero", 46.5, 30, 4, 6),
  p("كيندر بوينو دارك 43 جم", "كيندر", "wafer", "ferrero", 51.5, 30, 4, 6),
  p("كيندر شوكولاتة 50 جم", "كيندر", "bars", "ferrero", 48, 20, 6, 9),
  p("كيندر شوكولاتة 100 جم", "كيندر", "bars", "ferrero", 90, 10, 8, 9),
  // Local brands — النيل
  p("كورونا دارك 26 جم", "كورونا", "dark", "local", 27, 24, 8),
  p("كورونا دارك 35 جم", "كورونا", "dark", "local", 24, 24, 8),
  p("كورونا دارك 72% كاكاو", "كورونا", "dark", "local", 52, 12, 8),
  p("كورونا ستيفيا دارك باللوز 45 جم", "كورونا", "dark", "local", 59, 12, 8),
  p("كورونا ستيفيا ألبين ميلك 45 جم", "كورونا", "dark", "local", 60, 12, 8),
  p(
    "ماندولين بسكويت بالشوكولاتة 40 جم",
    "ماندولين",
    "wafer",
    "local",
    10,
    24,
    12,
    9,
  ),
  p(
    "ماندولين كينج سايز كراميل 50 جم",
    "ماندولين",
    "wafer",
    "local",
    14,
    24,
    12,
    9,
  ),
  p(
    "ماندولين ويفر بكريمة الكاكاو 5 قطع",
    "ماندولين",
    "wafer",
    "local",
    52,
    12,
    6,
    9,
  ),
  p(
    "العبد فول سوداني بالشوكولاتة 45 جم",
    "العبد",
    "candy",
    "local",
    30,
    24,
    8,
    9,
  ),
  p(
    "العبد فول سوداني بالشوكولاتة الداكنة 45 جم",
    "العبد",
    "candy",
    "local",
    30,
    24,
    8,
    9,
  ),
  p("ماكفيتيز نيبلز بالحليب 37 جم", "ماكفيتيز", "wafer", "local", 35, 24, 6, 9),
  p("ماكفيتيز نيبلز دارك 37 جم", "ماكفيتيز", "wafer", "local", 35, 24, 6, 9),
  // Candy & gum (approximate shelf prices)
  p("منتوس نعناع رول 37.5 جم", "منتوس", "gum", "local", 15, 20, 12, 18),
  p("منتوس فواكه رول 37.5 جم", "منتوس", "gum", "local", 15, 20, 12, 18),
  p("هولز نعناع 33.5 جم", "هولز", "gum", "mondelez", 15, 20, 12, 18),
  p("هولز عسل وليمون 33.5 جم", "هولز", "gum", "mondelez", 15, 20, 12, 18),
  p("تريدنت لبان نعناع 14 جم", "تريدنت", "gum", "mondelez", 20, 12, 20, 18),
  p("تشوبا تشوبس مصاصة 12 جم", "تشوبا تشوبس", "candy", "local", 7, 50, 12, 24),
  p("تشوبا تشوبس علبة 10 قطع", "تشوبا تشوبس", "candy", "local", 65, 12, 6, 24),
  p("هاريبو جولد بيرز 80 جم", "هاريبو", "candy", "local", 55, 24, 6, 18),
  p("هاريبو هابي كولا 80 جم", "هاريبو", "candy", "local", 55, 24, 6, 18),
];

/** Wholesale and cost of one piece, in piastres (minor units), from its shelf price. */
export function piecePrices(item: DemoProduct): {
  retail: number;
  wholesale: number;
  cost: number;
} {
  const retail = Math.round(item.retail * 100);
  return {
    retail,
    wholesale: Math.round(retail * 0.88),
    cost: Math.round(retail * 0.74),
  };
}

export const DEMO_CUSTOMERS: {
  name: string;
  area: string;
  kind: "wholesale" | "retail";
}[] = [
  { name: "هايبر ماركت الفتح", area: "مدينة نصر", kind: "wholesale" },
  {
    name: "سوبر ماركت أولاد رجب - فرع العباسية",
    area: "العباسية",
    kind: "wholesale",
  },
  { name: "ماركت الحرمين", area: "شبرا", kind: "wholesale" },
  { name: "سوبر ماركت السلام", area: "المعادي", kind: "wholesale" },
  { name: "ماركت النور", area: "حلوان", kind: "wholesale" },
  { name: "محلات الأمانة للحلويات", area: "الزيتون", kind: "wholesale" },
  { name: "سوبر ماركت الهدى", area: "المقطم", kind: "wholesale" },
  { name: "ماركت البركة", area: "عين شمس", kind: "wholesale" },
  { name: "هايبر الصفا", area: "التجمع الخامس", kind: "wholesale" },
  { name: "سوبر ماركت المدينة المنورة", area: "الهرم", kind: "wholesale" },
  { name: "ماركت الرحمة", area: "فيصل", kind: "wholesale" },
  { name: "سلسلة محلات الصباح", area: "مصر الجديدة", kind: "wholesale" },
  { name: "بقالة الحاج سعيد", area: "المعادي", kind: "retail" },
  { name: "كشك أبو علي", area: "دار السلام", kind: "retail" },
  { name: "بقالة الأمل", area: "المطرية", kind: "retail" },
  { name: "كافيتريا الجامعة", area: "العباسية", kind: "retail" },
  { name: "بقالة نور الإسلام", area: "إمبابة", kind: "retail" },
  { name: "محل حلويات الشاطر", area: "الدقي", kind: "retail" },
  { name: "ماركت الفرسان", area: "السيدة زينب", kind: "retail" },
  { name: "كافيه ليالي", area: "الزمالك", kind: "retail" },
  { name: "بقالة الشروق", area: "الشروق", kind: "retail" },
  { name: "مكتبة وحلويات المستقبل", area: "الرحاب", kind: "retail" },
  { name: "سوبر ماركت جنة", area: "6 أكتوبر", kind: "wholesale" },
  { name: "ماركت الوفاء", area: "العبور", kind: "retail" },
  { name: "محلات الأخوة للتجارة", area: "شبرا الخيمة", kind: "wholesale" },
];

export const DEMO_REPS = [
  {
    code: "REP-01",
    name: "محمد عبد الحميد",
    phone: "01001234561",
    commission: 2,
  },
  { code: "REP-02", name: "أحمد سمير", phone: "01001234562", commission: 2 },
  { code: "REP-03", name: "مصطفى عادل", phone: "01001234563", commission: 1.5 },
];

export const DEMO_EMPLOYEES: {
  name: string;
  dept: string;
  job: string;
  basic: number;
  hire: string;
  branch: "main" | "maadi" | "nasr";
  pay: "cash" | "bank";
  gender: "male" | "female";
}[] = [
  {
    name: "عبد الله العمدة",
    dept: "الإدارة",
    job: "مدير عام",
    basic: 30000,
    hire: "2021-01-01",
    branch: "main",
    pay: "bank",
    gender: "male",
  },
  {
    name: "منى إبراهيم",
    dept: "الحسابات",
    job: "رئيس حسابات",
    basic: 16000,
    hire: "2022-03-01",
    branch: "main",
    pay: "bank",
    gender: "female",
  },
  {
    name: "وليد شوقي",
    dept: "الحسابات",
    job: "محاسب",
    basic: 10000,
    hire: "2023-06-15",
    branch: "main",
    pay: "bank",
    gender: "male",
  },
  {
    name: "سارة محمود",
    dept: "الحسابات",
    job: "محاسب",
    basic: 9500,
    hire: "2024-02-01",
    branch: "main",
    pay: "bank",
    gender: "female",
  },
  {
    name: "محمد عبد الحميد",
    dept: "المبيعات",
    job: "مندوب مبيعات",
    basic: 7000,
    hire: "2022-09-01",
    branch: "main",
    pay: "cash",
    gender: "male",
  },
  {
    name: "أحمد سمير",
    dept: "المبيعات",
    job: "مندوب مبيعات",
    basic: 7000,
    hire: "2023-01-10",
    branch: "main",
    pay: "cash",
    gender: "male",
  },
  {
    name: "مصطفى عادل",
    dept: "المبيعات",
    job: "مندوب مبيعات",
    basic: 6500,
    hire: "2024-05-01",
    branch: "main",
    pay: "cash",
    gender: "male",
  },
  {
    name: "إسلام فتحي",
    dept: "المخازن",
    job: "أمين مخزن",
    basic: 8000,
    hire: "2022-01-15",
    branch: "main",
    pay: "cash",
    gender: "male",
  },
  {
    name: "حسن ربيع",
    dept: "المخازن",
    job: "عامل مخزن",
    basic: 5500,
    hire: "2024-08-01",
    branch: "main",
    pay: "cash",
    gender: "male",
  },
  {
    name: "رامي ناصر",
    dept: "المخازن",
    job: "سائق",
    basic: 6500,
    hire: "2023-04-01",
    branch: "main",
    pay: "cash",
    gender: "male",
  },
  {
    name: "نهى سامي",
    dept: "الفروع",
    job: "كاشير",
    basic: 6000,
    hire: "2023-11-01",
    branch: "maadi",
    pay: "cash",
    gender: "female",
  },
  {
    name: "يوسف طارق",
    dept: "الفروع",
    job: "مسؤول فرع",
    basic: 8500,
    hire: "2022-07-01",
    branch: "maadi",
    pay: "bank",
    gender: "male",
  },
  {
    name: "دينا حسام",
    dept: "الفروع",
    job: "كاشير",
    basic: 6000,
    hire: "2024-03-15",
    branch: "nasr",
    pay: "cash",
    gender: "female",
  },
  {
    name: "عمرو جمال",
    dept: "الفروع",
    job: "مسؤول فرع",
    basic: 8500,
    hire: "2023-02-01",
    branch: "nasr",
    pay: "bank",
    gender: "male",
  },
];
