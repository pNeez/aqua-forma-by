/**
 * Серверная часть (Backend API + База данных + Авторизация) магазина AQUAFORMA.BY
 * Стек: Node.js + Express + серверная БД (database.json) с защитой Админ-панели и Личного кабинета
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DEFAULT_STORE_SETTINGS, DEFAULT_PRODUCTS, DEFAULT_ORDERS } = require("./data.js");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "database.json");
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || "2026"; // Секретный пароль/PIN для входа дяди в админку

// Активные сессии администратора в памяти сервера
const activeAdminTokens = new Set();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

// Нормализация телефона для сравнения (+375293124567 -> 375293124567)
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

// Загрузка и автоматическое первичное заполнение серверной базы данных
function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error("Ошибка чтения database.json, пересоздаем базу:", e);
    }
  }

  const initialDb = {
    adminPin: DEFAULT_ADMIN_PIN,
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

function saveDatabase(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// Инициализируем базу сразу при старте сервера
loadDatabase();

// Middleware проверки авторизации администратора (дяди)
function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || !activeAdminTokens.has(token)) {
    return res.status(401).json({ ok: false, error: "Требуется вход администратора (неверный или истекший токен)" });
  }
  next();
}

// Отправка уведомления в Telegram с сервера
async function notifyTelegramServer(settings, order) {
  const token = process.env.TELEGRAM_BOT_TOKEN || settings?.telegramBotToken;
  const chatId = process.env.TELEGRAM_CHAT_ID || settings?.telegramChatId;
  if (!token || !chatId) return;

  const itemsText = order.items
    .map(i => `• ${i.title} (${i.qty} шт.) — ${(i.price * i.qty).toFixed(2)} BYN`)
    .join("\n");

  const text =
    `🚰 *Новый заказ на сайте ${settings?.brandName || "AQUAFORMA.BY"}*\n` +
    `*Заказ:* ${order.id}\n` +
    `*Клиент:* ${order.customerName}\n` +
    `*Телефон:* ${order.customerPhone}\n` +
    `*Город:* ${order.city}\n` +
    `*Доставка:* ${order.deliveryMethod}\n` +
    `*Оплата:* ${order.paymentMethod}\n\n` +
    `*Состав заказа:*\n${itemsText}\n\n` +
    `💰 *Итого:* ${Number(order.totalByn).toFixed(2)} BYN`;

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

// 1. Публичное состояние магазина (только товары и публичные реквизиты, БЕЗ чужих заказов и секретных токенов!)
app.get("/api/state", (req, res) => {
  const db = loadDatabase();
  const publicSettings = { ...(db.settings || DEFAULT_STORE_SETTINGS) };
  delete publicSettings.telegramBotToken;

  res.json({
    ok: true,
    products: db.products,
    settings: publicSettings
  });
});

// 2. Вход / регистрация покупателя в Личном кабинете (по номеру телефона)
app.post("/api/customer/auth", (req, res) => {
  const { phone, name, city, address } = req.body;
  const digits = normalizePhone(phone);
  if (digits.length < 7) {
    return res.status(400).json({ ok: false, error: "Введите корректный номер телефона" });
  }

  const db = loadDatabase();
  db.customers = db.customers || [];
  let customer = db.customers.find(c => c.phoneDigits === digits);

  if (!customer) {
    customer = {
      phone: phone.trim(),
      phoneDigits: digits,
      name: (name || "Покупатель").trim(),
      city: (city || "г. Минск").trim(),
      address: (address || "").trim()
    };
    db.customers.push(customer);
    saveDatabase(db);
  } else if (name || city || address) {
    if (name) customer.name = name.trim();
    if (city) customer.city = city.trim();
    if (address !== undefined) customer.address = address.trim();
    saveDatabase(db);
  }

  // Возвращаем только заказы этого конкретного покупателя!
  const myOrders = (db.orders || []).filter(o => normalizePhone(o.customerPhone) === digits);
  res.json({
    ok: true,
    customer,
    orders: myOrders
  });
});

// 3. Авторизация администратора (дяди) по паролю/PIN-коду
app.post("/api/admin/login", (req, res) => {
  const { pin } = req.body;
  const db = loadDatabase();
  const expectedPin = String(process.env.ADMIN_PIN || db.adminPin || DEFAULT_ADMIN_PIN);

  if (String(pin || "").trim() === expectedPin) {
    const token = crypto.randomBytes(24).toString("hex");
    activeAdminTokens.add(token);
    return res.json({
      ok: true,
      token,
      orders: db.orders || [],
      settings: db.settings || DEFAULT_STORE_SETTINGS
    });
  }
  return res.status(401).json({ ok: false, error: "Неверный пароль администратора" });
});

// 4. Получение всех заказов и полных настроек (ТОЛЬКО для авторизованного администратора)
app.get("/api/admin/data", requireAdmin, (req, res) => {
  const db = loadDatabase();
  res.json({
    ok: true,
    orders: db.orders || [],
    products: db.products || [],
    settings: db.settings || DEFAULT_STORE_SETTINGS
  });
});

// 5. Смена пароля администратора из админки
app.post("/api/admin/change-pin", requireAdmin, (req, res) => {
  const { newPin } = req.body;
  if (!newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ ok: false, error: "Пароль должен содержать минимум 4 символа" });
  }
  const db = loadDatabase();
  db.adminPin = String(newPin).trim();
  saveDatabase(db);
  res.json({ ok: true });
});

// 6. Создать новый заказ покупателя (публичный эндпоинт для корзины)
app.post("/api/orders", async (req, res) => {
  const db = loadDatabase();
  const order = req.body;

  if (!order || !order.customerName || !order.customerPhone) {
    return res.status(400).json({ ok: false, error: "Заполните имя и телефон" });
  }

  // Списываем остатки со склада на сервере
  if (Array.isArray(db.products) && Array.isArray(order.items)) {
    order.items.forEach(item => {
      const prod = db.products.find(p => p.id === item.id);
      if (prod && prod.inStock >= item.qty) {
        prod.inStock -= item.qty;
      }
    });
  }

  // Сохраняем/обновляем профиль покупателя в базе
  const digits = normalizePhone(order.customerPhone);
  db.customers = db.customers || [];
  const existingCust = db.customers.find(c => c.phoneDigits === digits);
  if (!existingCust) {
    db.customers.push({
      phone: order.customerPhone,
      phoneDigits: digits,
      name: order.customerName,
      city: order.city || "",
      address: order.deliveryMethod || ""
    });
  }

  db.orders = db.orders || [];
  db.orders.unshift(order);
  saveDatabase(db);

  // Отправляем уведомление дяде в Telegram
  await notifyTelegramServer(db.settings, order);

  res.json({ ok: true, order, products: db.products });
});

// 7. Обновить статус или трек-номер Европочты заказа (ЗАЩИЩЕНО: только Админ)
app.patch("/api/orders/:id", requireAdmin, (req, res) => {
  const db = loadDatabase();
  const order = (db.orders || []).find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ ok: false, error: "Заказ не найден" });
  }

  if (req.body.status !== undefined) order.status = req.body.status;
  if (req.body.trackingNumber !== undefined) order.trackingNumber = req.body.trackingNumber;

  saveDatabase(db);
  res.json({ ok: true, order });
});

// 8. Сохранить / обновить каталог товаров (ЗАЩИЩЕНО: только Админ)
app.put("/api/products", requireAdmin, (req, res) => {
  const db = loadDatabase();
  if (Array.isArray(req.body.products)) {
    db.products = req.body.products;
    saveDatabase(db);
  }
  res.json({ ok: true, products: db.products });
});

// 9. Сохранить настройки магазина (ЗАЩИЩЕНО: только Админ)
app.put("/api/settings", requireAdmin, (req, res) => {
  const db = loadDatabase();
  db.settings = { ...(db.settings || {}), ...req.body };
  saveDatabase(db);
  res.json({ ok: true, settings: db.settings });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚰 Сервер AQUAFORMA.BY запущен: http://localhost:${PORT}`);
  console.log(`🔐 Пароль входа в Админ-панель по умолчанию: ${DEFAULT_ADMIN_PIN}`);
  console.log(`====================================================`);
});
