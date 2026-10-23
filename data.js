// Стартовые данные магазина AQUAFORMA.BY (Республика Беларусь)

function createProductSvg(title, colorHex, accentHex, spoutType, priceText = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 480" width="600" height="480">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#16191E"/>
        <stop offset="100%" stop-color="#282D37"/>
      </linearGradient>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${colorHex}"/>
        <stop offset="50%" stop-color="${accentHex}"/>
        <stop offset="100%" stop-color="${colorHex}"/>
      </linearGradient>
    </defs>
    <rect width="600" height="480" fill="url(#bg)"/>
    <circle cx="480" cy="110" r="160" fill="#C59B5F" opacity="0.1"/>
    <circle cx="120" cy="390" r="190" fill="#C59B5F" opacity="0.06"/>
    <rect x="60" y="380" width="480" height="16" rx="6" fill="#3A3F4B"/>
    <rect x="260" y="335" width="60" height="45" rx="6" fill="url(#bodyGrad)" stroke="#C59B5F" stroke-width="1.5"/>
    <rect x="272" y="210" width="36" height="130" rx="8" fill="url(#bodyGrad)"/>
    <rect x="308" y="285" width="42" height="16" rx="6" fill="url(#bodyGrad)"/>
    <rect x="340" y="245" width="10" height="55" rx="5" fill="#C59B5F"/>
    <path d="M 290 215 C 290 95, 420 95, 420 205 L 420 245" fill="none" stroke="url(#bodyGrad)" stroke-width="26" stroke-linecap="round"/>
    <rect x="405" y="240" width="30" height="18" rx="4" fill="#C59B5F"/>
    <line x1="414" y1="262" x2="414" y2="375" stroke="#60A5FA" stroke-width="2" stroke-dasharray="6 6" opacity="0.7"/>
    <line x1="420" y1="262" x2="420" y2="375" stroke="#93C5FD" stroke-width="2.5" stroke-dasharray="8 5" opacity="0.85"/>
    <line x1="426" y1="262" x2="426" y2="375" stroke="#60A5FA" stroke-width="2" stroke-dasharray="6 6" opacity="0.7"/>
    <rect x="32" y="32" width="195" height="32" rx="16" fill="rgba(197,155,95,0.18)" stroke="rgba(197,155,95,0.45)"/>
    <text x="130" y="53" fill="#C59B5F" font-family="Inter, sans-serif" font-size="12" font-weight="700" text-anchor="middle">${spoutType}</text>
    ${priceText ? `<rect x="420" y="32" width="145" height="32" rx="16" fill="#C59B5F"/><text x="492" y="53" fill="#141619" font-family="Inter, sans-serif" font-size="13" font-weight="800" text-anchor="middle">${priceText}</text>` : ""}
    <text x="300" y="440" fill="#E5E7EB" font-family="Inter, sans-serif" font-size="16" font-weight="600" text-anchor="middle">${title}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEFAULT_STORE_SETTINGS = {
  brandName: "AQUAFORMA.BY",
  brandTagline: "Магазин кухонных смесителей и аксессуаров в Беларуси",
  phone: "+375 (29) 645-88-90",
  secondPhone: "+375 (33) 645-88-90",
  city: "г. Минск, ТЦ «СтройЭкспо», пав. 42",
  workHours: "Ежедневно с 10:00 до 20:00",
  legalName: "ИП Ковалев Александр Николаевич",
  unp: "193458912",
  regAuthority: "Минским горисполкомом 14.04.2021",
  tradeRegistryInfo: "Режим работы сайта: онлайн-каталог с бронированием и доставкой по РБ",
  onlinePaymentEnabled: false,
  bepaidShopId: "38104",
  bepaidPublicKey: "bepaid_test_pub_key_rb",
  eripServiceCode: "4458921",
  telegramBotToken: "",
  telegramChatId: "",
  freeShippingThresholdByn: 250
};

const DEFAULT_PRODUCTS = [
  {
    id: "prd-101",
    sku: "AF-301-BLK",
    title: "Смеситель для кухни 3-в-1 под фильтр питьевой воды Graphit Pro",
    category: "faucets-filter",
    categoryLabel: "Смесители 3-в-1 (под фильтр)",
    price: 345.00,
    oldPrice: 410.00,
    color: "Черный матовый / Графит",
    material: "Латунь CW617N",
    spoutType: "С каналом питьевой воды",
    warranty: "5 лет",
    inStock: 14,
    isHit: true,
    image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Graphit Pro 3-in-1", "#23262B", "#40454F", "3-в-1 ПОД ФИЛЬТР", "345 BYN"),
    description: "Премиальный кухонный смеситель из тяжелой сантехнической латуни (вес 2.4 кг) с отдельным независимым каналом для фильтрованной питьевой воды. Не нужно сверлить второе отверстие в мойке или столешнице.",
    features: [
      "Керамический картридж Sedal 35 мм (Испания)",
      "Два раздельных аэратора Neoperl: водопроводная и питьевая вода не смешиваются",
      "Поворотный излив на 360 градусов",
      "В комплекте гибкая подводка 60 см и переходник под любой фильтр"
    ]
  },
  {
    id: "prd-102",
    sku: "AF-208-PULL",
    title: "Смеситель кухонный с выдвижной лейкой и режимом «Водопад» SmartFlow",
    category: "faucets-pullout",
    categoryLabel: "С выдвижной лейкой",
    price: 289.00,
    oldPrice: 330.00,
    color: "Темный оружейный металл (Gunmetal)",
    material: "Нержавеющая сталь SUS304",
    spoutType: "Выдвижная лейка + Водопад",
    warranty: "5 лет",
    inStock: 9,
    isHit: true,
    image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("SmartFlow Pull-Out", "#343942", "#58606E", "ВЫДВИЖНАЯ ЛЕЙКА", "289 BYN"),
    description: "Абсолютный хит продаж в TikTok и Reels! Выдвижной шланг 60 см с противовесом и 3 режимами струи: классическая аэрированная, мощный душ для мытья противней и широкий горизонтальный «водопад» для мытья фруктов и зелени.",
    features: [
      "PVD-покрытие цвета «Оружейная сталь» — не остаются отпечатки пальцев и капли",
      "Магнитная фиксация лейки в изливе",
      "3 режима потока воды переключением одной кнопки",
      "Бесшумный нейлоновый шланг"
    ]
  },
  {
    id: "prd-109",
    sku: "AF-510-MAG",
    title: "Профессиональный пружинный смеситель с магнитным держателем Chef Gastro",
    category: "faucets-pullout",
    categoryLabel: "С выдвижной лейкой",
    price: 379.00,
    oldPrice: 445.00,
    color: "Черный матовый + Хром",
    material: "Латунь CW617N",
    spoutType: "Профессиональная пружина + Душ",
    warranty: "5 лет",
    inStock: 6,
    isHit: true,
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Chef Gastro Magnetic", "#1F232A", "#9CA3AF", "CHEF GASTRO PRO", "379 BYN"),
    description: "Кухонный смеситель в стиле профессиональных ресторанных кухонь. Съемный гибкий излив на неодимовом магните позволяет легко ополаскивать всю площадь большой мойки и набирать воду в кастрюли прямо на столешнице.",
    features: [
      "Мощный магнитный держатель лейки",
      "Кнопка переключения «Струя / Турбо-душ» прямо под пальцем",
      "Усиленный корпус из латуни весом 2.7 кг",
      "Легкая очистка силиконовых форсунок от известкового налета"
    ]
  },
  {
    id: "prd-110",
    sku: "AF-309-GOLD3",
    title: "Смеситель 3-в-1 под фильтр питьевой воды Royal Brass (Матовая латунь)",
    category: "faucets-filter",
    categoryLabel: "Смесители 3-в-1 (под фильтр)",
    price: 365.00,
    oldPrice: 420.00,
    color: "Сатиновое золото / Латунь",
    material: "Латунь CW617N",
    spoutType: "3-в-1 + Высокий U-излив",
    warranty: "5 лет",
    inStock: 8,
    isHit: false,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Royal Brass 3-in-1", "#9A743B", "#E2C185", "3-в-1 ЛАТУНЬ", "365 BYN"),
    description: "Роскошный смеситель с подключением к фильтру питьевой воды в благородном оттенке брашированной латуни. Две независимые ручки: справа — холодная/горячая вода, слева — чистая фильтрованная.",
    features: [
      "Стойкое многослойное PVD-покрытие",
      "Отдельная латунная трубка внутри излива для питьевой воды",
      "Подходит к любым фильтрам (Аквафор, Гейзер, Барьер, Ecosoft)"
    ]
  },
  {
    id: "prd-103",
    sku: "AF-115-FLEX",
    title: "Смеситель с гибким силиконовым изливом и двухрежимным аэратором Flex Brass",
    category: "faucets-flex",
    categoryLabel: "С гибким изливом",
    price: 175.00,
    oldPrice: 210.00,
    color: "Черный + Латунь",
    material: "Латунь + Пищевой силикон",
    spoutType: "Гибкий излив",
    warranty: "3 года",
    inStock: 22,
    isHit: false,
    image: "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Flex Brass Edition", "#1F2124", "#C59B5F", "ГИБКИЙ ИЗЛИВ", "175 BYN"),
    description: "Удобный смеситель с мягким силиконовым изливом Soft-Touch и благородными латунными вставками. Легко направить струю в любой угол глубокой или двойной мойки.",
    features: [
      "Гибкий излив с памятью формы или фиксацией в держателе",
      "Переключатель «душ / струя» прямо на носике аэратора",
      "Устойчив к перепадам температур и известковому налету"
    ]
  },
  {
    id: "prd-104",
    sku: "AF-402-GOLD",
    title: "Смеситель кухонный Brushed Gold (Матовое золото / Латунь)",
    category: "faucets-classic",
    categoryLabel: "Классические высокие",
    price: 245.00,
    oldPrice: 279.00,
    color: "Сатиновое золото / Латунь",
    material: "Латунь CW617N",
    spoutType: "Высокий L-образный",
    warranty: "5 лет",
    inStock: 7,
    isHit: false,
    image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Brushed Gold L-Spout", "#9A743B", "#D8B377", "ЛАТУНЬ / PVD", "245 BYN"),
    description: "Стильный высокий смеситель с Г-образным изливом в цвете матовой брашированной латуни. Идеально сочетается со светлыми кварцевыми, мраморными и черными гранитными мойками.",
    features: [
      "Износостойкое PVD-напыление (не облазит со временем)",
      "Высота излива 280 мм — удобно набирать высокие кастрюли",
      "Усиленная крепежная гайка для тонких и толстых моек"
    ]
  },
  {
    id: "prd-111",
    sku: "AF-140-SATIN",
    title: "Смеситель из пищевой нержавеющей стали Nordic Satin (Устойчивый к царапинам)",
    category: "faucets-classic",
    categoryLabel: "Классические высокие",
    price: 159.00,
    oldPrice: 195.00,
    color: "Сатин (Матовая нержавейка)",
    material: "Нержавеющая сталь SUS304",
    spoutType: "Высокий поворотный 360°",
    warranty: "5 лет",
    inStock: 16,
    isHit: false,
    image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Nordic Satin SUS304", "#6B7280", "#D1D5DB", "СТАЛЬ SUS304", "159 BYN"),
    description: "Практичный и долговечный смеситель из чистой нержавеющей стали марки SUS304. На матовой сатиновой поверхности совершенно не видны высохшие капли воды и отпечатки пальцев.",
    features: [
      "Не боится жесткой воды и чистящих средств",
      "Аэратор с функцией экономии воды до 30%",
      "Быстрый монтаж от руки без специальных ключей"
    ]
  },
  {
    id: "prd-105",
    sku: "AF-DISP-01",
    title: "Встраиваемый дозатор для жидкого мыла и моющего средства (Металл)",
    category: "accessories",
    categoryLabel: "Дозаторы и аксессуары",
    price: 49.00,
    oldPrice: 65.00,
    color: "Черный матовый / Графит",
    material: "Нержавеющая сталь SUS304",
    spoutType: "Аксессуар в мойку",
    warranty: "2 года",
    inStock: 35,
    isHit: true,
    image: "https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Дозатор встраиваемый", "#25282E", "#C59B5F", "ХИТ К СМЕСИТЕЛЮ", "49 BYN"),
    description: "Забудьте про пластиковые бутылки с Фейри вокруг мойки! Встраиваемый металлический дозатор на 350 мл заправляется сверху — не нужно лазить под раковину, чтобы долить средство.",
    features: [
      "Верхняя заливка моющего средства за 5 секунд",
      "Металлическая помпа с плавным ходом",
      "Попадает точно в цвет черных и графитовых смесителей"
    ]
  },
  {
    id: "prd-112",
    sku: "AF-RINSER-02",
    title: "Автоматический ополаскиватель стаканов и бокалов в мойку JetGlass Pro",
    category: "accessories",
    categoryLabel: "Дозаторы и аксессуары",
    price: 89.00,
    oldPrice: 115.00,
    color: "Черный матовый / Оружейная сталь",
    material: "Нержавеющая сталь + Латунь",
    spoutType: "Встраиваемый в мойку",
    warranty: "2 года",
    inStock: 12,
    isHit: true,
    image: "https://images.unsplash.com/photo-1565538810643-b5bdb714032a?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Ополаскиватель JetGlass", "#1E2229", "#C59B5F", "ТРЕНД TIKTOK", "89 BYN"),
    description: "Тот самый ринзер (ополаскиватель стаканов), который собирает миллионы просмотров! Отмывает детские бутылочки, узкие бокалы, шейкеры и кружки от молока и кофе за 3 секунды мощными струями под давлением.",
    features: [
      "Металлический корпус (не пластик!)",
      "В комплекте тройник и армированный шланг для подключения к воде",
      "Устанавливается в стандартное отверстие мойки или столешницы"
    ]
  },
  {
    id: "prd-106",
    sku: "AF-COL-09",
    title: "Раздвижной коландер + ролл-мат из нержавеющей стали на мойку",
    category: "accessories",
    categoryLabel: "Дозаторы и аксессуары",
    price: 78.00,
    oldPrice: 95.00,
    color: "Графит (PVD)",
    material: "Нержавеющая сталь SUS304",
    spoutType: "Аксессуар для мойки",
    warranty: "2 года",
    inStock: 18,
    isHit: false,
    image: "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Коландер + Ролл-мат", "#2F343D", "#6C7483", "КОМПЛЕКТ В МОЙКУ", "78 BYN"),
    description: "Универсальный раздвижной коландер (дуршлаг на крыло чаши) для мытья овощей, разморозки продуктов и сушки стаканов + складной силиконовый ролл-мат под горячие кастрюли.",
    features: [
      "Регулируемая длина от 34 до 48 см — подходит к 95% кухонных моек",
      "Силиконовые накладки на ручках защищают мойку от царапин",
      "Выдерживает нагрузку до 12 кг"
    ]
  },
  {
    id: "prd-107",
    sku: "AF-DRINK-04",
    title: "Отдельный кран для фильтра чистой питьевой воды Pure Satin",
    category: "drinking-taps",
    categoryLabel: "Краны для питьевой воды",
    price: 85.00,
    oldPrice: 99.00,
    color: "Сатин (Матовая нержавейка)",
    material: "Пищевая сталь SUS304",
    spoutType: "Для систем обратного осмоса",
    warranty: "3 года",
    inStock: 19,
    isHit: false,
    image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Кран питьевой Pure Satin", "#7B828E", "#B8C0CC", "ДЛЯ ФИЛЬТРА ВОДЫ", "85 BYN"),
    description: "Надежный отдельный кран для систем очистки воды (обратный осмос и проточные трехступенчатые фильтры). Не содержит свинца, выполнен из медицинской нержавеющей стали.",
    features: [
      "Керамический кран-букса с плавным поворотом на 90°",
      "Стандартное подключение 1/4 дюйма (подходит к Аквафор, Гейзер, Барьер)",
      "Поворотный гусак на 360°"
    ]
  },
  {
    id: "prd-108",
    sku: "AF-AERO-720",
    title: "Насадка-аэратор поворотная 720° с 2 режимами (Турбо-душ / Струя)",
    category: "accessories",
    categoryLabel: "Дозаторы и аксессуары",
    price: 29.00,
    oldPrice: 39.00,
    color: "Хром / Графит",
    material: "Латунный шарнир",
    spoutType: "Универсальная резьба М22/М24",
    warranty: "1 год",
    inStock: 45,
    isHit: true,
    image: "https://images.unsplash.com/photo-1584622781564-1d987f7333c1?auto=format&fit=crop&w=900&q=80",
    fallbackSvg: createProductSvg("Аэратор 720° Латунь", "#4B5260", "#C59B5F", "ТОП ПРОДАЖ TIKTOK", "29 BYN"),
    description: "Двухшарнирная латунная насадка-аэратор с вращением на 720 градусов. Позволяет направить воду вверх (удобно умываться или споласкивать рот) и обмывать стенки раковины.",
    features: [
      "Экономия воды до 35% за счет обогащения струи кислородом",
      "В комплекте переходник на внутреннюю и внешнюю резьбу (М22 / М24)",
      "Установка без ключей за 1 минуту"
    ]
  }
];

const DEFAULT_ORDERS = [
  {
    id: "ORD-2026-104",
    createdAt: "23.10.2026, 14:20",
    customerName: "Алексей Демидов",
    customerPhone: "+375 (29) 312-45-67",
    city: "г. Гродно",
    deliveryMethod: "Европочта (Отделение №14, ул. Советская 18)",
    paymentMethod: "Оплата при получении (наложенный платеж)",
    status: "shipped",
    trackingNumber: "BY0492817492",
    totalByn: 394.00,
    comment: "Просьба хорошо упаковать коробку со смесителем.",
    items: [
      { id: "prd-101", title: "Смеситель для кухни 3-в-1 под фильтр питьевой воды Graphit Pro", price: 345.00, qty: 1 },
      { id: "prd-105", title: "Встраиваемый дозатор для жидкого мыла и моющего средства (Металл)", price: 49.00, qty: 1 }
    ]
  },
  {
    id: "ORD-2026-105",
    createdAt: "23.10.2026, 17:45",
    customerName: "Марина Савицкая",
    customerPhone: "+375 (44) 780-11-23",
    city: "г. Минск",
    deliveryMethod: "Самовывоз из магазина (ТЦ СтройЭкспо)",
    paymentMethod: "ЕРИП (после подтверждения наличия)",
    status: "new",
    trackingNumber: "",
    totalByn: 378.00,
    comment: "Заберу завтра после 16:00 смеситель и ополаскиватель для стаканов.",
    items: [
      { id: "prd-102", title: "Смеситель кухонный с выдвижной лейкой и режимом «Водопад» SmartFlow", price: 289.00, qty: 1 },
      { id: "prd-112", title: "Автоматический ополаскиватель стаканов и бокалов в мойку JetGlass Pro", price: 89.00, qty: 1 }
    ]
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_STORE_SETTINGS,
    DEFAULT_PRODUCTS,
    DEFAULT_ORDERS
  };
}
