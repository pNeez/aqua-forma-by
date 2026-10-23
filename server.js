/**
 * Защищенный Backend-сервер магазина AQUAFORMA.BY (Версия 2.0)
 * - Поддержка реляционной СУБД PostgreSQL (через DATABASE_URL) + авто-резерв на локальное хранилище
 * - 100% защита от SQL-инъекций (строго параметризованные запросы $1, $2)
 * - Защита от подмены цен (серверный пересчет корзины и комплектной скидки 10%)
 * - Защита от XSS (санитизация всех входных строк + защитные HTTP-заголовки)
 * - Криптографическое хеширование пароля (scrypt + соль + timingSafeEqual)
 * - Защита от подбора пароля Brute-Force (Rate Limiter по IP на вход в админку)
 * - Автоматический YML/XML фид товаров для Kufar и Каталога Onliner (/api/feed.xml)
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { DEFAULT_STORE_SETTINGS, DEFAULT_PRODUCTS, DEFAULT_ORDERS } = require("./data.js");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "database.json");
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || "2026";

// Подключение к PostgreSQL, если задана переменная окружения DATABASE_URL (Render Postgres / Neon / Supabase)
const usePostgres = Boolean(process.env.DATABASE_URL);
const pgPool = usePostgres
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;

// Сессии администратора (токен -> время истечения)
const activeAdminSessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

// Защита от брутфорса пароля админки (IP -> { count, lockUntil })
const loginRateLimits = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 15 * 60 * 1000; // 15 минут блокировки после 5 неверных попыток

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "8mb" }));

// Защитные HTTP-заголовки (Security Headers)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(express.static(__dirname));

// ==================== УТИЛИТЫ БЕЗОПАСНОСТИ (XSS, ТЕЛЕФОН, SCRYPT ХЕШ) ====================

function sanitizeText(input, maxLen = 500) {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/[<>]/g, ch => (ch === "<" ? "‹" : "›"))
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, maxLen);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(0, 15);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, keyHex] = storedHash.split(":");
  const keyBuf = Buffer.from(keyHex, "hex");
  const derivedBuf = crypto.scryptSync(String(password), salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

// ==================== СЛОЙ БАЗЫ ДАННЫХ (POSTGRESQL С ЗАЩИТОЙ ОТ SQLi + FALLBACK) ====================

async function initDatabase() {
  if (usePostgres) {
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS store_kv (
          key VARCHAR(64) PRIMARY KEY,
          val JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS orders_table (
          id VARCHAR(40) PRIMARY KEY,
          customer_phone_digits VARCHAR(20) NOT NULL,
          order_data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders_table (customer_phone_digits);
        CREATE TABLE IF NOT EXISTS customers_table (
          phone_digits VARCHAR(20) PRIMARY KEY,
          customer_data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Проверяем, есть ли уже товары в PostgreSQL
      const prodCheck = await pgPool.query("SELECT val FROM store_kv WHERE key = $1", ["products"]);
      if (prodCheck.rowCount === 0) {
        await pgPool.query("INSERT INTO store_kv (key, val) VALUES ($1, $2)", [
          "products",
          JSON.stringify(DEFAULT_PRODUCTS)
        ]);
      }

      const setCheck = await pgPool.query("SELECT val FROM store_kv WHERE key = $1", ["settings"]);
      if (setCheck.rowCount === 0) {
        await pgPool.query("INSERT INTO store_kv (key, val) VALUES ($1, $2)", [
          "settings",
          JSON.stringify(DEFAULT_STORE_SETTINGS)
        ]);
      }

      const pinCheck = await pgPool.query("SELECT val FROM store_kv WHERE key = $1", ["admin_auth"]);
      if (pinCheck.rowCount === 0) {
        await pgPool.query("INSERT INTO store_kv (key, val) VALUES ($1, $2)", [
          "admin_auth",
          JSON.stringify({ passwordHash: hashPassword(DEFAULT_ADMIN_PIN) })
        ]);
      }

      const ordCheck = await pgPool.query("SELECT COUNT(*)::int AS cnt FROM orders_table");
      if (ordCheck.rows[0].cnt === 0) {
        for (const ord of DEFAULT_ORDERS) {
          await pgPool.query(
            "INSERT INTO orders_table (id, customer_phone_digits, order_data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
            [ord.id, normalizePhone(ord.customerPhone), JSON.stringify(ord)]
          );
        }
      }

      console.log("✅ Реляционная СУБД PostgreSQL успешно подключена и проверена");
      return;
    } catch (err) {
      console.error("Ошибка инициализации PostgreSQL, переключаемся на локальную БД:", err.message);
    }
  }

  // Локальная БД (если DATABASE_URL еще не задан)
  loadLocalDb();
}

function loadLocalDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        if (!parsed.adminPasswordHash) {
          parsed.adminPasswordHash = hashPassword(parsed.adminPin || DEFAULT_ADMIN_PIN);
          delete parsed.adminPin;
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), "utf-8");
        }
        return parsed;
      }
    } catch (e) {}
  }

  const initialDb = {
    adminPasswordHash: hashPassword(DEFAULT_ADMIN_PIN),
    products: DEFAULT_PRODUCTS,
    orders: DEFAULT_ORDERS,
    settings: DEFAULT_STORE_SETTINGS,
    customers: [
      {
        phone: "+375 (29) 312-45-67",
        phoneDigits: "375293124567",
        name: "Алексей Демидов",
        city: "г. Гродно",
        address: "Отделение Европочты №14, ул. Советская 18"
      }
    ]
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), "utf-8");
  return initialDb;
}

function saveLocalDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// Универсальные методы чтения/записи (работают и с PostgreSQL через Prepared Statements $1/$2, и с локальной БД)
async function dbGetProducts() {
  if (usePostgres) {
    const r = await pgPool.query("SELECT val FROM store_kv WHERE key = $1", ["products"]);
    return r.rowCount ? r.rows[0].val : DEFAULT_PRODUCTS;
  }
  return loadLocalDb().products;
}

async function dbSaveProducts(products) {
  if (usePostgres) {
    await pgPool.query(
      "INSERT INTO store_kv (key, val, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = NOW()",
      ["products", JSON.stringify(products)]
    );
    return;
  }
  const db = loadLocalDb();
  db.products = products;
  saveLocalDb(db);
}

async function dbGetSettings() {
  if (usePostgres) {
    const r = await pgPool.query("SELECT val FROM store_kv WHERE key = $1", ["settings"]);
    return r.rowCount ? r.rows[0].val : DEFAULT_STORE_SETTINGS;
  }
  return loadLocalDb().settings;
}

async function dbSaveSettings(settings) {
  if (usePostgres) {
    await pgPool.query(
      "INSERT INTO store_kv (key, val, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = NOW()",
      ["settings", JSON.stringify(settings)]
    );
    return;
  }
  const db = loadLocalDb();
  db.settings = settings;
  saveLocalDb(db);
}

async function dbGetAdminHash() {
  if (process.env.ADMIN_PIN) {
    return hashPassword(process.env.ADMIN_PIN);
  }
  if (usePostgres) {
    const r = await pgPool.query("SELECT val FROM store_kv WHERE key = $1", ["admin_auth"]);
    return r.rowCount ? r.rows[0].val.passwordHash : hashPassword(DEFAULT_ADMIN_PIN);
  }
  return loadLocalDb().adminPasswordHash;
}

async function dbSaveAdminHash(newHash) {
  if (usePostgres) {
    await pgPool.query(
      "INSERT INTO store_kv (key, val, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = NOW()",
      ["admin_auth", JSON.stringify({ passwordHash: newHash })]
    );
    return;
  }
  const db = loadLocalDb();
  db.adminPasswordHash = newHash;
  saveLocalDb(db);
}

async function dbGetAllOrders() {
  if (usePostgres) {
    const r = await pgPool.query("SELECT order_data FROM orders_table ORDER BY created_at DESC");
    return r.rows.map(row => row.order_data);
  }
  return loadLocalDb().orders || [];
}

async function dbGetOrdersByPhone(phoneDigits) {
  if (usePostgres) {
    const r = await pgPool.query(
      "SELECT order_data FROM orders_table WHERE customer_phone_digits = $1 ORDER BY created_at DESC",
      [phoneDigits]
    );
    return r.rows.map(row => row.order_data);
  }
  const all = loadLocalDb().orders || [];
  return all.filter(o => normalizePhone(o.customerPhone) === phoneDigits);
}

async function dbInsertOrder(order) {
  const digits = normalizePhone(order.customerPhone);
  if (usePostgres) {
    await pgPool.query(
      "INSERT INTO orders_table (id, customer_phone_digits, order_data, created_at) VALUES ($1, $2, $3, NOW())",
      [order.id, digits, JSON.stringify(order)]
    );
    return;
  }
  const db = loadLocalDb();
  db.orders = db.orders || [];
  db.orders.unshift(order);
  saveLocalDb(db);
}

async function dbUpdateOrder(orderId, status, trackingNumber) {
  if (usePostgres) {
    const r = await pgPool.query("SELECT order_data FROM orders_table WHERE id = $1", [orderId]);
    if (r.rowCount === 0) return null;
    const ord = r.rows[0].order_data;
    if (status !== undefined) ord.status = sanitizeText(status, 40);
    if (trackingNumber !== undefined) ord.trackingNumber = sanitizeText(trackingNumber, 60);
    await pgPool.query("UPDATE orders_table SET order_data = $1 WHERE id = $2", [JSON.stringify(ord), orderId]);
    return ord;
  }
  const db = loadLocalDb();
  const ord = (db.orders || []).find(o => o.id === orderId);
  if (!ord) return null;
  if (status !== undefined) ord.status = sanitizeText(status, 40);
  if (trackingNumber !== undefined) ord.trackingNumber = sanitizeText(trackingNumber, 60);
  saveLocalDb(db);
  return ord;
}

async function dbUpsertCustomer(cust) {
  const digits = normalizePhone(cust.phone);
  const cleanCust = {
    phone: sanitizeText(cust.phone, 30),
    phoneDigits: digits,
    name: sanitizeText(cust.name || "Покупатель", 80),
    city: sanitizeText(cust.city || "г. Минск", 80),
    address: sanitizeText(cust.address || "", 200)
  };

  if (usePostgres) {
    const existing = await pgPool.query("SELECT customer_data FROM customers_table WHERE phone_digits = $1", [digits]);
    const merged = existing.rowCount
      ? {
          ...existing.rows[0].customer_data,
          name: cleanCust.name || existing.rows[0].customer_data.name,
          city: cleanCust.city || existing.rows[0].customer_data.city,
          address: cleanCust.address || existing.rows[0].customer_data.address
        }
      : cleanCust;

    await pgPool.query(
      "INSERT INTO customers_table (phone_digits, customer_data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (phone_digits) DO UPDATE SET customer_data = EXCLUDED.customer_data, updated_at = NOW()",
      [digits, JSON.stringify(merged)]
    );
    return merged;
  }

  const db = loadLocalDb();
  db.customers = db.customers || [];
  let found = db.customers.find(c => c.phoneDigits === digits);
  if (!found) {
    db.customers.push(cleanCust);
    found = cleanCust;
  } else {
    if (cust.name) found.name = cleanCust.name;
    if (cust.city) found.city = cleanCust.city;
    if (cust.address !== undefined && cust.address !== "") found.address = cleanCust.address;
  }
  saveLocalDb(db);
  return found;
}

// Запускаем инициализацию БД
initDatabase();

// ==================== MIDDLEWARE АВТОРИЗАЦИИ И СЕССИЙ ====================

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || !activeAdminSessions.has(token)) {
    return res.status(401).json({ ok: false, error: "Требуется авторизация владельца" });
  }
  const expiresAt = activeAdminSessions.get(token);
  if (Date.now() > expiresAt) {
    activeAdminSessions.delete(token);
    return res.status(401).json({ ok: false, error: "Сессия администратора истекла, войдите снова" });
  }
  next();
}

async function notifyTelegramServer(settings, order) {
  const token = process.env.TELEGRAM_BOT_TOKEN || settings?.telegramBotToken;
  const chatId = process.env.TELEGRAM_CHAT_ID || settings?.telegramChatId;
  if (!token || !chatId) return;

  const itemsText = order.items
    .map(i => `• ${i.title} (${i.qty} шт.) — ${(i.price * i.qty).toFixed(2)} BYN`)
    .join("\n");

  const discountLine = order.discountByn > 0 ? `\n🎁 *Скидка за комплект (10%):* -${Number(order.discountByn).toFixed(2)} BYN` : "";

  const text =
    `🚰 *Новый заказ на сайте ${settings?.brandName || "AQUAFORMA.BY"}*\n` +
    `*Заказ:* ${order.id}\n` +
    `*Клиент:* ${order.customerName}\n` +
    `*Телефон:* ${order.customerPhone}\n` +
    `*Город:* ${order.city}\n` +
    `*Доставка:* ${order.deliveryMethod}\n` +
    `*Оплата:* ${order.paymentMethod}\n\n` +
    `*Состав заказа:*\n${itemsText}${discountLine}\n\n` +
    `💰 *Итого к оплате:* ${Number(order.totalByn).toFixed(2)} BYN`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown"
      })
    });
  } catch (err) {
    console.error("Ошибка отправки в Telegram:", err.message);
  }
}

// ==================== API МАРШРУТЫ ====================

// 1. Публичное состояние (без чужих заказов и без секретных токенов)
app.get("/api/state", async (req, res) => {
  try {
    const [products, settings] = await Promise.all([dbGetProducts(), dbGetSettings()]);
    const publicSettings = { ...settings };
    delete publicSettings.telegramBotToken;

    res.json({
      ok: true,
      dbEngine: usePostgres ? "PostgreSQL (Защищено)" : "Built-in DB (Защищено)",
      products,
      settings: publicSettings
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Ошибка чтения базы данных" });
  }
});

// 2. Вход покупателя в Личный кабинет по номеру телефона
app.post("/api/customer/auth", async (req, res) => {
  try {
    const digits = normalizePhone(req.body.phone);
    if (digits.length < 7) {
      return res.status(400).json({ ok: false, error: "Введите корректный номер телефона" });
    }

    const customer = await dbUpsertCustomer(req.body);
    const myOrders = await dbGetOrdersByPhone(digits);

    res.json({
      ok: true,
      customer,
      orders: myOrders
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Ошибка авторизации покупателя" });
  }
});

// 3. Вход владельца в Админ-панель (с защитой от Brute-Force и проверкой scrypt-хеша)
app.post("/api/admin/login", async (req, res) => {
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const rateRecord = loginRateLimits.get(clientIp) || { count: 0, lockUntil: 0 };

  if (Date.now() < rateRecord.lockUntil) {
    const minsLeft = Math.ceil((rateRecord.lockUntil - Date.now()) / 60000);
    return res.status(429).json({
      ok: false,
      error: `Слишком много неверных попыток входа. Повторите через ${minsLeft} мин.`
    });
  }

  const pin = String(req.body.pin || "").trim();
  const storedHash = await dbGetAdminHash();

  if (verifyPassword(pin, storedHash)) {
    loginRateLimits.delete(clientIp);
    const token = crypto.randomBytes(32).toString("hex");
    activeAdminSessions.set(token, Date.now() + SESSION_TTL_MS);

    const [orders, settings, products] = await Promise.all([dbGetAllOrders(), dbGetSettings(), dbGetProducts()]);
    return res.json({
      ok: true,
      token,
      dbEngine: usePostgres ? "PostgreSQL (SSL)" : "Built-in Server DB",
      orders,
      products,
      settings
    });
  }

  // Увеличиваем счетчик неудачных попыток
  rateRecord.count += 1;
  if (rateRecord.count >= MAX_LOGIN_ATTEMPTS) {
    rateRecord.lockUntil = Date.now() + LOCKOUT_TIME_MS;
  }
  loginRateLimits.set(clientIp, rateRecord);

  const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - rateRecord.count);
  return res.status(401).json({
    ok: false,
    error: attemptsLeft > 0 ? `Неверный пароль (осталось попыток: ${attemptsLeft})` : "Доступ временно заблокирован на 15 минут"
  });
});

// 4. Получение всех данных для Админ-панели
app.get("/api/admin/data", requireAdmin, async (req, res) => {
  const [orders, products, settings] = await Promise.all([dbGetAllOrders(), dbGetProducts(), dbGetSettings()]);
  res.json({
    ok: true,
    dbEngine: usePostgres ? "PostgreSQL (SSL)" : "Built-in Server DB",
    orders,
    products,
    settings
  });
});

// 5. Смена пароля владельца (сохраняется в виде крипто-хеша scrypt)
app.post("/api/admin/change-pin", requireAdmin, async (req, res) => {
  const newPin = String(req.body.newPin || "").trim();
  if (newPin.length < 4 || newPin.length > 64) {
    return res.status(400).json({ ok: false, error: "Пароль должен содержать от 4 до 64 символов" });
  }
  await dbSaveAdminHash(hashPassword(newPin));
  res.json({ ok: true });
});

// 6. Создание заказа с СЕРВЕРНЫМ ПЕРЕСЧЕТОМ ЦЕН (защита от Price Tampering) и защитой от XSS
app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    const customerName = sanitizeText(body.customerName, 80);
    const customerPhone = sanitizeText(body.customerPhone, 30);
    const city = sanitizeText(body.city, 80);
    const deliveryMethod = sanitizeText(body.deliveryMethod, 220);
    const paymentMethod = sanitizeText(body.paymentMethod, 120);
    const comment = sanitizeText(body.comment, 400);

    if (!customerName || normalizePhone(customerPhone).length < 7 || !city) {
      return res.status(400).json({ ok: false, error: "Укажите корректные Имя, Телефон и Город" });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ ok: false, error: "Корзина пуста" });
    }

    const products = await dbGetProducts();
    const verifiedItems = [];
    let hasFaucet = false;
    let hasAccessory = false;

    for (const rawItem of body.items) {
      const dbProd = products.find(p => p.id === String(rawItem.id));
      if (!dbProd) continue;
      const qty = Math.max(1, Math.min(99, parseInt(rawItem.qty, 10) || 1));

      if (dbProd.category === "accessories") hasAccessory = true;
      else hasFaucet = true;

      // Берем цену СТРОГО из серверной базы данных, игнорируя присланную из браузера
      verifiedItems.push({
        id: dbProd.id,
        sku: dbProd.sku,
        title: dbProd.title,
        price: Number(dbProd.price),
        qty
      });

      if (dbProd.inStock >= qty) {
        dbProd.inStock -= qty;
      }
    }

    if (verifiedItems.length === 0) {
      return res.status(400).json({ ok: false, error: "Выбранные товары не найдены в базе" });
    }

    const subtotalByn = verifiedItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    // Скидка 10% за комплект (Смеситель + Дозатор/Аксессуар)
    const isBundle = hasFaucet && hasAccessory;
    const discountByn = isBundle ? Math.round(subtotalByn * 0.1 * 100) / 100 : 0;
    const totalByn = Math.round((subtotalByn - discountByn) * 100) / 100;

    const order = {
      id: `ORD-2026-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      customerName,
      customerPhone,
      city,
      deliveryMethod,
      paymentMethod,
      status: "new",
      trackingNumber: "",
      subtotalByn,
      discountByn,
      totalByn,
      comment,
      items: verifiedItems
    };

    await Promise.all([
      dbSaveProducts(products),
      dbInsertOrder(order),
      dbUpsertCustomer({ phone: customerPhone, name: customerName, city, address: deliveryMethod })
    ]);

    const settings = await dbGetSettings();
    await notifyTelegramServer(settings, order);

    res.json({ ok: true, order, products });
  } catch (err) {
    console.error("Ошибка создания заказа:", err);
    res.status(500).json({ ok: false, error: "Внутренняя ошибка сервера при создании заказа" });
  }
});

// 7. Обновление статуса и трек-номера Европочты (ТОЛЬКО Админ)
app.patch("/api/orders/:id", requireAdmin, async (req, res) => {
  const updated = await dbUpdateOrder(req.params.id, req.body.status, req.body.trackingNumber);
  if (!updated) {
    return res.status(404).json({ ok: false, error: "Заказ не найден" });
  }
  res.json({ ok: true, order: updated });
});

// 8. Сохранение каталога товаров с санитизацией полей (ТОЛЬКО Админ)
app.put("/api/products", requireAdmin, async (req, res) => {
  if (!Array.isArray(req.body.products)) {
    return res.status(400).json({ ok: false, error: "Некорректный список товаров" });
  }
  const cleanProducts = req.body.products.map(p => ({
    ...p,
    id: sanitizeText(p.id, 50),
    sku: sanitizeText(p.sku, 40),
    title: sanitizeText(p.title, 180),
    category: sanitizeText(p.category, 50),
    categoryLabel: sanitizeText(p.categoryLabel, 80),
    price: Math.max(0, Number(p.price) || 0),
    oldPrice: p.oldPrice ? Math.max(0, Number(p.oldPrice)) : null,
    inStock: Math.max(0, parseInt(p.inStock, 10) || 0),
    color: sanitizeText(p.color, 80),
    material: sanitizeText(p.material, 80),
    spoutType: sanitizeText(p.spoutType, 80),
    warranty: sanitizeText(p.warranty, 40),
    description: sanitizeText(p.description, 1000)
  }));

  await dbSaveProducts(cleanProducts);
  res.json({ ok: true, products: cleanProducts });
});

// 9. Сохранение настроек магазина (ТОЛЬКО Админ)
app.put("/api/settings", requireAdmin, async (req, res) => {
  const current = await dbGetSettings();
  const s = req.body || {};
  const updated = {
    ...current,
    brandName: sanitizeText(s.brandName || current.brandName, 60),
    phone: sanitizeText(s.phone || current.phone, 40),
    city: sanitizeText(s.city || current.city, 120),
    workHours: sanitizeText(s.workHours || current.workHours, 80),
    legalName: sanitizeText(s.legalName || current.legalName, 120),
    unp: sanitizeText(s.unp || current.unp, 30),
    regAuthority: sanitizeText(s.regAuthority || current.regAuthority, 150),
    onlinePaymentEnabled: Boolean(s.onlinePaymentEnabled),
    bepaidShopId: sanitizeText(s.bepaidShopId, 40),
    eripServiceCode: sanitizeText(s.eripServiceCode, 40),
    telegramBotToken: s.telegramBotToken ? String(s.telegramBotToken).trim() : current.telegramBotToken,
    telegramChatId: sanitizeText(s.telegramChatId, 40)
  };
  await dbSaveSettings(updated);
  res.json({ ok: true, settings: updated });
});

// 10. Автоматический XML/YML прайс-фид для Kufar и Каталога Onliner.by
app.get("/api/feed.xml", async (req, res) => {
  const [products, settings] = await Promise.all([dbGetProducts(), dbGetSettings()]);
  const hostUrl = `${req.protocol}://${req.get("host")}`;

  const offersXml = products
    .filter(p => p.inStock > 0)
    .map(
      p => `
      <offer id="${p.id}" available="true">
        <url>${hostUrl}/#${p.id}</url>
        <price>${Number(p.price).toFixed(2)}</price>
        <currencyId>BYN</currencyId>
        <categoryId>1</categoryId>
        <name>${p.title}</name>
        <vendorCode>${p.sku}</vendorCode>
        <description>${p.description}</description>
        <param name="Материал">${p.material}</param>
        <param name="Цвет">${p.color}</param>
        <param name="Гарантия">${p.warranty}</param>
      </offer>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${new Date().toISOString()}">
  <shop>
    <name>${settings.brandName}</name>
    <company>${settings.legalName} (УНП ${settings.unp})</company>
    <url>${hostUrl}</url>
    <currencies>
      <currency id="BYN" rate="1"/>
    </currencies>
    <categories>
      <category id="1">Кухонные смесители и аксессуары</category>
    </categories>
    <offers>${offersXml}
    </offers>
  </shop>
</yml_catalog>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚰 Сервер AQUAFORMA.BY v2.0 запущен: http://localhost:${PORT}`);
  console.log(`🗄 Режим БД: ${usePostgres ? "PostgreSQL (DATABASE_URL)" : "Встроенная серверная БД"}`);
  console.log(`🔐 Защита: Prepared Statements, Scrypt Hash, Rate Limiter, Anti-XSS`);
  console.log(`====================================================`);
});
