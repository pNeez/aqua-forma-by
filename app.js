// Главная логика интернет-магазина и админ-панели AQUAFORMA.BY

let state = {
  currentView: "catalog",
  activeCategory: "all",
  products: [],
  orders: [],
  cart: [],
  favorites: [],
  customerProfile: {
    name: "Алексей Демидов",
    phone: "+375 (29) 312-45-67",
    city: "г. Гродно",
    address: "Отделение Европочты №14 (ул. Советская, 18)"
  },
  settings: {},
  lastGeneratedReelsText: "",
  lastGeneratedVoiceText: ""
};

// Инициализация при загрузке
document.addEventListener("DOMContentLoaded", async () => {
  loadStateFromStorage();
  await syncWithServerOnBoot();
  applyStoreSettingsToUI();
  renderHeroShowcase();
  renderCatalog();
  updateBadges();
  populateCustomerProfileForm();
});

async function syncWithServerOnBoot() {
  if (window.location.protocol === "file:") return;
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = await res.json();
    if (!data.products || !data.settings) {
      // Первичная инициализация базы на сервере стартовым каталогом
      await fetch("/api/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: state.products,
          orders: state.orders,
          settings: state.settings
        })
      });
    } else {
      state.products = data.products;
      state.orders = data.orders || [];
      state.settings = data.settings;
    }
  } catch (e) {
    // Если открыто на статическом хостинге без Node.js, работаем через localStorage
  }
}

function loadStateFromStorage() {
  const savedProducts = localStorage.getItem("af_products_v2");
  state.products = savedProducts ? JSON.parse(savedProducts) : [...DEFAULT_PRODUCTS];

  const savedOrders = localStorage.getItem("af_orders_v2");
  state.orders = savedOrders ? JSON.parse(savedOrders) : [...DEFAULT_ORDERS];

  const savedCart = localStorage.getItem("af_cart_v2");
  state.cart = savedCart ? JSON.parse(savedCart) : [];

  const savedFavs = localStorage.getItem("af_favs_v2");
  state.favorites = savedFavs ? JSON.parse(savedFavs) : ["prd-101", "prd-102", "prd-112"];

  const savedProfile = localStorage.getItem("af_profile_v2");
  if (savedProfile) state.customerProfile = JSON.parse(savedProfile);

  const savedSettings = localStorage.getItem("af_settings_v2");
  state.settings = savedSettings ? JSON.parse(savedSettings) : { ...DEFAULT_STORE_SETTINGS };
}

function saveState() {
  localStorage.setItem("af_products_v2", JSON.stringify(state.products));
  localStorage.setItem("af_orders_v2", JSON.stringify(state.orders));
  localStorage.setItem("af_cart_v2", JSON.stringify(state.cart));
  localStorage.setItem("af_favs_v2", JSON.stringify(state.favorites));
  localStorage.setItem("af_profile_v2", JSON.stringify(state.customerProfile));
  localStorage.setItem("af_settings_v2", JSON.stringify(state.settings));
  updateBadges();

  // Если запущен серверный бэкенд (server.js), синхронизируем с серверной БД
  if (window.location.protocol !== "file:") {
    fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: state.products })
    }).catch(() => {});
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.settings)
    }).catch(() => {});
  }
}

function formatByn(amount) {
  return Number(amount).toFixed(2) + " BYN";
}

function showToast(message) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3400);
}

function applyStoreSettingsToUI() {
  const s = state.settings;
  document.getElementById("headerBrandName").textContent = s.brandName;
  document.getElementById("footerBrandName").textContent = s.brandName;
  document.getElementById("topAddress").textContent = s.city;
  document.getElementById("footerAddress").textContent = s.city;
  document.getElementById("topWorkHours").textContent = s.workHours;
  document.getElementById("topPhone").textContent = s.phone;
  document.getElementById("topPhone").href = "tel:" + s.phone.replace(/[^+\d]/g, "");
  document.getElementById("footerPhone").textContent = s.phone;

  document.querySelectorAll(".freeShipVal").forEach(el => {
    el.textContent = s.freeShippingThresholdByn || 250;
  });

  const modeNotice = s.onlinePaymentEnabled
    ? `Оплата заказов доступна онлайн банковскими картами РБ (Белкарт, Visa, Mastercard через систему bePaid, ID магазина ${s.bepaidShopId}), через систему «Расчет» (ЕРИП, код услуги ${s.eripServiceCode}), а также при получении.`
    : `Оформление заказов на сайте работает в режиме онлайн-витрины и предварительного бронирования для ИП. Оплата производится при получении товара (в пункте самовывоза, курьеру или наложенным платежом Европочты/Белпочты) либо через систему «Расчет» (ЕРИП) после подтверждения заказа менеджером.`;

  document.getElementById("footerLegalBlock").innerHTML = `
    <div style="color:#fff; font-weight:700; margin-bottom:4px;">Юридическая информация (Республика Беларусь):</div>
    <div><strong>Продавец:</strong> ${s.legalName}, УНП ${s.unp}. Зарегистрирован ${s.regAuthority}.</div>
    <div><strong>Адрес магазина / пункта самовывоза:</strong> ${s.city}. Режим работы: ${s.workHours}.</div>
    <div style="margin-top:6px; color:#D1D5DB;">${modeNotice} Цены указаны в белорусских рублях (BYN).</div>
  `;
}

function updateBadges() {
  const totalCartQty = state.cart.reduce((acc, item) => acc + item.qty, 0);
  document.getElementById("cartCountBadge").textContent = totalCartQty;
  document.getElementById("favCountBadge").textContent = state.favorites.length;
  document.getElementById("accountOrdersBadge").textContent = state.orders.length;
}

// Навигация между разделами
function switchView(viewName, subTab = null) {
  state.currentView = viewName;
  document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const navBtn = document.getElementById(`nav-${viewName}`);
  if (navBtn) navBtn.classList.add("active");

  const adminBtn = document.getElementById("nav-admin");
  if (viewName === "admin") {
    adminBtn.classList.add("active");
    renderAdminDashboard();
  } else {
    adminBtn.classList.remove("active");
  }

  if (viewName === "account") {
    renderCustomerAccount();
    if (subTab) switchAccountSubtab(subTab);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Флагманская карточка в Hero
function renderHeroShowcase() {
  const flagship = state.products.find(p => p.isHit) || state.products[0];
  if (!flagship) return;
  const container = document.getElementById("heroShowcaseCard");
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span class="badge badge-hit">★ ХИТ ПРОДАЖ В РБ</span>
      <span style="font-size:12px; color:#D1D5DB;">Арт: ${flagship.sku}</span>
    </div>
    <img src="${flagship.image}" alt="${flagship.title}" onclick="openProductModal('${flagship.id}')" style="cursor:pointer;" />
    <div style="font-weight:700; font-size:16px; margin-bottom:8px; cursor:pointer;" onclick="openProductModal('${flagship.id}')">
      ${flagship.title}
    </div>
    <div class="hero-showcase-meta">
      <div>
        <span style="font-size:22px; font-weight:800; color:var(--brass);">${formatByn(flagship.price)}</span>
        ${flagship.oldPrice ? `<span style="font-size:13px; color:#9CA3AF; text-decoration:line-through; margin-left:8px;">${formatByn(flagship.oldPrice)}</span>` : ""}
      </div>
      <button class="btn btn-primary btn-sm" onclick="addToCart('${flagship.id}')">В корзину</button>
    </div>
  `;
}

// Фильтрация по категории
function filterByCategory(cat) {
  state.activeCategory = cat;
  document.querySelectorAll("#categoryPills .cat-pill").forEach(pill => {
    pill.classList.toggle("active", pill.getAttribute("data-cat") === cat);
  });
  if (state.currentView !== "catalog") {
    switchView("catalog");
  }
  renderCatalog();
}

function resetFilters() {
  state.activeCategory = "all";
  document.querySelectorAll("#categoryPills .cat-pill").forEach(pill => {
    pill.classList.toggle("active", pill.getAttribute("data-cat") === "all");
  });
  document.getElementById("filterPriceMin").value = "";
  document.getElementById("filterPriceMax").value = "";
  document.getElementById("searchInput").value = "";
  document.getElementById("filterOnlyHits").checked = false;
  document.getElementById("filterOnlySale").checked = false;
  document.getElementById("filterInStock").checked = false;
  document.querySelectorAll(".filter-mat, .filter-color").forEach(cb => (cb.checked = false));
  renderCatalog();
}

// Рендер каталога
function renderCatalog() {
  const searchVal = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const minPrice = parseFloat(document.getElementById("filterPriceMin")?.value) || 0;
  const maxPrice = parseFloat(document.getElementById("filterPriceMax")?.value) || Infinity;
  const onlyHits = document.getElementById("filterOnlyHits")?.checked;
  const onlySale = document.getElementById("filterOnlySale")?.checked;
  const onlyStock = document.getElementById("filterInStock")?.checked;
  const sortBy = document.getElementById("sortSelect")?.value || "popular";

  const selectedMats = Array.from(document.querySelectorAll(".filter-mat:checked")).map(cb => cb.value.toLowerCase());
  const selectedColors = Array.from(document.querySelectorAll(".filter-color:checked")).map(cb => cb.value.toLowerCase());

  let filtered = state.products.filter(p => {
    if (state.activeCategory !== "all" && p.category !== state.activeCategory) return false;
    if (p.price < minPrice || p.price > maxPrice) return false;
    if (onlyHits && !p.isHit) return false;
    if (onlySale && !p.oldPrice) return false;
    if (onlyStock && p.inStock <= 0) return false;

    if (selectedMats.length > 0) {
      const matMatch = selectedMats.some(m => p.material.toLowerCase().includes(m));
      if (!matMatch) return false;
    }

    if (selectedColors.length > 0) {
      const colMatch = selectedColors.some(c => p.color.toLowerCase().includes(c));
      if (!colMatch) return false;
    }

    if (searchVal) {
      const hay = `${p.title} ${p.sku} ${p.color} ${p.material} ${p.spoutType} ${p.description}`.toLowerCase();
      if (!hay.includes(searchVal)) return false;
    }

    return true;
  });

  if (sortBy === "price-asc") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price-desc") {
    filtered.sort((a, b) => b.price - a.price);
  } else {
    filtered.sort((a, b) => Number(b.isHit) - Number(a.isHit));
  }

  document.getElementById("foundCountLabel").textContent = `Найдено: ${filtered.length}`;
  const grid = document.getElementById("productsGrid");

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="card-box" style="grid-column: 1 / -1; text-align:center; padding:48px 24px;">
        <h3 style="margin-bottom:8px;">По вашим фильтрам товаров не найдено</h3>
        <p style="color:var(--text-muted); margin-bottom:16px;">Попробуйте сбросить параметры фильтрации или изменить поисковый запрос.</p>
        <button class="btn btn-primary" onclick="resetFilters()">Показать все товары</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => renderProductCardHTML(p)).join("");
}

function renderProductCardHTML(p) {
  const isFav = state.favorites.includes(p.id);
  const inCartItem = state.cart.find(c => c.id === p.id);
  const fallback = p.fallbackSvg || "";
  return `
    <article class="product-card">
      <div class="product-img-wrap" onclick="openProductModal('${p.id}')">
        <img src="${p.image}" alt="${p.title}" loading="lazy" onerror="if(this.src!=='${fallback}'&&'${fallback}')this.src='${fallback}'" />
        <div class="product-badges">
          ${p.isHit ? `<span class="badge badge-hit">Хит продаж</span>` : ""}
          ${p.oldPrice ? `<span class="badge badge-sale">Выгода ${formatByn(p.oldPrice - p.price)}</span>` : ""}
          <span class="badge badge-stock">${p.inStock > 0 ? `✓ В наличии (${p.inStock} шт.)` : "Под заказ"}</span>
        </div>
        <button class="fav-btn ${isFav ? "active" : ""}" onclick="event.stopPropagation(); toggleFavorite('${p.id}')" title="В избранное">
          ${isFav ? "♥" : "♡"}
        </button>
      </div>

      <div class="product-body">
        <div class="product-meta">
          <span>${p.categoryLabel}</span>
          <span>Арт: ${p.sku}</span>
        </div>
        <h3 class="product-title" onclick="openProductModal('${p.id}')">${p.title}</h3>
        <div class="product-specs-mini">
          <span class="spec-chip">${p.material}</span>
          <span class="spec-chip">${p.color}</span>
          <span class="spec-chip">Гарантия ${p.warranty}</span>
        </div>

        <div class="product-footer">
          <div>
            ${p.oldPrice ? `<span class="price-old">${formatByn(p.oldPrice)}</span>` : ""}
            <span class="price-current">${formatByn(p.price)}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn ${inCartItem ? "btn-dark" : "btn-primary"} btn-sm" onclick="addToCart('${p.id}')">
              ${inCartItem ? `В корзине (${inCartItem.qty})` : "В корзину"}
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Избранное
function toggleFavorite(productId) {
  const idx = state.favorites.indexOf(productId);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    showToast("Удалено из избранного");
  } else {
    state.favorites.push(productId);
    showToast("Добавлено в избранное ♥");
  }
  saveState();
  renderCatalog();
  if (state.currentView === "account") renderCustomerAccount();
}

// Детальное окно товара
function openProductModal(productId) {
  const p = state.products.find(item => item.id === productId);
  if (!p) return;

  const content = document.getElementById("productModalContent");
  content.innerHTML = `
    <div class="modal-header">
      <div>
        <span style="font-size:12px; color:var(--text-muted); text-transform:uppercase;">${p.categoryLabel} • Артикул: ${p.sku}</span>
        <h2 style="font-size:22px; margin-top:4px;">${p.title}</h2>
      </div>
      <button class="close-btn" onclick="closeProductModal()">✕</button>
    </div>

    <div class="grid-2">
      <div>
        <img src="${p.image}" alt="${p.title}" style="width:100%; border-radius:12px; border:1px solid var(--border); margin-bottom:14px;" />
        <div style="background:var(--bg-main); padding:14px; border-radius:10px; font-size:13px;">
          <strong>🇧🇾 Доставка по Беларуси:</strong>
          <ul style="margin-top:6px; padding-left:18px; color:var(--text-muted);">
            <li>Самовывоз (${state.settings.city}) — сегодня, бесплатно</li>
            <li>Европочта до отделения по РБ — 1–3 дня (${p.price >= state.settings.freeShippingThresholdByn ? "<strong style='color:var(--success)'>Бесплатно!</strong>" : "6.50 BYN"})</li>
            <li>Официальный гарантийный талон: <strong>${p.warranty}</strong></li>
          </ul>
        </div>
      </div>

      <div>
        <div style="display:flex; align-items:baseline; gap:12px; margin-bottom:16px;">
          <span style="font-size:30px; font-weight:800;">${formatByn(p.price)}</span>
          ${p.oldPrice ? `<span style="font-size:16px; color:var(--text-muted); text-decoration:line-through;">${formatByn(p.oldPrice)}</span>` : ""}
          <span class="badge badge-stock" style="margin-left:auto;">В наличии: ${p.inStock} шт.</span>
        </div>

        <p style="color:var(--text-main); font-size:14px; margin-bottom:18px;">${p.description}</p>

        <div style="margin-bottom:18px;">
          <div style="font-weight:700; font-size:13px; text-transform:uppercase; margin-bottom:8px;">Характеристики модели:</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; background:var(--bg-main); padding:12px; border-radius:8px;">
            <div><span style="color:var(--text-muted);">Материал:</span> <strong>${p.material}</strong></div>
            <div><span style="color:var(--text-muted);">Цвет:</span> <strong>${p.color}</strong></div>
            <div><span style="color:var(--text-muted);">Тип излива:</span> <strong>${p.spoutType}</strong></div>
            <div><span style="color:var(--text-muted);">Гарантия:</span> <strong>${p.warranty}</strong></div>
          </div>
        </div>

        ${
          p.features && p.features.length
            ? `<div style="margin-bottom:22px;">
                <div style="font-weight:700; font-size:13px; text-transform:uppercase; margin-bottom:8px;">Преимущества и комплектация:</div>
                <ul style="padding-left:18px; font-size:13px; color:var(--text-muted); display:flex; flex-direction:column; gap:5px;">
                  ${p.features.map(f => `<li>${f}</li>`).join("")}
                </ul>
              </div>`
            : ""
        }

        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" style="flex:1;" onclick="addToCart('${p.id}'); closeProductModal(); openCartModal();">
            🛒 Купить сейчас
          </button>
          <button class="btn btn-dark" onclick="addToCart('${p.id}')">
            + В корзину
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("productModalBackdrop").classList.add("open");
}

function closeProductModal() {
  document.getElementById("productModalBackdrop").classList.remove("open");
}

// ==================== КОРЗИНА И ОФОРМЛЕНИЕ ЗАКАЗА ====================

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: product.id,
      title: product.title,
      sku: product.sku,
      price: product.price,
      image: product.image,
      qty: 1
    });
  }

  saveState();
  renderCatalog();
  showToast(`«${product.title}» добавлен в корзину`);
}

function changeCartQty(productId, delta) {
  const idx = state.cart.findIndex(item => item.id === productId);
  if (idx === -1) return;

  state.cart[idx].qty += delta;
  if (state.cart[idx].qty <= 0) {
    state.cart.splice(idx, 1);
  }
  saveState();
  renderCartModalContent();
  renderCatalog();
}

function openCartModal() {
  renderCartModalContent();
  document.getElementById("cartModalBackdrop").classList.add("open");
}

function closeCartModal() {
  document.getElementById("cartModalBackdrop").classList.remove("open");
}

function renderCartModalContent() {
  const container = document.getElementById("cartModalContent");

  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="modal-header">
        <h2>Корзина покупок</h2>
        <button class="close-btn" onclick="closeCartModal()">✕</button>
      </div>
      <div style="text-align:center; padding:40px 20px;">
        <div style="font-size:42px; margin-bottom:12px;">🛒</div>
        <h3 style="margin-bottom:8px;">Ваша корзина пока пуста</h3>
        <p style="color:var(--text-muted); margin-bottom:20px;">Выберите смеситель, кран для питьевой воды или дозатор в каталоге.</p>
        <button class="btn btn-primary" onclick="closeCartModal()">Перейти к товарам</button>
      </div>
    `;
    return;
  }

  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const freeThreshold = state.settings.freeShippingThresholdByn || 250;
  const shippingCost = subtotal >= freeThreshold ? 0 : 6.5;

  const onlinePayEnabled = state.settings.onlinePaymentEnabled;

  container.innerHTML = `
    <div class="modal-header">
      <h2>Оформление заказа (${state.cart.reduce((a, b) => a + b.qty, 0)} шт.)</h2>
      <button class="close-btn" onclick="closeCartModal()">✕</button>
    </div>

    <!-- Список товаров в корзине -->
    <div style="margin-bottom:22px; max-height:240px; overflow-y:auto; padding-right:4px;">
      ${state.cart
        .map(
          item => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 0; border-bottom:1px solid var(--border);">
          <img src="${item.image}" alt="" style="width:64px; height:52px; object-fit:cover; border-radius:8px;" />
          <div style="flex:1;">
            <div style="font-weight:700; font-size:14px;">${item.title}</div>
            <div style="font-size:12px; color:var(--text-muted);">Арт: ${item.sku} • ${formatByn(item.price)} за шт.</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-outline btn-sm" onclick="changeCartQty('${item.id}', -1)">−</button>
            <span style="font-weight:700; min-width:20px; text-align:center;">${item.qty}</span>
            <button class="btn btn-outline btn-sm" onclick="changeCartQty('${item.id}', 1)">+</button>
          </div>
          <div style="font-weight:800; min-width:95px; text-align:right;">
            ${formatByn(item.price * item.qty)}
          </div>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="grid-2">
      <div>
        <h3 style="font-size:16px; margin-bottom:12px;">1. Контактные данные и доставка по РБ</h3>
        <div class="form-group">
          <label class="form-label">Ваше Имя и Фамилия *</label>
          <input type="text" id="chkName" class="input-field" value="${state.customerProfile.name || ""}" placeholder="Иван Ковалев" />
        </div>
        <div class="form-group">
          <label class="form-label">Телефон белорусского оператора (+375) *</label>
          <input type="text" id="chkPhone" class="input-field" value="${state.customerProfile.phone || ""}" placeholder="+375 (29) 123-45-67" />
        </div>
        <div class="form-group">
          <label class="form-label">Город / Населенный пункт *</label>
          <input type="text" id="chkCity" class="input-field" value="${state.customerProfile.city || ""}" placeholder="г. Минск, Брест, Гродно..." />
        </div>
        <div class="form-group">
          <label class="form-label">Способ получения товара</label>
          <select id="chkDelivery" class="input-field">
            <option value="Европочта (до отделения по РБ)">📦 Европочта — до отделения (${shippingCost === 0 ? "Бесплатно" : "6.50 BYN"})</option>
            <option value="Самовывоз из магазина (${state.settings.city})">🏪 Самовывоз из магазина (${state.settings.city}) — Бесплатно</option>
            <option value="Белпочта (до отделения)">📮 Белпочта — по всей Беларуси</option>
            <option value="Курьер до двери">🚚 Курьерская доставка до двери</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Номер отделения Европочты или адрес доставки</label>
          <input type="text" id="chkAddress" class="input-field" value="${state.customerProfile.address || ""}" placeholder="Например: Отделение Европочты №14" />
        </div>
      </div>

      <div>
        <h3 style="font-size:16px; margin-bottom:12px;">2. Способ оплаты и подтверждение</h3>
        <div class="form-group">
          <label class="form-label">Выберите удобный способ оплаты</label>
          <select id="chkPayment" class="input-field">
            <option value="Оплата при получении (наличными / картой)">💵 При получении (осмотр товара перед оплатой)</option>
            <option value="ЕРИП (по номеру заказа после подтверждения)">🏦 Система «Расчет» (ЕРИП) — код услуги ${state.settings.eripServiceCode}</option>
            ${
              onlinePayEnabled
                ? `<option value="Онлайн-оплата картой (bePaid: Белкарт / Visa / MC)">💳 Онлайн-оплата картой на сайте (bePaid Эквайринг)</option>`
                : ""
            }
            <option value="Безналичный расчет (для юрлиц и ИП со счетом)">📄 Безналичный расчет по счету (для ИП и ООО)</option>
          </select>
        </div>

        ${
          !onlinePayEnabled
            ? `<div style="background:var(--bg-main); border-left:3px solid var(--brass); padding:12px; border-radius:6px; font-size:12px; color:var(--text-muted); margin-bottom:14px;">
                <strong>Режим безопасной сделки (для ИП):</strong> Вы не платите ничего прямо сейчас. Мы проверим товар на складе, перезвоним вам в течение 15 минут и отправим посылку либо забронируем в магазине.
              </div>`
            : `<div style="background:var(--success-bg); border-left:3px solid var(--success); padding:12px; border-radius:6px; font-size:12px; color:var(--success); margin-bottom:14px;">
                <strong>Активен онлайн-эквайринг bePaid (Shop ID ${state.settings.bepaidShopId}):</strong> доступна мгновенная оплата картами Белкарт, Visa, Mastercard и по QR-коду ЕРИП.
              </div>`
        }

        <div class="form-group">
          <label class="form-label">Комментарий к заказу (по желанию)</label>
          <textarea id="chkComment" class="input-field" rows="2" placeholder="Например: нужен ли переходник к фильтру воды?"></textarea>
        </div>

        <div style="background:var(--bg-main); padding:16px; border-radius:10px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:6px;">
            <span>Стоимость товаров:</span>
            <strong>${formatByn(subtotal)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px;">
            <span>Доставка по Беларуси:</span>
            <strong style="color:${shippingCost === 0 ? "var(--success)" : "inherit"}">
              ${shippingCost === 0 ? "Бесплатно (заказ от " + freeThreshold + " BYN)" : formatByn(shippingCost)}
            </strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:800; padding-top:10px; border-top:1px solid var(--border);">
            <span>Итого к оплате:</span>
            <span style="color:var(--brass-hover);">${formatByn(subtotal)}</span>
          </div>
        </div>

        <button class="btn btn-primary" style="width:100%; font-size:15px; padding:14px;" onclick="submitOrder()">
          ✓ Подтвердить и отправить заказ
        </button>
      </div>
    </div>
  `;
}

async function submitOrder() {
  const name = document.getElementById("chkName").value.trim();
  const phone = document.getElementById("chkPhone").value.trim();
  const city = document.getElementById("chkCity").value.trim();
  const delivery = document.getElementById("chkDelivery").value;
  const address = document.getElementById("chkAddress").value.trim();
  const payment = document.getElementById("chkPayment").value;
  const comment = document.getElementById("chkComment").value.trim();

  if (!name || !phone || !city) {
    showToast("Пожалуйста, укажите Имя, Телефон (+375...) и Город");
    return;
  }

  const totalByn = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const newOrderId = `ORD-2026-${Math.floor(100 + Math.random() * 900)}`;
  const nowStr = new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const newOrder = {
    id: newOrderId,
    createdAt: nowStr,
    customerName: name,
    customerPhone: phone,
    city: city,
    deliveryMethod: `${delivery}${address ? " (" + address + ")" : ""}`,
    paymentMethod: payment,
    status: "new",
    trackingNumber: "",
    totalByn: totalByn,
    comment: comment,
    items: state.cart.map(i => ({ id: i.id, title: i.title, price: i.price, qty: i.qty }))
  };

  // Уменьшаем остаток на складе
  newOrder.items.forEach(orderItem => {
    const prod = state.products.find(p => p.id === orderItem.id);
    if (prod && prod.inStock >= orderItem.qty) {
      prod.inStock -= orderItem.qty;
    }
  });

  // Сохраняем профиль клиента для следующих покупок
  state.customerProfile = { name, phone, city, address };
  state.orders.unshift(newOrder);
  state.cart = [];
  saveState();
  renderCatalog();

  // Отправка заказа на серверный бэкенд (если запущен server.js) или напрямую в Telegram
  if (window.location.protocol !== "file:") {
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrder)
    }).catch(() => {
      sendOrderToTelegram(newOrder);
    });
  } else {
    sendOrderToTelegram(newOrder);
  }

  // Показываем экран успешного заказа
  const container = document.getElementById("cartModalContent");
  container.innerHTML = `
    <div style="text-align:center; padding:32px 16px;">
      <div style="width:64px; height:64px; border-radius:50%; background:var(--success-bg); color:var(--success); font-size:32px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">✓</div>
      <h2 style="margin-bottom:8px;">Заказ №${newOrder.id} успешно принят!</h2>
      <p style="color:var(--text-muted); max-width:520px; margin:0 auto 20px;">
        Спасибо, <strong>${name}</strong>! Заказ уже отображается в вашем Личном кабинете и в Админ-панели магазина. Мы свяжемся с вами по номеру <strong>${phone}</strong>.
      </p>
      <div style="background:var(--bg-main); max-width:480px; margin:0 auto 24px; padding:16px; border-radius:10px; text-align:left; font-size:13px;">
        <div><strong>Сумма заказа:</strong> ${formatByn(newOrder.totalByn)}</div>
        <div><strong>Доставка:</strong> ${newOrder.deliveryMethod}</div>
        <div><strong>Способ оплаты:</strong> ${newOrder.paymentMethod}</div>
      </div>
      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="closeCartModal(); switchView('account', 'orders')">
          Перейти в Личный кабинет
        </button>
        <button class="btn btn-outline" onclick="closeCartModal()">
          Продолжить покупки
        </button>
      </div>
    </div>
  `;
}

// ==================== ЛИЧНЫЙ КАБИНЕТ ПОКУПАТЕЛЯ ====================

function switchAccountSubtab(tab) {
  document.getElementById("account-sub-orders").style.display = tab === "orders" ? "block" : "none";
  document.getElementById("account-sub-favorites").style.display = tab === "favorites" ? "block" : "none";
  document.getElementById("account-sub-profile").style.display = tab === "profile" ? "block" : "none";
  renderCustomerAccount();
}

function populateCustomerProfileForm() {
  document.getElementById("profName").value = state.customerProfile.name || "";
  document.getElementById("profPhone").value = state.customerProfile.phone || "";
  document.getElementById("profCity").value = state.customerProfile.city || "";
  document.getElementById("profAddress").value = state.customerProfile.address || "";
}

function saveCustomerProfile() {
  state.customerProfile = {
    name: document.getElementById("profName").value.trim(),
    phone: document.getElementById("profPhone").value.trim(),
    city: document.getElementById("profCity").value.trim(),
    address: document.getElementById("profAddress").value.trim()
  };
  saveState();
  showToast("Контактные данные покупателя сохранены!");
}

function getStatusInfo(status) {
  const map = {
    new: { label: "Новый заказ (Ожидает звонка)", cls: "status-new" },
    confirmed: { label: "Подтвержден / Комплектуется", cls: "status-confirmed" },
    shipped: { label: "Отправлен Европочтой / В пути", cls: "status-shipped" },
    completed: { label: "Выполнен / Получен", cls: "status-completed" },
    cancelled: { label: "Отменен", cls: "status-cancelled" }
  };
  return map[status] || map.new;
}

function renderCustomerAccount() {
  populateCustomerProfileForm();

  // Список заказов
  const ordersContainer = document.getElementById("customerOrdersList");
  if (state.orders.length === 0) {
    ordersContainer.innerHTML = `<div class="card-box">У вас пока нет оформленных заказов.</div>`;
  } else {
    ordersContainer.innerHTML = state.orders
      .map(o => {
        const st = getStatusInfo(o.status);
        return `
        <div class="card-box">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-bottom:12px; border-bottom:1px solid var(--border); margin-bottom:14px;">
            <div>
              <span style="font-weight:800; font-size:17px;">Заказ №${o.id}</span>
              <span style="font-size:13px; color:var(--text-muted); margin-left:10px;">от ${o.createdAt}</span>
            </div>
            <span class="status-pill ${st.cls}">${st.label}</span>
          </div>

          <div class="grid-2" style="margin-bottom:14px; font-size:14px;">
            <div>
              <div><strong>Получатель:</strong> ${o.customerName} (${o.customerPhone})</div>
              <div><strong>Доставка:</strong> ${o.city}, ${o.deliveryMethod}</div>
              <div><strong>Оплата:</strong> ${o.paymentMethod}</div>
              ${
                o.trackingNumber
                  ? `<div style="margin-top:6px; color:var(--brass-hover); font-weight:700;">📦 Трек-номер посылки (Европочта/Белпочта): ${o.trackingNumber}</div>`
                  : ""
              }
            </div>
            <div>
              <div style="font-weight:700; margin-bottom:6px;">Состав заказа:</div>
              ${o.items
                .map(
                  i =>
                    `<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                      <span>${i.title} × ${i.qty} шт.</span>
                      <strong>${formatByn(i.price * i.qty)}</strong>
                    </div>`
                )
                .join("")}
              <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:800; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                <span>Итого:</span>
                <span>${formatByn(o.totalByn)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // Избранное
  const favGrid = document.getElementById("favoritesGrid");
  const favProducts = state.products.filter(p => state.favorites.includes(p.id));
  if (favProducts.length === 0) {
    favGrid.innerHTML = `<p style="color:var(--text-muted);">Вы еще не добавили товары в избранное (нажмите на сердечко ♡ на карточке смесителя).</p>`;
  } else {
    favGrid.innerHTML = favProducts.map(p => renderProductCardHTML(p)).join("");
  }
}

// ==================== АДМИН-ПАНЕЛЬ ДЯДИ ====================

function switchAdminTab(tabName) {
  ["orders", "products", "reels", "settings"].forEach(t => {
    document.getElementById(`admin-pane-${t}`).style.display = t === tabName ? "block" : "none";
    document.getElementById(`adm-tab-${t}`).classList.toggle("active", t === tabName);
  });
  renderAdminDashboard();
}

function renderAdminDashboard() {
  // KPI карточки
  const totalRevenue = state.orders
    .filter(o => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.totalByn), 0);
  const newOrdersCount = state.orders.filter(o => o.status === "new").length;

  document.getElementById("adminKpiCards").innerHTML = `
    <div class="card-box" style="margin-bottom:0;">
      <div style="font-size:13px; color:var(--text-muted);">Всего заказов</div>
      <div style="font-size:28px; font-weight:800; margin-top:4px;">${state.orders.length} <span style="font-size:14px; color:var(--warning);">(${newOrdersCount} новых)</span></div>
    </div>
    <div class="card-box" style="margin-bottom:0;">
      <div style="font-size:13px; color:var(--text-muted);">Сумма заказов (BYN)</div>
      <div style="font-size:28px; font-weight:800; color:var(--success); margin-top:4px;">${formatByn(totalRevenue)}</div>
    </div>
    <div class="card-box" style="margin-bottom:0;">
      <div style="font-size:13px; color:var(--text-muted);">Товаров в каталоге</div>
      <div style="font-size:28px; font-weight:800; margin-top:4px;">${state.products.length} поз.</div>
    </div>
  `;

  // Рендер заказов в админке
  const ordersTable = document.getElementById("adminOrdersTable");
  ordersTable.innerHTML = state.orders
    .map(o => {
      const st = getStatusInfo(o.status);
      return `
      <div style="border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:14px; background:var(--bg-main);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
          <div>
            <strong>${o.id}</strong> • <span style="font-size:13px; color:var(--text-muted);">${o.createdAt}</span>
            <span class="status-pill ${st.cls}" style="margin-left:10px;">${st.label}</span>
          </div>
          <div style="font-size:18px; font-weight:800;">${formatByn(o.totalByn)}</div>
        </div>

        <div class="grid-2" style="font-size:13px; margin-bottom:12px;">
          <div>
            <div><strong>Клиент:</strong> ${o.customerName} — <a href="tel:${o.customerPhone}">${o.customerPhone}</a></div>
            <div><strong>Доставка:</strong> ${o.city}, ${o.deliveryMethod}</div>
            <div><strong>Оплата:</strong> ${o.paymentMethod}</div>
            ${o.comment ? `<div><strong>Комментарий:</strong> ${o.comment}</div>` : ""}
          </div>
          <div>
            <strong>Товары:</strong>
            <ul style="padding-left:18px; margin-top:4px;">
              ${o.items.map(i => `<li>${i.title} — ${i.qty} шт. (${formatByn(i.price * i.qty)})</li>`).join("")}
            </ul>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--border);">
          <label style="font-size:12px; font-weight:700;">Статус:</label>
          <select class="input-field" style="width:auto; padding:6px 10px;" onchange="updateOrderStatus('${o.id}', this.value)">
            <option value="new" ${o.status === "new" ? "selected" : ""}>Новый заказ</option>
            <option value="confirmed" ${o.status === "confirmed" ? "selected" : ""}>Подтвержден</option>
            <option value="shipped" ${o.status === "shipped" ? "selected" : ""}>Отправлен Европочтой</option>
            <option value="completed" ${o.status === "completed" ? "selected" : ""}>Выполнен</option>
            <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>Отменен</option>
          </select>

          <input
            type="text"
            class="input-field"
            style="width:220px; padding:6px 10px;"
            placeholder="Трек-номер Европочты (BY...)"
            value="${o.trackingNumber || ""}"
            onchange="updateOrderTracking('${o.id}', this.value)"
          />
          <span style="font-size:12px; color:var(--text-muted);">Изменения сразу видны клиенту в Личном кабинете</span>
        </div>
      </div>
    `;
    })
    .join("");

  // Рендер списка товаров в админке
  document.getElementById("adminProductsCount").textContent = state.products.length;
  const prodList = document.getElementById("adminProductsList");
  prodList.innerHTML = state.products
    .map(
      p => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:260px;">
          <img src="${p.image}" alt="" style="width:60px; height:48px; object-fit:cover; border-radius:6px;" />
          <div>
            <div style="font-weight:700; font-size:14px;">${p.title}</div>
            <div style="font-size:12px; color:var(--text-muted);">Арт: ${p.sku} • ${p.categoryLabel} • Остаток: <strong>${p.inStock} шт.</strong></div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-weight:800; font-size:16px;">${formatByn(p.price)}</span>
          <button class="btn btn-outline btn-sm" onclick="openProductEditor('${p.id}')">✏️ Изменить</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="deleteProduct('${p.id}')">Удалить</button>
        </div>
      </div>
    `
    )
    .join("");

  // Заполнение селекта товаров для генератора Reels/TikTok
  const reelsSel = document.getElementById("reelsProductSelect");
  if (reelsSel) {
    const currentVal = reelsSel.value;
    reelsSel.innerHTML = state.products
      .map(p => `<option value="${p.id}">${p.title} (${formatByn(p.price)})</option>`)
      .join("");
    if (currentVal && state.products.some(p => p.id === currentVal)) {
      reelsSel.value = currentVal;
    }
    generateReelsContent();
  }

  // Заполнение настроек магазина
  const s = state.settings;
  document.getElementById("setBrandName").value = s.brandName || "";
  document.getElementById("setPhone").value = s.phone || "";
  document.getElementById("setCity").value = s.city || "";
  document.getElementById("setWorkHours").value = s.workHours || "";
  document.getElementById("setLegalName").value = s.legalName || "";
  document.getElementById("setUnp").value = s.unp || "";
  document.getElementById("setRegAuthority").value = s.regAuthority || "";
  document.getElementById("setOnlinePaymentEnabled").checked = Boolean(s.onlinePaymentEnabled);
  document.getElementById("setBepaidShopId").value = s.bepaidShopId || "";
  document.getElementById("setEripCode").value = s.eripServiceCode || "";
  document.getElementById("setTgToken").value = s.telegramBotToken || "";
  document.getElementById("setTgChatId").value = s.telegramChatId || "";
}

function updateOrderStatus(orderId, newStatus) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = newStatus;
  saveState();
  if (window.location.protocol !== "file:") {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    }).catch(() => {});
  }
  renderAdminDashboard();
  showToast(`Статус заказа ${orderId} изменен!`);
}

function updateOrderTracking(orderId, tracking) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.trackingNumber = tracking.trim();
  saveState();
  if (window.location.protocol !== "file:") {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: order.trackingNumber })
    }).catch(() => {});
  }
  showToast(`Трек-номер для заказа ${orderId} сохранен`);
}

// Добавление и редактирование товара в Админ-панели
function openProductEditor(productId = null) {
  const existing = productId ? state.products.find(p => p.id === productId) : null;
  const modal = document.getElementById("editorModalContent");

  modal.innerHTML = `
    <div class="modal-header">
      <h2>${existing ? "Редактировать товар" : "Добавить новый товар в каталог"}</h2>
      <button class="close-btn" onclick="closeProductEditor()">✕</button>
    </div>

    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Название товара *</label>
        <input type="text" id="edtTitle" class="input-field" value="${existing ? existing.title : ""}" placeholder="Смеситель для кухни..." />
      </div>
      <div class="form-group">
        <label class="form-label">Артикул (SKU) *</label>
        <input type="text" id="edtSku" class="input-field" value="${existing ? existing.sku : "AF-" + Math.floor(500 + Math.random() * 400)}" />
      </div>
    </div>

    <div class="grid-3">
      <div class="form-group">
        <label class="form-label">Цена (BYN) *</label>
        <input type="number" step="0.01" id="edtPrice" class="input-field" value="${existing ? existing.price : "220.00"}" />
      </div>
      <div class="form-group">
        <label class="form-label">Старая цена до скидки (BYN)</label>
        <input type="number" step="0.01" id="edtOldPrice" class="input-field" value="${existing && existing.oldPrice ? existing.oldPrice : ""}" placeholder="Необязательно" />
      </div>
      <div class="form-group">
        <label class="form-label">Остаток на складе (шт.)</label>
        <input type="number" id="edtStock" class="input-field" value="${existing ? existing.inStock : "10"}" />
      </div>
    </div>

    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Категория</label>
        <select id="edtCategory" class="input-field">
          <option value="faucets-filter" ${existing?.category === "faucets-filter" ? "selected" : ""}>Смесители 3-в-1 (под фильтр)</option>
          <option value="faucets-pullout" ${existing?.category === "faucets-pullout" ? "selected" : ""}>С выдвижной лейкой</option>
          <option value="faucets-flex" ${existing?.category === "faucets-flex" ? "selected" : ""}>С гибким изливом</option>
          <option value="faucets-classic" ${existing?.category === "faucets-classic" ? "selected" : ""}>Классические высокие</option>
          <option value="drinking-taps" ${existing?.category === "drinking-taps" ? "selected" : ""}>Краны питьевой воды</option>
          <option value="accessories" ${existing?.category === "accessories" ? "selected" : ""}>Дозаторы и аксессуары</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Материал корпуса</label>
        <input type="text" id="edtMaterial" class="input-field" value="${existing ? existing.material : "Латунь CW617N"}" />
      </div>
    </div>

    <div class="grid-3">
      <div class="form-group">
        <label class="form-label">Цвет / Покрытие</label>
        <input type="text" id="edtColor" class="input-field" value="${existing ? existing.color : "Черный матовый / Графит"}" />
      </div>
      <div class="form-group">
        <label class="form-label">Тип излива / Назначение</label>
        <input type="text" id="edtSpout" class="input-field" value="${existing ? existing.spoutType : "Поворотный 360°"}" />
      </div>
      <div class="form-group">
        <label class="form-label">Гарантия</label>
        <input type="text" id="edtWarranty" class="input-field" value="${existing ? existing.warranty : "5 лет"}" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Фото товара (ссылка URL или загрузите файл с компьютера)</label>
      <input type="text" id="edtImage" class="input-field" value="${existing ? existing.image : ""}" placeholder="Оставьте пустым для автоматической генерации карточки или выберите фото ниже" style="margin-bottom:8px;" />
      <input type="file" accept="image/*" onchange="handleProductImageUpload(event)" style="font-size:13px;" />
    </div>

    <div class="form-group">
      <label class="form-label">Описание товара</label>
      <textarea id="edtDesc" class="input-field" rows="3">${existing ? existing.description : "Надежный смеситель для кухни с плавным ходом керамического картриджа и аэратором с экономией воды."}</textarea>
    </div>

    <label class="filter-option" style="margin-bottom:18px;">
      <input type="checkbox" id="edtHit" ${existing?.isHit ? "checked" : ""} /> Отметить бейджем «Хит продаж»
    </label>

    <div style="display:flex; gap:12px;">
      <button class="btn btn-primary" onclick="saveProductFromEditor('${existing ? existing.id : ""}')">Сохранить товар</button>
      <button class="btn btn-outline" onclick="closeProductEditor()">Отмена</button>
    </div>
  `;

  document.getElementById("editorModalBackdrop").classList.add("open");
}

function handleProductImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("edtImage").value = e.target.result;
    showToast("Фотография загружена!");
  };
  reader.readAsDataURL(file);
}

function closeProductEditor() {
  document.getElementById("editorModalBackdrop").classList.remove("open");
}

function saveProductFromEditor(existingId) {
  const title = document.getElementById("edtTitle").value.trim();
  const sku = document.getElementById("edtSku").value.trim();
  const price = parseFloat(document.getElementById("edtPrice").value) || 0;
  const oldPriceVal = parseFloat(document.getElementById("edtOldPrice").value);
  const inStock = parseInt(document.getElementById("edtStock").value, 10) || 0;
  const category = document.getElementById("edtCategory").value;
  const categoryText = document.getElementById("edtCategory").selectedOptions[0].text;
  const material = document.getElementById("edtMaterial").value.trim();
  const color = document.getElementById("edtColor").value.trim();
  const spoutType = document.getElementById("edtSpout").value.trim();
  const warranty = document.getElementById("edtWarranty").value.trim();
  let image = document.getElementById("edtImage").value.trim();
  const description = document.getElementById("edtDesc").value.trim();
  const isHit = document.getElementById("edtHit").checked;

  if (!title || price <= 0) {
    showToast("Укажите название и цену товара в BYN");
    return;
  }

  if (!image) {
    image = createProductSvg(title.slice(0, 26), "#252930", "#C59B5F", sku);
  }

  if (existingId) {
    const idx = state.products.findIndex(p => p.id === existingId);
    if (idx >= 0) {
      state.products[idx] = {
        ...state.products[idx],
        title,
        sku,
        price,
        oldPrice: oldPriceVal > price ? oldPriceVal : null,
        inStock,
        category,
        categoryLabel: categoryText,
        material,
        color,
        spoutType,
        warranty,
        image,
        description,
        isHit
      };
    }
    showToast("Товар обновлен!");
  } else {
    state.products.unshift({
      id: "prd-" + Date.now(),
      title,
      sku,
      price,
      oldPrice: oldPriceVal > price ? oldPriceVal : null,
      inStock,
      category,
      categoryLabel: categoryText,
      material,
      color,
      spoutType,
      warranty,
      image,
      description,
      isHit,
      features: [
        `Материал корпуса: ${material}`,
        `Покрытие: ${color}`,
        `Официальная гарантия ${warranty}`
      ]
    });
    showToast("Новый товар добавлен в каталог!");
  }

  saveState();
  closeProductEditor();
  renderCatalog();
  renderHeroShowcase();
  renderAdminDashboard();
}

function deleteProduct(productId) {
  state.products = state.products.filter(p => p.id !== productId);
  saveState();
  renderCatalog();
  renderAdminDashboard();
  showToast("Товар удален из каталога");
}

function exportCatalogJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.products, null, 2));
  const dlAnchor = document.createElement("a");
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", "aquaforma-catalog-by.json");
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
}

// ==================== СТУДИЯ АВТО-ГЕНЕРАЦИИ REELS / TIKTOK ====================

function generateReelsContent() {
  const prodId = document.getElementById("reelsProductSelect")?.value;
  const tpl = document.getElementById("reelsTemplateSelect")?.value || "asmr";
  const ctaType = document.getElementById("reelsCtaSelect")?.value || "europost";

  const product = state.products.find(p => p.id === prodId) || state.products[0];
  if (!product) return;

  const ctaLine =
    ctaType === "europost"
      ? `Отправляем Европочтой по всей Беларуси без предоплаты! Переходите на сайт ${state.settings.brandName} в шапке профиля.`
      : ctaType === "plus"
      ? `Напишите «+» в комментариях, и мы отправим вам живое видео и точную цену в Директ!`
      : `Приезжайте посмотреть вживую (${state.settings.city}) или заказывайте на нашем сайте с гарантией ${product.warranty}!`;

  let hookTitle = "";
  let shots = [];
  let voiceover = "";

  if (tpl === "asmr") {
    hookTitle = `Почему этот смеситель выбирают 8 из 10 покупателей в Беларуси?`;
    shots = [
      `<strong>0–3 сек (Хук):</strong> Крупный план включения воды и переключения режимов струи на модели «${product.title}». На экране крупная плашка: «Кран, который заменит 3 устройства на кухне».`,
      `<strong>3–8 сек (Детали):</strong> Показываем пальцем покрытие (${product.color}) и плавный ход ручки. Подпись: «Корпус: ${product.material} — не облазит и не боится налета».`,
      `<strong>8–12 сек (Функция):</strong> Демонстрируем главную фишку: ${product.spoutType}.`,
      `<strong>12–15 сек (Оффер РБ):</strong> Показываем коробку с комплектом подводки + цену <strong>${formatByn(product.price)}</strong>.`
    ];
    voiceover = `Посмотрите, насколько продуман этот кухонный смеситель. Модель ${product.sku} выполнена из материала ${product.material} в цвете ${product.color}. Главная фишка — ${product.spoutType}. Никаких брызг по столешнице и гарантия ${product.warranty}. Цена сейчас — ${product.price} белорусских рублей. ${ctaLine}`;
  } else if (tpl === "compare") {
    hookTitle = `Не покупайте смеситель на кухню, пока не проверите ЭТО!`;
    shots = [
      `<strong>0–3 сек (Хук):</strong> В левой руке легкий дешевый кран, в правой — наш «${product.title}». Кладем на кухонные весы прямо на витрине.`,
      `<strong>3–9 сек (Польза):</strong> Объясняем разницу: «Дешевый силумин трескается через год, а здесь — ${product.material} и надежный керамический картридж».`,
      `<strong>9–15 сек (Цена и призыв):</strong> Крупный план излива (${product.spoutType}) и плашка: «Цена в РБ: ${formatByn(product.price)} • Гарантия ${product.warranty}».`
    ];
    voiceover = `Как за 5 секунд отличить хороший кухонный кран от одноразового? Просто возьмите его в руку! Наш смеситель из ${product.material} тяжелый, с защитным покрытием ${product.color}. Стоит ${product.price} рублей и служит годами. ${ctaLine}`;
  } else if (tpl === "problem") {
    hookTitle = `Знакома проблема: высокие кастрюли не помещаются в мойку и кругом брызги?`;
    shots = [
      `<strong>0–3 сек:</strong> Показываем неудобный низкий кран, затем резкий переход на «${product.title}».`,
      `<strong>3–10 сек:</strong> Показываем, как удобно мыть противень и набирать воду благодаря функции «${product.spoutType}».`,
      `<strong>10–15 сек:</strong> Плашка с артикулом ${product.sku}, ценой ${formatByn(product.price)} и доставкой Европочтой.`
    ];
    voiceover = `Надоело, что на кухне вечно разбрызгивается вода и неудобно мыть большую посуду? Решение — смеситель с функцией ${product.spoutType} в цвете ${product.color}. Установка за 10 минут без сантехника. Цена — ${product.price} рублей. ${ctaLine}`;
  } else {
    hookTitle = `Собираем идеальный комплект для кухни в один цвет!`;
    shots = [
      `<strong>0–4 сек:</strong> Выкладываем на стол смеситель «${product.title}» + встраиваемый металлический дозатор для мыла в цвет ${product.color}.`,
      `<strong>4–10 сек:</strong> Показываем, как они идеально совпадают по оттенку и избавляют от пластиковых бутылок на мойке.`,
      `<strong>10–15 сек:</strong> Цена смесителя ${formatByn(product.price)} + бесплатная доставка по Беларуси от ${state.settings.freeShippingThresholdByn} BYN.`
    ];
    voiceover = `Хотите, чтобы мойка на кухне выглядела дорого и аккуратно? Подберите смеситель и встраиваемый дозатор точно в один тон — ${product.color}. Материал ${product.material}, гарантия ${product.warranty}. Смеситель стоит ${product.price} рублей. ${ctaLine}`;
  }

  const hashtags = `#смесительдлякухни #сантехникабеларусь #ремонтминск #кухняминск #смесительминск #европочта #товарыдлядомарб #краннакухню`;

  state.lastGeneratedVoiceText = voiceover;
  state.lastGeneratedReelsText = `ЗАГОЛОВОК (ХУК):\n${hookTitle}\n\nПОСЕКУНДНЫЙ ПЛАН СЪЕМКИ:\n${shots.map(s => s.replace(/<[^>]+>/g, "")).join("\n")}\n\nТЕКСТ ОЗВУЧКИ:\n${voiceover}\n\nОПИСАНИЕ ПОСТА:\n${product.title} (Арт. ${product.sku})\nЦена: ${formatByn(product.price)}\nМатериал: ${product.material}\nГарантия: ${product.warranty}\n${ctaLine}\n\n${hashtags}`;

  document.getElementById("reelsGeneratedOutput").innerHTML = `
    <div style="background:var(--bg-main); padding:16px; border-radius:10px; border:1px solid var(--border); font-size:13px;">
      <div style="font-weight:800; font-size:15px; color:var(--brass-hover); margin-bottom:10px;">🔥 Хук (первые 2 секунды): «${hookTitle}»</div>
      <div style="margin-bottom:12px;">
        <div style="font-weight:700; margin-bottom:6px;">📹 Раскадровка (что снять телефоном на витрине):</div>
        <ul style="padding-left:18px; display:flex; flex-direction:column; gap:6px;">
          ${shots.map(s => `<li>${s}</li>`).join("")}
        </ul>
      </div>
      <div style="margin-bottom:12px; background:#fff; padding:10px; border-radius:8px; border:1px solid var(--border);">
        <div style="font-weight:700; margin-bottom:4px;">🎙 Текст для голосовой озвучки (или ElevenLabs / CapCut):</div>
        <div style="color:var(--text-main); font-style:italic;">«${voiceover}»</div>
      </div>
      <div>
        <div style="font-weight:700; margin-bottom:4px;">#️⃣ Хэштеги для TikTok / Instagram РБ:</div>
        <div style="color:var(--text-muted); font-size:12px;">${hashtags}</div>
      </div>
    </div>
  `;

  // Рендерим превью на экране телефона 9:16
  document.getElementById("phonePreviewBox").innerHTML = `
    <img src="${product.image}" class="phone-bg-img" alt="" />
    <div class="phone-overlay">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; opacity:0.9;">
        <span style="background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:99px;">@${state.settings.brandName.toLowerCase()}</span>
        <span style="background:var(--brass); color:#111; font-weight:800; padding:3px 8px; border-radius:99px;">Арт: ${product.sku}</span>
      </div>

      <div style="text-align:center; padding:0 6px;">
        <div style="background:rgba(20,22,25,0.88); border:1px solid var(--brass); padding:10px 12px; border-radius:10px; font-weight:800; font-size:14px; line-height:1.3; margin-bottom:10px; box-shadow:0 8px 20px rgba(0,0,0,0.4);">
          ${hookTitle}
        </div>
        <div style="display:inline-block; background:var(--brass); color:#111; font-weight:900; font-size:16px; padding:6px 14px; border-radius:8px;">
          Цена: ${formatByn(product.price)}
        </div>
      </div>

      <div style="font-size:11px; background:rgba(0,0,0,0.65); padding:10px; border-radius:10px; line-height:1.4;">
        <div style="font-weight:700; color:var(--brass); margin-bottom:2px;">${product.title}</div>
        <div>✓ ${product.material} • Гарантия ${product.warranty}</div>
        <div>🇧🇾 Доставка Европочтой по всей РБ</div>
      </div>
    </div>
  `;
}

function copyReelsScript() {
  if (!state.lastGeneratedReelsText) return;
  navigator.clipboard.writeText(state.lastGeneratedReelsText);
  showToast("Готовый сценарий, озвучка и хэштеги скопированы в буфер обмена!");
}

function speakReelsVoiceover() {
  if (!("speechSynthesis" in window)) {
    showToast("Ваш браузер не поддерживает голосовой синтез");
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(state.lastGeneratedVoiceText);
  utter.lang = "ru-RU";
  utter.rate = 1.05;
  window.speechSynthesis.speak(utter);
  showToast("🔊 Воспроизводится демо-озвучка ролика...");
}

// ==================== НАСТРОЙКИ МАГАЗИНА И TELEGRAM ====================

function saveStoreSettings() {
  state.settings = {
    ...state.settings,
    brandName: document.getElementById("setBrandName").value.trim() || "AQUAFORMA.BY",
    phone: document.getElementById("setPhone").value.trim(),
    city: document.getElementById("setCity").value.trim(),
    workHours: document.getElementById("setWorkHours").value.trim(),
    legalName: document.getElementById("setLegalName").value.trim(),
    unp: document.getElementById("setUnp").value.trim(),
    regAuthority: document.getElementById("setRegAuthority").value.trim(),
    onlinePaymentEnabled: document.getElementById("setOnlinePaymentEnabled").checked,
    bepaidShopId: document.getElementById("setBepaidShopId").value.trim(),
    eripServiceCode: document.getElementById("setEripCode").value.trim(),
    telegramBotToken: document.getElementById("setTgToken").value.trim(),
    telegramChatId: document.getElementById("setTgChatId").value.trim()
  };

  saveState();
  applyStoreSettingsToUI();
  showToast("Настройки магазина и реквизиты РБ сохранены!");
}

async function sendOrderToTelegram(order) {
  const token = state.settings.telegramBotToken;
  const chatId = state.settings.telegramChatId;
  if (!token || !chatId) return;

  const itemsText = order.items.map(i => `• ${i.title} (${i.qty} шт.) — ${formatByn(i.price * i.qty)}`).join("\n");
  const msg = `🚰 *Новый заказ на сайте ${state.settings.brandName}*\n*Номер:* ${order.id}\n*Клиент:* ${order.customerName}\n*Телефон:* ${order.customerPhone}\n*Город:* ${order.city}\n*Доставка:* ${order.deliveryMethod}\n*Оплата:* ${order.paymentMethod}\n\n*Товары:*\n${itemsText}\n\n💰 *Итого:* ${formatByn(order.totalByn)}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: "Markdown"
      })
    });
  } catch (e) {
    console.warn("Ошибка отправки в Telegram:", e);
  }
}

async function testTelegramNotification() {
  saveStoreSettings();
  const token = state.settings.telegramBotToken;
  const chatId = state.settings.telegramChatId;
  if (!token || !chatId) {
    showToast("Сначала укажите Bot Token и Chat ID в полях выше");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ Тестовое уведомление с сайта ${state.settings.brandName}! Бот успешно подключен для приема заказов.`
      })
    });
    if (res.ok) {
      showToast("Тестовое сообщение отправлено в ваш Telegram!");
    } else {
      showToast("Ошибка Telegram API: проверьте правильность токена и Chat ID");
    }
  } catch (e) {
    showToast("Не удалось связаться с сервером Telegram");
  }
}
