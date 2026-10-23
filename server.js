/**
 * Серверная часть (Backend API) магазина AQUAFORMA.BY
 * Стек: Node.js + Express + файловая БД (легко переносится на любой хостинг РБ или Render/Railway)
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "database.json");
const ADMIN_PIN = process.env.ADMIN_PIN || "1234"; // Пин-код дяди для входа в админку

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

// Инициализация серверной базы данных
function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch (e) {
      console.error("Ошибка чтения database.json, создаем новую базу:", e);
    }
  }
  const initialDb = {
    products: null, // Заполняется при первой синхронизации из стартового каталога
    orders: [],
    settings: null
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), "utf-8");
  return initialDb;
}

function saveDatabase(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// Отправка уведомления в Telegram с сервера (токен скрыт на бэкенде)
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

// 1. Получить состояние магазина (товары, настройки, заказы)
app.get("/api/state", (req, res) => {
  const db = loadDatabase();
  res.json({
    ok: true,
    products: db.products,
    orders: db.orders,
    settings: db.settings
  });
});

// 2. Инициализация дефолтных данных при первом запуске сервера
app.post("/api/init", (req, res) => {
  const db = loadDatabase();
  if (!db.products && req.body.products) db.products = req.body.products;
  if ((!db.orders || db.orders.length === 0) && req.body.orders) db.orders = req.body.orders;
  if (!db.settings && req.body.settings) db.settings = req.body.settings;
  saveDatabase(db);
  res.json({ ok: true, db });
});

// 3. Проверка PIN-кода администратора
app.post("/api/admin/login", (req, res) => {
  const { pin } = req.body;
  if (String(pin) === String(ADMIN_PIN)) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Неверный PIN-код администратора" });
});

// 4. Создать новый заказ покупателя
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

  db.orders = db.orders || [];
  db.orders.unshift(order);
  saveDatabase(db);

  // Отправляем уведомление дяде в Telegram
  await notifyTelegramServer(db.settings, order);

  res.json({ ok: true, order, products: db.products });
});

// 5. Обновить статус или трек-номер Европочты заказа (Админка)
app.patch("/api/orders/:id", (req, res) => {
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

// 6. Сохранить / обновить каталог товаров (Админка)
app.put("/api/products", (req, res) => {
  const db = loadDatabase();
  if (Array.isArray(req.body.products)) {
    db.products = req.body.products;
    saveDatabase(db);
  }
  res.json({ ok: true, products: db.products });
});

// 7. Сохранить настройки магазина (ИП, bePaid, ЕРИП, Telegram)
app.put("/api/settings", (req, res) => {
  const db = loadDatabase();
  db.settings = { ...(db.settings || {}), ...req.body };
  saveDatabase(db);
  res.json({ ok: true, settings: db.settings });
});

// 8. Подготовленный эндпоинт для создания платежной сессии bePaid / ЕРИП (Беларусь)
app.post("/api/payment/bepaid-session", (req, res) => {
  const db = loadDatabase();
  const { orderId, amountByn, description } = req.body;
  const amountKopecks = Math.round(Number(amountByn) * 100);

  // Структура реального запроса к API checkout.bepaid.by/ctp/api/checkouts
  const bepaidPayload = {
    checkout: {
      test: true,
      transaction_type: "payment",
      attempts: 3,
      settings: {
        success_url: `${req.protocol}://${req.get("host")}/?payment=success&order=${orderId}`,
        decline_url: `${req.protocol}://${req.get("host")}/?payment=decline&order=${orderId}`,
        language: "ru"
      },
      order: {
        currency: "BYN",
        amount: amountKopecks,
        description: description || `Оплата заказа №${orderId}`,
        tracking_id: orderId
      }
    }
  };

  res.json({
    ok: true,
    shopId: db.settings?.bepaidShopId || "38104",
    eripServiceCode: db.settings?.eripServiceCode || "4458921",
    bepaidPayload
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚰 Сервер AQUAFORMA.BY запущен: http://localhost:${PORT}`);
  console.log(`🔑 PIN-код админ-панели по умолчанию: ${ADMIN_PIN}`);
  console.log(`====================================================`);
});
