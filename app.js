// Главная логика интернет-магазина, базы данных и защищенной админ-панели AQUAFORMA.BY

let state = {
  currentView: "catalog",
  activeCategory: "all",
  products: [],
  orders: [], // Для админа — все заказы; для покупателя — только его собственные заказы
  cart: [],
  favorites: [],
  isCustomerLoggedIn: false,
  customerProfile: {
    name: "",
    phone: "",
    city: "г. Минск",
    address: ""
  },
  isAdminLoggedIn: false,
  adminToken: "",
  settings: {},
  lastGeneratedReelsText: "",
  lastGeneratedVoiceText: ""
};

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Инициализация при загрузке
document.addEventListener("DOMContentLoaded", async () => {
  loadStateFromStorage();
  await syncPublicStateFromServer();

  // Если сохранена сессия покупателя — подгружаем его заказы с сервера
  if (state.isCustomerLoggedIn && state.customerProfile.phone) {
    await refreshCustomerOrdersFromServer();
  }

  // Если сохранен токен администратора — проверяем его на сервере
  if (state.adminToken) {
    await verifySavedAdminToken();
  }

  applyStoreSettingsToUI();
  renderHeroShowcase();
  renderCatalog();
  updateBadges();
  handleInitialHash();
});

window.addEventListener("hashchange", handleInitialHash);

function handleInitialHash() {
  const hash = (window.location.hash || "").replace("#", "").trim();
  if (["catalog", "delivery", "account", "admin"].includes(hash)) {
    switchView(hash);
  }
}

async function syncPublicStateFromServer() {
  if (window.location.protocol === "file:") return;
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.products) && data.products.length > 0) {
      state.products = data.products;
    }
    if (data.settings) {
      state.settings = { ...state.settings, ...data.settings };
    }
  } catch (e) {
    // Офлайн или статический режим
  }
}

async function verifySavedAdminToken() {
  if (window.location.protocol === "file:") {
    state.isAdminLoggedIn = true;
    document.getElementById("nav-admin").style.display = "inline-flex";
    return;
  }
  try {
    const res = await fetch("/api/admin/data", {
      headers: { "x-admin-token": state.adminToken }
    });
    if (res.ok) {
      const data = await res.json();
      state.isAdminLoggedIn = true;
      state.orders = data.orders || [];
      state.products = data.products || state.products;
      state.settings = data.settings || state.settings;
      document.getElementById("nav-admin").style.display = "inline-flex";
    } else {
      state.isAdminLoggedIn = false;
      state.adminToken = "";
      localStorage.removeItem("af_admin_token");
      document.getElementById("nav-admin").style.display = "none";
    }
  } catch (e) {
    // Игнорируем ошибку сети
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
  state.favorites = savedFavs ? JSON.parse(savedFavs) : ["prd-101", "prd-102"];

  const savedProfile = localStorage.getItem("af_profile_v2");
  if (savedProfile) {
    state.customerProfile = JSON.parse(savedProfile);
    if (state.customerProfile.phone) {
      state.isCustomerLoggedIn = true;
    }
  }

  const savedAdminToken = localStorage.getItem("af_admin_token");
  if (savedAdminToken) {
    state.adminToken = savedAdminToken;
  }

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
}

async function saveAdminProductsToServer() {
  saveState();
  if (window.location.protocol !== "file:" && state.adminToken) {
    try {
      await fetch("/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": state.adminToken
        },
        body: JSON.stringify({ products: state.products })
      });
    } catch (e) {}
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
  document.getElementById("topPhone").textContent = "📞 " + s.phone;
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

function getCustomerOrders() {
  if (!state.isCustomerLoggedIn || !state.customerProfile.phone) return [];
  const myDigits = normalizePhoneDigits(state.customerProfile.phone);
  return state.orders.filter(o => normalizePhoneDigits(o.customerPhone) === myDigits);
}

function updateBadges() {
  const totalCartQty = state.cart.reduce((acc, item) => acc + item.qty, 0);
  document.getElementById("cartCountBadge").textContent = totalCartQty;
  const mobCartEl = document.getElementById("mobCartCount");
  if (mobCartEl) mobCartEl.textContent = totalCartQty;

  document.getElementById("favCountBadge").textContent = state.favorites.length;
  const myOrdersCount = getCustomerOrders().length;
  document.getElementById("accountOrdersBadge").textContent = myOrdersCount;
}

// Мобильные фильтры (аккордеон)
function toggleMobileFilters() {
  const panel = document.getElementById("filtersPanel");
  const arrow = document.getElementById("mobileFilterArrow");
  const isOpen = panel.classList.toggle("mobile-open");
  arrow.textContent = isOpen ? "▲ Скрыть" : "▼ Показать";
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

  document.querySelectorAll(".mob-nav-item").forEach(btn => btn.classList.remove("active"));
  const mobBtn = document.getElementById(`mob-nav-${viewName}`);
  if (mobBtn) mobBtn.classList.add("active");

  const adminBtn = document.getElementById("nav-admin");
  if (viewName === "admin") {
    adminBtn.classList.add("active");
    renderAdminView();
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
  const fallback = flagship.fallbackSvg || "";
  const container = document.getElementById("heroShowcaseCard");
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span class="badge badge-hit">★ ХИТ ПРОДАЖ В РБ</span>
      <span style="font-size:12px; color:#D1D5DB;">Арт: ${flagship.sku}</span>
    </div>
    <img src="${flagship.image}" alt="${flagship.title}" onclick="openProductModal('${flagship.id}')" style="cursor:pointer;" onerror="if(this.src!=='${fallback}'&&'${fallback}')this.src='${fallback}'" />
    <div style="font-weight:700; font-size:15px; margin-bottom:8px; cursor:pointer;" onclick="openProductModal('${flagship.id}')">
      ${flagship.title}
    </div>
    <div class="hero-showcase-meta">
      <div>
        <span style="font-size:21px; font-weight:800; color:var(--brass);">${formatByn(flagship.price)}</span>
        ${flagship.oldPrice ? `<span style="font-size:12px; color:#9CA3AF; text-decoration:line-through; margin-left:6px;">${formatByn(flagship.oldPrice)}</span>` : ""}
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
      <div class="card-box" style="grid-column: 1 / -1; text-align:center; padding:40px 20px;">
        <h3 style="margin-bottom:8px;">По вашим фильтрам товаров не найдено</h3>
        <p style="color:var(--text-muted); margin-bottom:16px;">Попробуйте сбросить параметры фильтрации или изменить поисковый запрос.</p>
        <button class="btn btn-primary" onclick="resetFilters()">Показать все товары</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => renderProductCardHTML(p)).join("");
}

function getWarehouseBadgeHtml(p) {
  const sMinsk = p.stockMinsk !== undefined ? Number(p.stockMinsk) : Number(p.inStock || 0);
  const sMoscow = p.stockMoscow !== undefined ? Number(p.stockMoscow) : 0;
  if (sMinsk > 0) {
    return `<span class="badge badge-stock">✓ Минск: ${sMinsk} шт.${sMoscow > 0 ? ` • МСК: ${sMoscow}` : ""}</span>`;
  }
  if (sMoscow > 0) {
    return `<span class="badge" style="background:rgba(37,99,235,0.92); color:#fff;">🚚 Склад Москва: ${sMoscow} шт. (3–5 дн.)</span>`;
  }
  return `<span class="badge" style="background:rgba(255,255,255,0.9); color:var(--text-muted);">Под заказ</span>`;
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
          ${getWarehouseBadgeHtml(p)}
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
  const fallback = p.fallbackSvg || "";

  const content = document.getElementById("productModalContent");
  content.innerHTML = `
    <div class="modal-header">
      <div>
        <span style="font-size:12px; color:var(--text-muted); text-transform:uppercase;">${p.categoryLabel} • Артикул: ${p.sku}</span>
        <h2 style="font-size:20px; margin-top:4px;">${p.title}</h2>
      </div>
      <button class="close-btn" onclick="closeProductModal()">✕</button>
    </div>

    <div class="grid-2">
      <div>
        <img src="${p.image}" alt="${p.title}" style="width:100%; max-height:320px; object-fit:cover; border-radius:12px; border:1px solid var(--border); margin-bottom:14px;" onerror="if(this.src!=='${fallback}'&&'${fallback}')this.src='${fallback}'" />
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
        <div style="display:flex; align-items:baseline; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
          <span style="font-size:28px; font-weight:800;">${formatByn(p.price)}</span>
          ${p.oldPrice ? `<span style="font-size:15px; color:var(--text-muted); text-decoration:line-through;">${formatByn(p.oldPrice)}</span>` : ""}
          <span class="badge badge-stock" style="margin-left:auto;">В наличии: ${p.inStock} шт.</span>
        </div>

        <p style="color:var(--text-main); font-size:14px; margin-bottom:18px;">${p.description}</p>

        <div style="margin-bottom:18px;">
          <div style="font-weight:700; font-size:12px; text-transform:uppercase; margin-bottom:8px;">Характеристики модели:</div>
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
                <div style="font-weight:700; font-size:12px; text-transform:uppercase; margin-bottom:8px;">Преимущества и комплектация:</div>
                <ul style="padding-left:18px; font-size:13px; color:var(--text-muted); display:flex; flex-direction:column; gap:5px;">
                  ${p.features.map(f => `<li>${f}</li>`).join("")}
                </ul>
              </div>`
            : ""
        }

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
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
      fallbackSvg: product.fallbackSvg || "",
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
      <div style="text-align:center; padding:36px 16px;">
        <div style="font-size:42px; margin-bottom:12px;">🛒</div>
        <h3 style="margin-bottom:8px;">Ваша корзина пока пуста</h3>
        <p style="color:var(--text-muted); margin-bottom:20px;">Выберите смеситель, кран для питьевой воды или дозатор в каталоге.</p>
        <button class="btn btn-primary" onclick="closeCartModal()">Перейти к товарам</button>
      </div>
    `;
    return;
  }

  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const hasFaucet = state.cart.some(i => {
    const prod = state.products.find(p => p.id === i.id);
    return prod && prod.category !== "accessories";
  });
  const hasAccessory = state.cart.some(i => {
    const prod = state.products.find(p => p.id === i.id);
    return prod && prod.category === "accessories";
  });
  const isBundle = hasFaucet && hasAccessory;
  const discountByn = isBundle ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const finalTotal = Math.round((subtotal - discountByn) * 100) / 100;

  const freeThreshold = state.settings.freeShippingThresholdByn || 250;
  const shippingCost = finalTotal >= freeThreshold ? 0 : 6.5;
  const onlinePayEnabled = state.settings.onlinePaymentEnabled;

  container.innerHTML = `
    <div class="modal-header">
      <h2 style="font-size:20px;">Оформление заказа (${state.cart.reduce((a, b) => a + b.qty, 0)} шт.)</h2>
      <button class="close-btn" onclick="closeCartModal()">✕</button>
    </div>

    ${
      isBundle
        ? `<div style="background:var(--success-bg); color:var(--success); padding:10px 14px; border-radius:8px; font-size:13px; font-weight:700; margin-bottom:14px;">
            🎁 Активирована скидка −10% за комплект «Смеситель + Аксессуар» (Экономия ${formatByn(discountByn)})!
          </div>`
        : `<div style="background:var(--brass-light); color:#87632D; padding:10px 14px; border-radius:8px; font-size:12px; font-weight:600; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>💡 Добавьте к смесителю дозатор или ринзер в цвет — получите скидку −10% на весь заказ!</span>
            <button class="btn btn-outline btn-sm" style="padding:4px 10px; font-size:11px;" onclick="closeCartModal(); filterByCategory('accessories')">Выбрать аксессуар</button>
          </div>`
    }

    <div style="margin-bottom:20px; max-height:220px; overflow-y:auto; padding-right:4px;">
      ${state.cart
        .map(
          item => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:200px;">
            <img src="${item.image}" alt="" style="width:54px; height:46px; object-fit:cover; border-radius:6px;" onerror="if('${item.fallbackSvg}')this.src='${item.fallbackSvg}'" />
            <div>
              <div style="font-weight:700; font-size:13px;">${escapeHtml(item.title)}</div>
              <div style="font-size:11px; color:var(--text-muted);">Арт: ${escapeHtml(item.sku)} • ${formatByn(item.price)}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn btn-outline btn-sm" style="padding:4px 10px;" onclick="changeCartQty('${item.id}', -1)">−</button>
            <span style="font-weight:700; min-width:20px; text-align:center;">${item.qty}</span>
            <button class="btn btn-outline btn-sm" style="padding:4px 10px;" onclick="changeCartQty('${item.id}', 1)">+</button>
          </div>
          <div style="font-weight:800; min-width:85px; text-align:right; font-size:14px;">
            ${formatByn(item.price * item.qty)}
          </div>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="grid-2">
      <div>
        <h3 style="font-size:15px; margin-bottom:12px;">1. Контакты и доставка по Беларуси</h3>
        <div class="form-group">
          <label class="form-label">Ваше Имя и Фамилия *</label>
          <input type="text" id="chkName" class="input-field" value="${escapeHtml(state.customerProfile.name || "")}" placeholder="Иван Ковалев" />
        </div>
        <div class="form-group">
          <label class="form-label">Телефон (+375) *</label>
          <input type="tel" id="chkPhone" class="input-field" value="${escapeHtml(state.customerProfile.phone || "")}" placeholder="+375 (29) 123-45-67" />
        </div>
        <div class="form-group">
          <label class="form-label">Город / Населенный пункт *</label>
          <input type="text" id="chkCity" class="input-field" value="${escapeHtml(state.customerProfile.city || "")}" placeholder="г. Минск, Брест, Гродно..." />
        </div>
        <div class="form-group">
          <label class="form-label">Способ получения товара</label>
          <select id="chkDelivery" class="input-field">
            <option value="Европочта (до отделения по РБ)">📦 Европочта — до отделения (${shippingCost === 0 ? "Бесплатно" : "6.50 BYN"})</option>
            <option value="Самовывоз из магазина (${escapeHtml(state.settings.city)})">🏪 Самовывоз из павильона — Бесплатно</option>
            <option value="Белпочта (до отделения)">📮 Белпочта — по всей Беларуси</option>
            <option value="Курьер до двери">🚚 Курьерская доставка до двери</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Отделение Европочты или адрес</label>
          <input type="text" id="chkAddress" class="input-field" value="${escapeHtml(state.customerProfile.address || "")}" placeholder="Например: Отделение Европочты №14" />
        </div>
      </div>

      <div>
        <h3 style="font-size:15px; margin-bottom:12px;">2. Способ оплаты и подтверждение</h3>
        <div class="form-group">
          <label class="form-label">Выберите способ оплаты</label>
          <select id="chkPayment" class="input-field">
            <option value="Оплата при получении (наличными / картой)">💵 При получении (осмотр перед оплатой)</option>
            <option value="ЕРИП (по номеру заказа после подтверждения)">🏦 Система «Расчет» (ЕРИП) — код ${escapeHtml(state.settings.eripServiceCode)}</option>
            ${
              onlinePayEnabled
                ? `<option value="Онлайн-оплата картой (bePaid: Белкарт / Visa / MC)">💳 Онлайн-оплата картой на сайте (bePaid)</option>`
                : ""
            }
            <option value="Безналичный расчет (для ИП и ООО со счетом)">📄 Безналичный расчет по счету</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Комментарий к заказу (по желанию)</label>
          <textarea id="chkComment" class="input-field" rows="2" placeholder="Например: нужен переходник к фильтру воды"></textarea>
        </div>

        <div style="background:var(--bg-main); padding:14px; border-radius:10px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
            <span>Стоимость товаров:</span>
            <strong>${formatByn(subtotal)}</strong>
          </div>
          ${
            discountByn > 0
              ? `<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; color:var(--success);">
                  <span>Скидка за комплект (−10%):</span>
                  <strong>−${formatByn(discountByn)}</strong>
                </div>`
              : ""
          }
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:10px;">
            <span>Доставка по РБ:</span>
            <strong style="color:${shippingCost === 0 ? "var(--success)" : "inherit"}">
              ${shippingCost === 0 ? "Бесплатно" : formatByn(shippingCost)}
            </strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:17px; font-weight:800; padding-top:10px; border-top:1px solid var(--border);">
            <span>Итого к оплате:</span>
            <span style="color:var(--brass-hover);">${formatByn(finalTotal)}</span>
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

  if (!name || normalizePhoneDigits(phone).length < 7 || !city) {
    showToast("Пожалуйста, укажите Имя, корректный Телефон (+375...) и Город");
    return;
  }

  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const hasFaucet = state.cart.some(i => {
    const prod = state.products.find(p => p.id === i.id);
    return prod && prod.category !== "accessories";
  });
  const hasAccessory = state.cart.some(i => {
    const prod = state.products.find(p => p.id === i.id);
    return prod && prod.category === "accessories";
  });
  const discountByn = hasFaucet && hasAccessory ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const totalByn = Math.round((subtotal - discountByn) * 100) / 100;

  let savedOrder = {
    id: `ORD-2026-${Math.floor(100 + Math.random() * 900)}`,
    createdAt: new Date().toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }),
    customerName: name,
    customerPhone: phone,
    city: city,
    deliveryMethod: `${delivery}${address ? " (" + address + ")" : ""}`,
    paymentMethod: payment,
    status: "new",
    trackingNumber: "",
    subtotalByn: subtotal,
    discountByn,
    totalByn,
    comment: comment,
    items: state.cart.map(i => ({ id: i.id, title: i.title, price: i.price, qty: i.qty }))
  };

  if (window.location.protocol !== "file:") {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savedOrder)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order) savedOrder = data.order;
        if (Array.isArray(data.products)) state.products = data.products;
      }
    } catch (e) {
      sendOrderToTelegram(savedOrder);
    }
  } else {
    sendOrderToTelegram(savedOrder);
  }

  state.customerProfile = { name, phone, city, address };
  state.isCustomerLoggedIn = true;
  state.orders.unshift(savedOrder);
  state.cart = [];
  saveState();
  renderCatalog();

  const container = document.getElementById("cartModalContent");
  container.innerHTML = `
    <div style="text-align:center; padding:28px 12px;">
      <div style="width:60px; height:60px; border-radius:50%; background:var(--success-bg); color:var(--success); font-size:30px; display:flex; align-items:center; justify-content:center; margin:0 auto 14px;">✓</div>
      <h2 style="margin-bottom:8px;">Заказ №${escapeHtml(savedOrder.id)} сохранен в базе!</h2>
      <p style="color:var(--text-muted); max-width:480px; margin:0 auto 18px; font-size:14px;">
        Спасибо, <strong>${escapeHtml(name)}</strong>! Статус сборки и трек-номер Европочты доступны в вашем Личном кабинете.
      </p>
      <div style="background:var(--bg-main); max-width:460px; margin:0 auto 20px; padding:14px; border-radius:10px; text-align:left; font-size:13px;">
        <div><strong>Итоговая сумма:</strong> ${formatByn(savedOrder.totalByn)} ${savedOrder.discountByn > 0 ? `(включая скидку −${formatByn(savedOrder.discountByn)})` : ""}</div>
        <div><strong>Доставка:</strong> ${escapeHtml(savedOrder.deliveryMethod)}</div>
        <div><strong>Способ оплаты:</strong> ${escapeHtml(savedOrder.paymentMethod)}</div>
      </div>
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="closeCartModal(); switchView('account', 'orders')">
          Перейти в Личный кабинет
        </button>
        <button class="btn btn-dark" onclick="printOrderInvoice('${savedOrder.id}')">
          📄 Скачать товарный чек / счет ИП
        </button>
        <button class="btn btn-outline" onclick="closeCartModal()">
          В каталог
        </button>
      </div>
    </div>
  `;
}

function printOrderInvoice(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const s = state.settings;
  const win = window.open("", "_blank", "width=820,height=700");
  if (!win) {
    showToast("Разрешите всплывающие окна для печати товарного чека");
    return;
  }

  const rowsHtml = order.items
    .map(
      (i, idx) => `
      <tr>
        <td style="padding:8px; border:1px solid #ccc; text-align:center;">${idx + 1}</td>
        <td style="padding:8px; border:1px solid #ccc;">${escapeHtml(i.title)}</td>
        <td style="padding:8px; border:1px solid #ccc; text-align:center;">${i.qty} шт.</td>
        <td style="padding:8px; border:1px solid #ccc; text-align:right;">${formatByn(i.price)}</td>
        <td style="padding:8px; border:1px solid #ccc; text-align:right; font-weight:bold;">${formatByn(i.price * i.qty)}</td>
      </tr>`
    )
    .join("");

  win.document.write(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <title>Товарный чек / Счет-спецификация №${escapeHtml(order.id)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #111; line-height: 1.45; }
        table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
        .header-box { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div>
          <h2 style="margin:0 0 4px;">${escapeHtml(s.brandName)}</h2>
          <div style="font-size:13px;"><strong>Продавец:</strong> ${escapeHtml(s.legalName)}, УНП ${escapeHtml(s.unp)}</div>
          <div style="font-size:13px;"><strong>Адрес магазина:</strong> ${escapeHtml(s.city)} • Тел: ${escapeHtml(s.phone)}</div>
        </div>
        <div style="text-align:right;">
          <h3 style="margin:0;">ТОВАРНЫЙ ЧЕК / СЧЕТ №${escapeHtml(order.id)}</h3>
          <div style="font-size:13px;">Дата: ${escapeHtml(order.createdAt)}</div>
        </div>
      </div>

      <div style="font-size:13px; margin-bottom:14px;">
        <div><strong>Покупатель:</strong> ${escapeHtml(order.customerName)} (${escapeHtml(order.customerPhone)})</div>
        <div><strong>Доставка по РБ:</strong> ${escapeHtml(order.city)}, ${escapeHtml(order.deliveryMethod)}</div>
        <div><strong>Способ оплаты:</strong> ${escapeHtml(order.paymentMethod)}</div>
      </div>

      <table>
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px; border:1px solid #ccc;">№</th>
            <th style="padding:8px; border:1px solid #ccc; text-align:left;">Наименование товара (смеситель / аксессуар)</th>
            <th style="padding:8px; border:1px solid #ccc;">Кол-во</th>
            <th style="padding:8px; border:1px solid #ccc; text-align:right;">Цена (BYN)</th>
            <th style="padding:8px; border:1px solid #ccc; text-align:right;">Сумма (BYN)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div style="text-align:right; font-size:15px; font-weight:bold; margin-bottom:24px;">
        ${order.discountByn > 0 ? `<div style="color:#1E8E5A; font-size:13px;">Скидка за комплект (10%): −${formatByn(order.discountByn)}</div>` : ""}
        <div>ИТОГО К ОПЛАТЕ: ${formatByn(order.totalByn)} (Белорусских рублей)</div>
      </div>

      <div style="font-size:12px; color:#444; border-top:1px solid #ccc; padding-top:12px;">
        Официальная гарантия на смесители и комплектующие согласно гарантийному талону. Подпись продавца: _______________________
      </div>

      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  win.document.close();
}

// ==================== ЛИЧНЫЙ КАБИНЕТ ПОКУПАТЕЛЯ (ВХОД ПО ТЕЛЕФОНУ) ====================

async function loginCustomerByPhone() {
  const phone = document.getElementById("loginCustPhone").value.trim();
  const name = document.getElementById("loginCustName").value.trim();

  if (normalizePhoneDigits(phone).length < 7) {
    showToast("Введите ваш номер телефона (+375...)");
    return;
  }

  state.customerProfile.phone = phone;
  if (name) state.customerProfile.name = name;
  state.isCustomerLoggedIn = true;

  await refreshCustomerOrdersFromServer();
  saveState();
  renderCustomerAccount();
  showToast("Вы вошли в Личный кабинет покупателя!");
}

async function loginDemoCustomer() {
  document.getElementById("loginCustPhone").value = "+375 (29) 312-45-67";
  document.getElementById("loginCustName").value = "Алексей Демидов";
  await loginCustomerByPhone();
}

async function refreshCustomerOrdersFromServer() {
  if (window.location.protocol === "file:") return;
  try {
    const res = await fetch("/api/customer/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.customerProfile)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.customer) {
        state.customerProfile = {
          name: data.customer.name || state.customerProfile.name,
          phone: data.customer.phone || state.customerProfile.phone,
          city: data.customer.city || state.customerProfile.city,
          address: data.customer.address || state.customerProfile.address
        };
      }
      if (Array.isArray(data.orders) && !state.isAdminLoggedIn) {
        state.orders = data.orders;
      }
    }
  } catch (e) {}
}

function logoutCustomer() {
  state.isCustomerLoggedIn = false;
  state.customerProfile = { name: "", phone: "", city: "г. Минск", address: "" };
  saveState();
  renderCustomerAccount();
  showToast("Вы вышли из Личного кабинета");
}

function switchAccountSubtab(tab) {
  document.getElementById("account-sub-orders").style.display = tab === "orders" ? "block" : "none";
  document.getElementById("account-sub-favorites").style.display = tab === "favorites" ? "block" : "none";
  document.getElementById("account-sub-profile").style.display = tab === "profile" ? "block" : "none";
  renderCustomerAccount();
}

function populateCustomerProfileForm() {
  const nameEl = document.getElementById("profName");
  if (!nameEl) return;
  nameEl.value = state.customerProfile.name || "";
  document.getElementById("profPhone").value = state.customerProfile.phone || "";
  document.getElementById("profCity").value = state.customerProfile.city || "";
  document.getElementById("profAddress").value = state.customerProfile.address || "";
}

async function saveCustomerProfile() {
  state.customerProfile = {
    name: document.getElementById("profName").value.trim(),
    phone: document.getElementById("profPhone").value.trim(),
    city: document.getElementById("profCity").value.trim(),
    address: document.getElementById("profAddress").value.trim()
  };
  await refreshCustomerOrdersFromServer();
  saveState();
  showToast("Данные доставки сохранены в базе!");
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
  const loginBox = document.getElementById("customerLoginBox");
  const contentBox = document.getElementById("customerAccountContent");

  if (!state.isCustomerLoggedIn || !state.customerProfile.phone) {
    loginBox.style.display = "block";
    contentBox.style.display = "none";
    return;
  }

  loginBox.style.display = "none";
  contentBox.style.display = "block";

  document.getElementById("accountWelcomeTitle").textContent = `Кабинет покупателя: ${state.customerProfile.name || "Клиент"}`;
  document.getElementById("accountPhoneSubtitle").textContent = `Привязанный телефон: ${state.customerProfile.phone} • ${state.customerProfile.city || "Беларусь"}`;

  populateCustomerProfileForm();

  const myOrders = getCustomerOrders();
  const ordersContainer = document.getElementById("customerOrdersList");
  if (myOrders.length === 0) {
    ordersContainer.innerHTML = `
      <div class="card-box">
        <h3 style="margin-bottom:6px;">По номеру ${state.customerProfile.phone} заказов пока нет</h3>
        <p style="font-size:13px; color:var(--text-muted);">Оформите заказ через корзину — и здесь сразу появится его статус и трек-номер Европочты.</p>
      </div>
    `;
  } else {
    ordersContainer.innerHTML = myOrders
      .map(o => {
        const st = getStatusInfo(o.status);
        return `
        <div class="card-box">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-bottom:12px; border-bottom:1px solid var(--border); margin-bottom:14px;">
            <div>
              <span style="font-weight:800; font-size:16px;">Заказ №${o.id}</span>
              <span style="font-size:12px; color:var(--text-muted); margin-left:8px;">от ${o.createdAt}</span>
            </div>
            <span class="status-pill ${st.cls}">${st.label}</span>
          </div>

          <div class="grid-2" style="font-size:13px;">
            <div>
              <div><strong>Получатель:</strong> ${o.customerName} (${o.customerPhone})</div>
              <div><strong>Доставка:</strong> ${o.city}, ${o.deliveryMethod}</div>
              <div><strong>Оплата:</strong> ${o.paymentMethod}</div>
              ${
                o.trackingNumber
                  ? `<div style="margin-top:8px; padding:8px 10px; background:var(--bg-main); border-radius:6px; color:var(--brass-hover); font-weight:700;">📦 Трек-номер Европочты: ${o.trackingNumber}</div>`
                  : ""
              }
            </div>
            <div>
              <div style="font-weight:700; margin-bottom:6px;">Состав заказа:</div>
              ${o.items
                .map(
                  i =>
                    `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                      <span>${i.title} × ${i.qty} шт.</span>
                      <strong>${formatByn(i.price * i.qty)}</strong>
                    </div>`
                )
                .join("")}
              <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:800; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                <span>Итого:</span>
                <span>${formatByn(o.totalByn)}</span>
              </div>
              <button class="btn btn-outline btn-sm" style="margin-top:10px; width:100%;" onclick="printOrderInvoice('${o.id}')">
                📄 Скачать товарный чек / счет ИП
              </button>
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

// ==================== ЗАЩИЩЕННАЯ АДМИН-ПАНЕЛЬ ДЯДИ ====================

function renderAdminView() {
  const loginBox = document.getElementById("adminLoginBox");
  const protectedBox = document.getElementById("adminProtectedContent");

  if (!state.isAdminLoggedIn) {
    loginBox.style.display = "block";
    protectedBox.style.display = "none";
    return;
  }

  loginBox.style.display = "none";
  protectedBox.style.display = "block";
  renderAdminDashboard();
}

async function loginAdmin() {
  const pin = document.getElementById("adminPinInput").value.trim();
  if (!pin) {
    showToast("Введите пароль владельца");
    return;
  }

  if (window.location.protocol === "file:") {
    if (pin === "2026" || pin === "1234") {
      state.isAdminLoggedIn = true;
      state.adminToken = "local_admin_token";
      localStorage.setItem("af_admin_token", state.adminToken);
      document.getElementById("nav-admin").style.display = "inline-flex";
      renderAdminView();
      showToast("Вход в Админ-панель выполнен!");
    } else {
      showToast("Неверный пароль (по умолчанию: 2026)");
    }
    return;
  }

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      state.isAdminLoggedIn = true;
      state.adminToken = data.token;
      state.orders = data.orders || state.orders;
      state.settings = data.settings || state.settings;
      localStorage.setItem("af_admin_token", state.adminToken);
      document.getElementById("nav-admin").style.display = "inline-flex";
      document.getElementById("adminPinInput").value = "";
      renderAdminView();
      showToast("🔓 Добро пожаловать в кабинет владельца!");
    } else {
      showToast(data.error || "Неверный пароль администратора");
    }
  } catch (e) {
    showToast("Ошибка соединения с сервером");
  }
}

function logoutAdmin() {
  state.isAdminLoggedIn = false;
  state.adminToken = "";
  localStorage.removeItem("af_admin_token");
  document.getElementById("nav-admin").style.display = "none";
  switchView("catalog");
  showToast("Вы вышли из Админ-панели");
}

async function changeAdminPassword() {
  const newPin = document.getElementById("newAdminPinInput").value.trim();
  if (newPin.length < 4) {
    showToast("Новый пароль должен содержать минимум 4 символа");
    return;
  }
  if (window.location.protocol !== "file:") {
    const res = await fetch("/api/admin/change-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": state.adminToken
      },
      body: JSON.stringify({ newPin })
    });
    if (res.ok) {
      document.getElementById("newAdminPinInput").value = "";
      showToast("Пароль владельца успешно обновлен в базе данных!");
    } else {
      showToast("Не удалось обновить пароль");
    }
  } else {
    showToast("В локальном режиме пароль меняется на сервере");
  }
}

function switchAdminTab(tabName) {
  ["orders", "products", "supplier", "reels", "settings"].forEach(t => {
    const pane = document.getElementById(`admin-pane-${t}`);
    const btn = document.getElementById(`adm-tab-${t}`);
    if (pane) pane.style.display = t === tabName ? "block" : "none";
    if (btn) btn.classList.toggle("active", t === tabName);
  });
  renderAdminDashboard();
}

function renderAdminDashboard() {
  if (!state.isAdminLoggedIn) return;

  const totalRevenue = state.orders
    .filter(o => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.totalByn), 0);
  const newOrdersCount = state.orders.filter(o => o.status === "new").length;

  document.getElementById("adminKpiCards").innerHTML = `
    <div class="card-box" style="margin-bottom:0;">
      <div style="font-size:12px; color:var(--text-muted);">Всего заказов в БД</div>
      <div style="font-size:26px; font-weight:800; margin-top:4px;">${state.orders.length} <span style="font-size:13px; color:var(--warning);">(${newOrdersCount} новых)</span></div>
    </div>
    <div class="card-box" style="margin-bottom:0;">
      <div style="font-size:12px; color:var(--text-muted);">Сумма заказов (BYN)</div>
      <div style="font-size:26px; font-weight:800; color:var(--success); margin-top:4px;">${formatByn(totalRevenue)}</div>
    </div>
    <div class="card-box" style="margin-bottom:0;">
      <div style="font-size:12px; color:var(--text-muted);">Товаров в каталоге</div>
      <div style="font-size:26px; font-weight:800; margin-top:4px;">${state.products.length} поз.</div>
    </div>
  `;

  const ordersTable = document.getElementById("adminOrdersTable");
  ordersTable.innerHTML = state.orders
    .map(o => {
      const st = getStatusInfo(o.status);
      return `
      <div style="border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:14px; background:var(--bg-main);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <div>
            <strong>${o.id}</strong> • <span style="font-size:12px; color:var(--text-muted);">${o.createdAt}</span>
            <span class="status-pill ${st.cls}" style="margin-left:6px;">${st.label}</span>
          </div>
          <div style="font-size:17px; font-weight:800;">${formatByn(o.totalByn)}</div>
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
        </div>
      </div>
    `;
    })
    .join("");

  document.getElementById("adminProductsCount").textContent = state.products.length;
  const prodList = document.getElementById("adminProductsList");
  prodList.innerHTML = state.products
    .map(
      p => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:240px;">
          <img src="${p.image}" alt="" style="width:56px; height:46px; object-fit:cover; border-radius:6px;" onerror="if('${p.fallbackSvg || ""}')this.src='${p.fallbackSvg || ""}'" />
          <div>
            <div style="font-weight:700; font-size:14px;">${escapeHtml(p.title)}</div>
            <div style="font-size:12px; color:var(--text-muted);">
              Арт: <strong>${escapeHtml(p.sku)}</strong> •
              Склад Минск: <strong style="color:var(--success);">${p.stockMinsk ?? p.inStock} шт.</strong> •
              Склад Москва: <strong style="color:#2563EB;">${p.stockMoscow ?? 0} шт.</strong>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-weight:800; font-size:15px;">${formatByn(p.price)}</span>
          <button class="btn btn-outline btn-sm" onclick="openProductEditor('${p.id}')">✏️ Изменить</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="deleteProduct('${p.id}')">Удалить</button>
        </div>
      </div>
    `
    )
    .join("");

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

async function updateOrderStatus(orderId, newStatus) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = newStatus;
  saveState();
  if (window.location.protocol !== "file:" && state.adminToken) {
    await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": state.adminToken
      },
      body: JSON.stringify({ status: newStatus })
    }).catch(() => {});
  }
  renderAdminDashboard();
  showToast(`Статус заказа ${orderId} обновлен в БД!`);
}

async function updateOrderTracking(orderId, tracking) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.trackingNumber = tracking.trim();
  saveState();
  if (window.location.protocol !== "file:" && state.adminToken) {
    await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": state.adminToken
      },
      body: JSON.stringify({ trackingNumber: order.trackingNumber })
    }).catch(() => {});
  }
  showToast(`Трек-номер для заказа ${orderId} сохранен в БД!`);
}

// Добавление и редактирование товара в Админ-панели
function openProductEditor(productId = null) {
  const existing = productId ? state.products.find(p => p.id === productId) : null;
  const modal = document.getElementById("editorModalContent");

  modal.innerHTML = `
    <div class="modal-header">
      <h2>${existing ? "Редактировать товар" : "Добавить новый товар"}</h2>
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
      <label class="form-label">Фото товара (ссылка URL или выберите фото с телефона/компьютера)</label>
      <input type="text" id="edtImage" class="input-field" value="${existing ? existing.image : ""}" placeholder="URL картинки или загрузите файл ниже" style="margin-bottom:8px;" />
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
      <button class="btn btn-primary" onclick="saveProductFromEditor('${existing ? existing.id : ""}')">Сохранить в БД</button>
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

async function saveProductFromEditor(existingId) {
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

  const generatedSvg = createProductSvg(title.slice(0, 26), "#252930", "#C59B5F", sku, `${price} BYN`);
  if (!image) image = generatedSvg;

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
        fallbackSvg: state.products[idx].fallbackSvg || generatedSvg,
        description,
        isHit
      };
    }
    showToast("Товар обновлен в серверной БД!");
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
      fallbackSvg: generatedSvg,
      description,
      isHit,
      features: [
        `Материал корпуса: ${material}`,
        `Покрытие: ${color}`,
        `Официальная гарантия ${warranty}`
      ]
    });
    showToast("Новый товар добавлен в базу данных!");
  }

  await saveAdminProductsToServer();
  closeProductEditor();
  renderCatalog();
  renderHeroShowcase();
  renderAdminDashboard();
}

async function deleteProduct(productId) {
  state.products = state.products.filter(p => p.id !== productId);
  await saveAdminProductsToServer();
  renderCatalog();
  renderAdminDashboard();
  showToast("Товар удален из базы данных");
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

// ==================== АВТО-СИНХРОНИЗАЦИЯ СО СКЛАДОМ ПОСТАВЩИКА (МИНСК / МОСКВА) ====================

function fillDemoSupplierCsv() {
  const el = document.getElementById("supCsvInput");
  if (el && typeof DEMO_SUPPLIER_CSV !== "undefined") {
    el.value = DEMO_SUPPLIER_CSV;
    showToast("Тестовая выгрузка поставщика (Минск + Москва) подставлена!");
  }
}

function handleSupplierFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("supCsvInput").value = e.target.result;
    showToast(`Прайс-лист «${file.name}» загружен! Нажмите «Синхронизировать склад сейчас»`);
  };
  reader.readAsText(file, "utf-8");
}

async function runSupplierSync() {
  const rubRatePer100 = parseFloat(document.getElementById("supRubRate")?.value) || 3.45;
  const markupPercent = parseFloat(document.getElementById("supMarkup")?.value) || 30;
  const feedUrl = (document.getElementById("supFeedUrl")?.value || "").trim();
  const csvText = (document.getElementById("supCsvInput")?.value || "").trim() || (typeof DEMO_SUPPLIER_CSV !== "undefined" ? DEMO_SUPPLIER_CSV : "");
  const updatePrices = document.getElementById("supUpdatePrices")?.checked !== false;
  const resultBox = document.getElementById("supplierSyncResultBox");

  if (window.location.protocol !== "file:" && state.adminToken) {
    try {
      const res = await fetch("/api/admin/supplier-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": state.adminToken
        },
        body: JSON.stringify({ csvText, feedUrl, rubRatePer100, markupPercent, updatePrices })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        state.products = data.products || state.products;
        saveState();
        renderCatalog();
        renderHeroShowcase();
        renderAdminDashboard();
        if (resultBox) {
          resultBox.innerHTML = `
            <div style="background:var(--success-bg); color:var(--success); padding:14px; border-radius:8px; font-size:13px; border-left:4px solid var(--success);">
              <strong>✅ Синхронизация со складом Минск / Москва завершена (${escapeHtml(data.syncedAt)}):</strong><br/>
              • Обновлено существующих артикулов: <strong>${data.updatedCount} шт.</strong><br/>
              • Автоматически создано новых карточек из прайса: <strong>${data.createdCount} шт.</strong><br/>
              • Всего товаров в каталоге магазина: <strong>${data.totalProducts} поз.</strong>
            </div>
          `;
        }
        showToast(`Склад синхронизирован! Обновлено: ${data.updatedCount}, Новых: ${data.createdCount}`);
        return;
      } else {
        showToast(data.error || "Ошибка синхронизации");
      }
    } catch (e) {}
  }

  // Локальный парсер (если открыто без сервера через file://)
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let updatedCount = 0;
  let createdCount = 0;
  for (const line of lines) {
    if (/^sku[;,\t]/i.test(line) || /^артикул[;,\t]/i.test(line)) continue;
    const parts = line.includes(";") ? line.split(";") : line.split(",");
    if (parts.length < 5) continue;
    const sku = parts[0].trim();
    const title = parts[1].trim();
    const rawWholesale = parseFloat(String(parts[2]).replace(",", ".")) || 0;
    const currency = (parts[3] || "BYN").trim().toUpperCase();
    const stockMinsk = Math.max(0, parseInt(parts[4], 10) || 0);
    const stockMoscow = Math.max(0, parseInt(parts[5], 10) || 0);
    const category = (parts[6] || "faucets-pullout").trim();
    const material = (parts[7] || "Латунь CW617N").trim();
    const color = (parts[8] || "Черный матовый").trim();

    const baseByn = currency === "RUB" ? (rawWholesale / 100) * rubRatePer100 : rawWholesale;
    const retailPriceByn = Math.round(baseByn * (1 + markupPercent / 100));

    const existing = state.products.find(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (existing) {
      existing.stockMinsk = stockMinsk;
      existing.stockMoscow = stockMoscow;
      existing.inStock = stockMinsk + stockMoscow;
      if (updatePrices && retailPriceByn > 0) existing.price = retailPriceByn;
      updatedCount++;
    } else if (title && retailPriceByn > 0) {
      const svg = createProductSvg(title.slice(0, 26), "#23272F", "#C59B5F", sku, `${retailPriceByn} BYN`);
      state.products.unshift({
        id: "prd-sup-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        sku,
        title,
        category,
        categoryLabel: "Поставка со склада",
        price: retailPriceByn,
        oldPrice: Math.round(retailPriceByn * 1.15),
        color,
        material,
        spoutType: stockMinsk > 0 ? "В наличии в Минске" : "Склад Москва (3–5 дней)",
        warranty: "5 лет",
        stockMinsk,
        stockMoscow,
        inStock: stockMinsk + stockMoscow,
        isHit: true,
        image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80",
        fallbackSvg: svg,
        description: `Позиция из прайса поставщика (Арт. ${sku}). Материал: ${material}, цвет: ${color}.`
      });
      createdCount++;
    }
  }

  saveState();
  renderCatalog();
  renderAdminDashboard();
  showToast(`Склад обновлен! Обновлено: ${updatedCount}, Новых: ${createdCount}`);
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
      `<strong>0–3 сек (Хук):</strong> Крупный план включения воды и переключения режимов струи на модели «${product.title}».`,
      `<strong>3–8 сек (Детали):</strong> Показываем покрытие (${product.color}) и плавный ход ручки. Подпись: «Корпус: ${product.material}».`,
      `<strong>8–12 сек (Функция):</strong> Демонстрируем главную фишку: ${product.spoutType}.`,
      `<strong>12–15 сек (Оффер РБ):</strong> Показываем коробку с комплектом подводки + цену <strong>${formatByn(product.price)}</strong>.`
    ];
    voiceover = `Посмотрите, насколько продуман этот кухонный смеситель. Модель ${product.sku} выполнена из материала ${product.material} в цвете ${product.color}. Главная фишка — ${product.spoutType}. Никаких брызг по столешнице и гарантия ${product.warranty}. Цена сейчас — ${product.price} белорусских рублей. ${ctaLine}`;
  } else if (tpl === "compare") {
    hookTitle = `Не покупайте смеситель на кухню, пока не проверите ЭТО!`;
    shots = [
      `<strong>0–3 сек (Хук):</strong> В левой руке легкий дешевый кран, в правой — наш «${product.title}». Кладем на весы прямо на витрине.`,
      `<strong>3–9 сек (Польза):</strong> Объясняем разницу: «Дешевый силумин трескается через год, а здесь — ${product.material} и керамический картридж».`,
      `<strong>9–15 сек (Цена и призыв):</strong> Крупный план излива (${product.spoutType}) и плашка: «Цена в РБ: ${formatByn(product.price)} • Гарантия ${product.warranty}».`
    ];
    voiceover = `Как за 5 секунд отличить хороший кухонный кран от одноразового? Просто возьмите его в руку! Наш смеситель из ${product.material} тяжелый, с защитным покрытием ${product.color}. Стоит ${product.price} рублей и служит годами. ${ctaLine}`;
  } else if (tpl === "problem") {
    hookTitle = `Высокие кастрюли не помещаются в мойку и кругом брызги?`;
    shots = [
      `<strong>0–3 сек:</strong> Показываем неудобный низкий кран, затем резкий переход на «${product.title}».`,
      `<strong>3–10 сек:</strong> Показываем, как удобно мыть противень и набирать воду благодаря функции «${product.spoutType}».`,
      `<strong>10–15 сек:</strong> Плашка с артикулом ${product.sku}, ценой ${formatByn(product.price)} и доставкой Европочтой.`
    ];
    voiceover = `Надоело, что на кухне вечно разбрызгивается вода и неудобно мыть большую посуду? Решение — смеситель с функцией ${product.spoutType} в цвете ${product.color}. Установка за 10 минут. Цена — ${product.price} рублей. ${ctaLine}`;
  } else {
    hookTitle = `Собираем идеальный комплект для кухни в один цвет!`;
    shots = [
      `<strong>0–4 сек:</strong> Выкладываем на стол «${product.title}» + встраиваемый металлический дозатор и ополаскиватель стаканов в цвет ${product.color}.`,
      `<strong>4–10 сек:</strong> Показываем, как они идеально совпадают по оттенку и избавляют от пластиковых бутылок на мойке.`,
      `<strong>10–15 сек:</strong> Цена ${formatByn(product.price)} + бесплатная доставка по Беларуси от ${state.settings.freeShippingThresholdByn} BYN.`
    ];
    voiceover = `Хотите, чтобы мойка на кухне выглядела дорого и аккуратно? Подберите смеситель, ринзер и встраиваемый дозатор точно в один тон — ${product.color}. Материал ${product.material}, гарантия ${product.warranty}. Смеситель стоит ${product.price} рублей. ${ctaLine}`;
  }

  const hashtags = `#смесительдлякухни #сантехникабеларусь #ремонтминск #кухняминск #смесительминск #европочта #товарыдлядомарб #краннакухню`;

  state.lastGeneratedVoiceText = voiceover;
  state.lastGeneratedReelsText = `ЗАГОЛОВОК (ХУК):\n${hookTitle}\n\nПОСЕКУНДНЫЙ ПЛАН СЪЕМКИ:\n${shots.map(s => s.replace(/<[^>]+>/g, "")).join("\n")}\n\nТЕКСТ ОЗВУЧКИ:\n${voiceover}\n\nОПИСАНИЕ ПОСТА:\n${product.title} (Арт. ${product.sku})\nЦена: ${formatByn(product.price)}\nМатериал: ${product.material}\nГарантия: ${product.warranty}\n${ctaLine}\n\n${hashtags}`;

  document.getElementById("reelsGeneratedOutput").innerHTML = `
    <div style="background:var(--bg-main); padding:14px; border-radius:10px; border:1px solid var(--border); font-size:13px;">
      <div style="font-weight:800; font-size:14px; color:var(--brass-hover); margin-bottom:10px;">🔥 Хук (0–2 сек): «${hookTitle}»</div>
      <div style="margin-bottom:12px;">
        <div style="font-weight:700; margin-bottom:6px;">📹 Раскадровка (что снять телефоном на витрине):</div>
        <ul style="padding-left:18px; display:flex; flex-direction:column; gap:6px;">
          ${shots.map(s => `<li>${s}</li>`).join("")}
        </ul>
      </div>
      <div style="margin-bottom:12px; background:#fff; padding:10px; border-radius:8px; border:1px solid var(--border);">
        <div style="font-weight:700; margin-bottom:4px;">🎙 Текст для голосовой озвучки:</div>
        <div style="color:var(--text-main); font-style:italic;">«${voiceover}»</div>
      </div>
      <div>
        <div style="font-weight:700; margin-bottom:4px;">#️⃣ Хэштеги для TikTok / Instagram РБ:</div>
        <div style="color:var(--text-muted); font-size:12px;">${hashtags}</div>
      </div>
    </div>
  `;

  const fallback = product.fallbackSvg || "";
  document.getElementById("phonePreviewBox").innerHTML = `
    <img src="${product.image}" class="phone-bg-img" alt="" onerror="if('${fallback}')this.src='${fallback}'" />
    <div class="phone-overlay">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; opacity:0.9;">
        <span style="background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:99px;">@${state.settings.brandName.toLowerCase()}</span>
        <span style="background:var(--brass); color:#111; font-weight:800; padding:3px 8px; border-radius:99px;">Арт: ${product.sku}</span>
      </div>

      <div style="text-align:center; padding:0 6px;">
        <div style="background:rgba(20,22,25,0.88); border:1px solid var(--brass); padding:10px 12px; border-radius:10px; font-weight:800; font-size:13px; line-height:1.3; margin-bottom:10px; box-shadow:0 8px 20px rgba(0,0,0,0.4);">
          ${hookTitle}
        </div>
        <div style="display:inline-block; background:var(--brass); color:#111; font-weight:900; font-size:15px; padding:6px 14px; border-radius:8px;">
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
  showToast("Готовый сценарий, озвучка и хэштеги скопированы!");
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

async function saveStoreSettings() {
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
  if (window.location.protocol !== "file:" && state.adminToken) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": state.adminToken
      },
      body: JSON.stringify(state.settings)
    }).catch(() => {});
  }
  applyStoreSettingsToUI();
  showToast("Настройки магазина и реквизиты РБ сохранены в БД!");
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
  } catch (e) {}
}

async function testTelegramNotification() {
  await saveStoreSettings();
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
        text: `✅ Тестовое уведомление с сайта ${state.settings.brandName}! Бот успешно подключен.`
      })
    });
    if (res.ok) {
      showToast("Тестовое сообщение отправлено в ваш Telegram!");
    } else {
      showToast("Ошибка Telegram API: проверьте токен и Chat ID");
    }
  } catch (e) {
    showToast("Не удалось связаться с сервером Telegram");
  }
}
