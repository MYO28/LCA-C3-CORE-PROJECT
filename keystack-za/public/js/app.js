const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

const money = (cents) =>
  `R ${Math.round(Number(cents) / 100)
    .toLocaleString("en-ZA", { maximumFractionDigits: 0 })
    .replace(/,/g, " ")}`;
const esc = (value) =>
  String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

function imageFallback(event, category = "") {
  if (event.currentTarget.dataset.fallbackUsed) return;
  event.currentTarget.dataset.fallbackUsed = "1";
  const slug = String(category).toLowerCase();
  const fallback = slug.includes("switch")
    ? "/images/switches.svg"
    : slug.includes("keycap")
      ? "/images/keycaps.svg"
      : slug.includes("desk")
        ? "/images/mat.svg"
        : slug.includes("access")
          ? "/images/cable.svg"
          : "/images/keyboard.svg";
  event.currentTarget.src = fallback;
}

function setupReveal() {
  const elements = $$(".reveal");
  if (!("IntersectionObserver" in window)) {
    elements.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px" },
  );
  elements.forEach((el) => observer.observe(el));
}

async function me() {
  return api("/auth/me");
}

async function updateCartCount() {
  const bubble = $("#cart-count");
  if (!bubble) return;
  try {
    const result = await me();
    if (!result.user) {
      bubble.textContent = "0";
      return;
    }
    const cart = await api("/cart");
    bubble.textContent = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  } catch {
    bubble.textContent = "0";
  }
}

function setupBackButton() {
  if (location.pathname === "/" || $("#page-back")) return;
  const button = document.createElement("button");
  button.id = "page-back";
  button.className = "page-back";
  button.type = "button";
  button.setAttribute("aria-label", "Go back");
  button.title = "Go back";
  button.innerHTML = '<span aria-hidden="true">←</span><span class="page-back-label">Back</span>';
  button.addEventListener("click", () => {
    const sameSiteReferrer = document.referrer && new URL(document.referrer).origin === location.origin;
    if (sameSiteReferrer && history.length > 1) history.back();
    else location.href = "/";
  });
  document.body.appendChild(button);
}

async function renderNav() {
  const nav = $("#nav-links");
  if (!nav) return;
  setupBackButton();
  const { user } = await me();
  nav.innerHTML = `
    <a href="/">Home</a>
    <a href="/shop.html">Shop</a>
    <a href="/build-guide.html">Build guide</a>
    <div class="nav-search">
      <form id="nav-search-form">
        <input id="nav-search" aria-label="Search products" placeholder="Search products...">
        <button aria-label="Search" type="submit">⌕</button>
      </form>
    </div>
    <button class="icon-btn" id="theme-toggle" type="button" aria-label="Switch theme" title="Switch theme">☼</button>
    <a class="icon-link" href="${user ? "/account.html" : "/login.html"}" title="Account" aria-label="Account">♙</a>
    ${user && user.role === "admin" ? '<a class="icon-link" href="/admin.html" title="Admin" aria-label="Admin">⚙</a>' : ""}
    <a class="cart-link nav-cta" href="/cart.html">Cart <span id="cart-count" class="cart-count">0</span></a>
  `;

  await updateCartCount();

  const searchForm = $("#nav-search-form");
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = $("#nav-search")?.value.trim();
    location.href = value ? `/shop.html?search=${encodeURIComponent(value)}` : "/shop.html";
  });

  const themeButton = $("#theme-toggle");
  const savedTheme = localStorage.getItem("keystack-theme");
  if (savedTheme === "dark") document.body.classList.add("dark-theme");
  if (themeButton) {
    themeButton.textContent = document.body.classList.contains("dark-theme") ? "☀" : "☼";
    themeButton.title = document.body.classList.contains("dark-theme") ? "Switch to light mode" : "Switch to dark mode";
    themeButton.addEventListener("click", () => {
      document.body.classList.toggle("dark-theme");
      const dark = document.body.classList.contains("dark-theme");
      localStorage.setItem("keystack-theme", dark ? "dark" : "light");
      themeButton.textContent = dark ? "☀" : "☼";
      themeButton.title = dark ? "Switch to light mode" : "Switch to dark mode";
    });
  }

  const menu = $("#mobile-menu");
  menu?.addEventListener("click", () => nav.classList.toggle("open"));
}

function showToast(message, type = "success") {
  let toast = $("#site-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "site-toast";
    toast.className = "site-toast";
    document.body.appendChild(toast);
  }
  toast.className = `site-toast ${type}`;
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setupCancelModal() {
  if ($("#cancel-modal")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div class="modal-backdrop" id="cancel-modal" aria-hidden="true">
      <div class="cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <button class="modal-close" id="cancel-close" type="button" aria-label="Close">×</button>
        <div class="modal-icon">↩</div>
        <div class="eyebrow">ORDER CHANGE</div>
        <h2 id="cancel-title">Cancel this order?</h2>
        <p id="cancel-copy">Cancelling will return the reserved items to available stock.</p>
        <div class="modal-actions">
          <button class="btn ghost" id="cancel-keep" type="button">Keep my order</button>
          <button class="btn danger" id="cancel-confirm" type="button">Yes, cancel it</button>
        </div>
      </div>
    </div>`,
  );
}

function openCancelModal(orderId, onSuccess) {
  setupCancelModal();
  const modal = $("#cancel-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  };
  $("#cancel-close").onclick = close;
  $("#cancel-keep").onclick = close;
  $("#cancel-confirm").onclick = async () => {
    const button = $("#cancel-confirm");
    button.disabled = true;
    button.textContent = "Cancelling…";
    try {
      await api("/orders/" + orderId + "/cancel", { method: "PATCH" });
      close();
      showToast("Order cancelled. The reserved items have been returned to stock.");
      onSuccess?.();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Yes, cancel it";
    }
  };
}

function renderFooter() {
  if ($(".footer")) return;
  const footer = document.createElement("footer");
  footer.className = "footer reveal";
  footer.innerHTML = `
    <div class="container footer-grid-rich">
      <div class="footer-brand">
        <div class="footer-logo">KEY<span>STACK</span> ZA</div>
        <p>South African keyboard and desk gear for developers, gamers and remote workers.</p>
        <div class="footer-strong">Customer support is part of the build.</div>
        <div class="newsletter">
          <span>NEWSLETTER</span>
          <form id="newsletter-form"><input type="email" placeholder="your@email.com" required><button class="btn accent small">Subscribe</button></form>
          <small id="newsletter-message">Deals and new product alerts.</small>
        </div>
      </div>
      <div><strong>MY ACCOUNT</strong><a href="/account.html">Personal account</a><a href="/account.html#orders">Order status</a><a href="/cart.html">Shopping cart</a><a href="/login.html">Login</a></div>
      <div><strong>HELP &amp; SUPPORT</strong><a href="/build-guide.html">Build guide</a><a href="/shipping.html">Shipping information</a><a href="/payment.html">Payment details</a><a href="/support.html">Returns &amp; support</a></div>
      <div><strong>COMPANY</strong><a href="/about.html">About Keystack</a><a href="/contact.html">Contact us</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>
    </div>
    <div class="container footer-bottom">
      <div></div>
      <div class="secure"><span>🔒 Secure checkout</span><span class="payment-badges"><b>VISA</b><b>MC</b><b>Pay</b></span></div>
      <div class="footer-copy">© 2026 Keystack ZA. Prices shown in ZAR.</div>
    </div>
  `;
  document.body.appendChild(footer);
  $("#newsletter-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    $("#newsletter-message").textContent = "Thanks! You are subscribed to Keystack updates.";
  });
}

function productCard(product) {
  return `<article class="product-card reveal">
    <a href="/product.html?id=${product.id}">
      <div class="product-image-wrap"><img class="product-image" src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" onerror="imageFallback(event, '${esc(product.category)}')"></div>
      <div class="product-body">
        <div class="product-category">${esc(product.category)} ${product.onSale ? '<span class="sale-badge">SALE</span>' : ""}</div>
        <div class="product-name">${esc(product.name)}</div>
        <div class="product-desc">${esc(product.description)}</div>
      </div>
    </a>
    <div class="product-body" style="padding-top:0">
      <div class="product-footer">
        <span class="price">${money(product.price)} ${product.onSale ? `<del class="old-price">${money(product.originalPrice)}</del>` : ""}</span>
        <button class="btn small accent add" data-id="${product.id}" ${product.stock === 0 ? "disabled" : ""}>${product.stock === 0 ? "Out of stock" : "Add"}</button>
      </div>
    </div>
  </article>`;
}

function bindAdds() {
  $$(".add").forEach((button) =>
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const { user } = await me();
        if (!user) {
          location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
          return;
        }
        await api("/cart/items", {
          method: "POST",
          body: JSON.stringify({ product_id: Number(button.dataset.id), quantity: 1 }),
        });
        const original = button.textContent;
        button.textContent = "Added ✓";
        button.disabled = true;
        updateCartCount();
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, 900);
      } catch (error) {
        showToast(error.message, "error");
      }
    }),
  );
}

async function home() {
  const root = $("#featured-grid");
  if (!root) return;
  try {
    const products = await api("/products?featured=true");
    root.innerHTML = products.map(productCard).join("");
    bindAdds();
    setupReveal();
  } catch (error) {
    root.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
}

async function shop() {
  const root = $("#shop-grid");
  if (!root) return;
  const search = $("#search");
  const category = $("#category");
  const button = $("#search-btn");
  try {
    const categories = await api("/categories");
    category.innerHTML =
      '<option value="">All categories</option>' +
      categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join("");

    async function load() {
      const params = new URLSearchParams();
      if (search.value.trim()) params.set("search", search.value.trim());
      if (category.value) params.set("category", category.value);
      root.innerHTML = '<div class="panel" style="grid-column:1/-1">Loading products…</div>';
      const products = await api("/products?" + params.toString());
      root.innerHTML = products.length
        ? products.map(productCard).join("")
        : '<div class="panel empty" style="grid-column:1/-1"><h3>No products found</h3><p class="muted">Try another search or category.</p></div>';
      bindAdds();
      setupReveal();
    }
    button.addEventListener("click", load);
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") load();
    });
    category.addEventListener("change", load);
    await load();
  } catch (error) {
    root.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
}

function productSpecs(product) {
  const lower = product.category_slug || "";
  if (lower === "keyboards")
    return [
      ["Layout", product.name.includes("75") ? "75%" : "65%"],
      ["Build", "Hot-swap / DIY"],
      ["Use", "Work, coding & gaming"],
    ];
  if (lower === "switches")
    return [
      ["Pack size", "70 switches"],
      ["Type", product.name.toLowerCase().includes("tactile") ? "Tactile" : "Linear"],
      ["Use", "Custom keyboard builds"],
    ];
  if (lower === "keycaps")
    return [
      ["Material", "PBT"],
      ["Profile", "OEM / mixed set"],
      ["Use", "Keyboard customisation"],
    ];
  if (lower === "desk-mats")
    return [
      ["Size", "900 × 400 mm"],
      ["Finish", "Stitched edges"],
      ["Use", "Desk protection & comfort"],
    ];
  return [
    ["Category", product.category],
    ["Pricing", "South African Rand"],
    ["Support", "Beginner-friendly"],
  ];
}

function setupProductScrollEffects() {
  const page = $(".product-page");
  const image = $(".product-main-image");
  const progress = $(".progress-bar span");
  if (!page) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  let ticking = false;
  function update() {
    ticking = false;
    const scrollY = window.scrollY;
    const pageTop = page.offsetTop;
    const pageHeight = Math.max(page.offsetHeight - window.innerHeight, 1);
    const localProgress = Math.min(1, Math.max(0, (scrollY - pageTop) / pageHeight));

    if (image) {
      const move = Math.max(-18, Math.min(18, (scrollY - pageTop) * 0.035));
      const rotate = Math.max(-1.5, Math.min(1.5, (scrollY - pageTop) * 0.002));
      image.style.transform = `translate3d(0, ${move}px, 0) rotate(${rotate}deg)`;
    }
    if (progress) progress.style.width = `${Math.round(localProgress * 100)}%`;
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  requestUpdate();
}

async function buildGuidePage() {
  const root = $("#build-guide-page-root");
  if (!root) return;
  root.innerHTML = `<div class="guide-page-hero reveal"><div class="eyebrow">BUILD GUIDE</div><h1>Build your first custom keyboard with confidence.</h1><p>Start with the parts that matter most, then upgrade over time. This guide keeps the choices simple for first-time builders.</p></div><section class="section"><div class="container"><div class="grid features"><article class="feature reveal"><span class="step">01</span><h3>Choose a layout</h3><p>65% keeps the footprint compact while 75% adds practical navigation keys for everyday work.</p></article><article class="feature reveal reveal-delay-1"><span class="step">02</span><h3>Choose your switches</h3><p>Linear switches feel smooth, tactile switches add a bump, and clicky switches give a louder typing sound.</p></article><article class="feature reveal reveal-delay-2"><span class="step">03</span><h3>Pick your keycaps</h3><p>Choose a profile and colourway you like. PBT is a popular durable option for frequent use.</p></article></div></div></section><section class="section dark-section"><div class="container"><div class="guide-checklist reveal"><div class="eyebrow">BEGINNER CHECKLIST</div><h2>Keep the first build simple.</h2><p>Pick a hot-swap board, a switch pack, a keycap set and the basic tools you need. You can experiment with sound and feel later.</p><a class="btn accent" href="/shop.html">Shop build parts</a></div></div></section>`;
  setupReveal();
}

async function audiencePage() {
  const root = $("#audience-page-root");
  if (!root) return;
  const type = root.dataset.audience;
  const config = {
    developer: {
      eyebrow: "01 / FOR DEVELOPERS",
      title: "Comfort for long coding sessions.",
      intro: "Practical keyboards and desk upgrades for long hours of typing, debugging, meetings and focused work.",
      points: ["Quieter switch options", "65% & 75% layouts", "Cleaner cable setup"],
      title2: "Developer picks",
      description: "Start with a comfortable board, then fine-tune the typing feel with the right switches and accessories.",
      match: (p) =>
        !/premium magnetic|hall effect/i.test(p.name + " " + p.category) && /keyboard|switch|cable/i.test(p.name + " " + p.category),
    },
    gamer: {
      eyebrow: "02 / FOR GAMERS",
      title: "Build a setup that keeps up.",
      intro: "Fast-feeling switches, compact boards and a featured Hall Effect prebuilt for responsive play.",
      points: ["Fast input feel", "60%–75% layouts", "Hall Effect option"],
      title2: "Gamer picks",
      description: "Choose a prebuilt board or build your own around fast switches and a compact layout.",
      match: (p) => /premium magnetic|hall effect|keyboard|switch/i.test(p.name + " " + p.category),
    },
    "remote-worker": {
      eyebrow: "03 / FOR REMOTE WORKERS",
      title: "Make the daily desk feel better.",
      intro: "Comfortable typing, cleaner cable management and simple desk upgrades for the workday.",
      points: ["Comfort-first setups", "XL desk coverage", "Cable management"],
      title2: "Remote-work picks",
      description: "Build a calmer desk with a practical keyboard, large mat and small accessories that reduce clutter.",
      match: (p) =>
        !/premium magnetic|hall effect/i.test(p.name + " " + p.category) &&
        /desk|cable|keyboard|keycap/i.test(p.name + " " + p.category),
    },
  }[type];
  if (!config) {
    root.innerHTML = '<div class="panel empty"><h3>Audience page not found.</h3><a class="btn accent" href="/">Back to home</a></div>';
    return;
  }
  root.innerHTML = `<div class="audience-page-hero"><div class="eyebrow">${config.eyebrow}</div><h1>${config.title}</h1><p>${config.intro}</p><div class="audience-points">${config.points.map((point) => `<span>• ${point}</span>`).join("")}</div><a class="btn accent" href="#audience-products">Shop ${type === "remote-worker" ? "remote-work" : type} picks</a></div><section class="audience-products section" id="audience-products"><div class="section-head"><div><div class="eyebrow">Curated for you</div><h2>${config.title2}</h2><p>${config.description}</p></div><a class="btn small ghost" href="/shop.html">View all products</a></div><div id="audience-grid" class="grid products"></div></section>`;
  try {
    const products = await api("/products");
    const picks = products.filter(config.match).slice(0, 6);
    $("#audience-grid").innerHTML = picks.map(productCard).join("") || '<div class="empty">No products found.</div>';
    bindAdds();
    setupReveal();
  } catch (error) {
    $("#audience-grid").innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
}

async function productPage() {
  const root = $("#product-root");
  if (!root) return;
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = '<div class="product-shell"><div class="alert error">No product was selected.</div></div>';
    return;
  }
  try {
    const product = await api("/products/" + encodeURIComponent(id));
    const specs = productSpecs(product);
    root.innerHTML = `<div class="product-shell">
      <div class="breadcrumb reveal"><a href="/shop.html">Shop</a> / ${esc(product.category)} / ${esc(product.name)}</div>
      <section class="product-hero-grid product-scroll-scene">
        <div class="product-image-card product-float-card reveal"><span class="image-badge">Keystack ZA</span><img class="product-main-image" src="${esc(product.image)}" alt="${esc(product.name)}" onerror="imageFallback(event, '${esc(product.category)}')"></div>
        <div class="product-info reveal reveal-delay-1">
          <div class="eyebrow">${esc(product.category)}</div>
          <h1>${esc(product.name)}</h1>
          <p class="product-price">${money(product.price)} ${product.onSale ? `<del class=\"old-price\">${money(product.originalPrice)}</del>` : ""}</p>
          ${product.onSale ? '<div class=\"sale-note\">Limited offer • Save on this prebuilt Hall Effect keyboard</div>' : ""}
          <p>${esc(product.description)}</p>
          <p class="stock-note">${product.stock > 0 ? `${product.stock} units currently available` : "Currently out of stock"}</p>
          <div class="buy-row">
            <input id="quantity" class="field quantity" type="number" min="1" max="${product.stock}" value="1" ${product.stock === 0 ? "disabled" : ""}>
            <button id="add-detail" class="btn accent" ${product.stock === 0 ? "disabled" : ""}>Add to cart</button>
          </div>
          <div class="info-note">Payments are simulated for this project. Prices are displayed in ZAR.</div>
        </div>
      </section>

      <section class="product-details product-scroll-section">
        <article class="detail-card reveal"><h3>Product notes</h3><p class="muted">Keystack ZA focuses on a simple B2C shopping experience for South African customers, with clear product choices and practical buying guidance.</p></article>
        <article class="detail-card reveal reveal-delay-1"><h3>Quick specs</h3><div class="specs">${specs.map(([label, value]) => `<div class="spec"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div></article>
        <article class="detail-card reveal reveal-delay-2"><h3>Next step</h3><p class="muted">Add this item to your cart, complete the checkout form and view the order in your account.</p></article>
      </section>

      <section class="product-story reveal product-scroll-section">
        <div class="product-story-grid">
          <div><div class="scroll-label">A better buying journey</div><h2>Learn as you browse.</h2><p>Rather than overwhelming new buyers with technical terms, the product page gives a clear description, practical specs and a simple route to checkout.</p></div>
          <div><div class="scroll-label">Shopping flow</div><p>Product → Cart → Checkout → Simulated payment → Order tracking</p><div class="progress-bar"><span></span></div></div>
        </div>
      </section>
    </div>`;

    setupProductScrollEffects();

    $("#add-detail")?.addEventListener("click", async () => {
      try {
        const { user } = await me();
        if (!user) {
          location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
          return;
        }
        const quantity = Math.max(1, Number($("#quantity").value));
        await api("/cart/items", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity }) });
        location.href = "/cart.html";
      } catch (error) {
        showToast(error.message, "error");
      }
    });
    setupReveal();
  } catch (error) {
    root.innerHTML = `<div class="product-shell"><div class="alert error">${esc(error.message)}</div></div>`;
  }
}

async function login() {
  const form = $("#login-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#message");
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      location.href = new URLSearchParams(location.search).get("next") || "/account.html";
    } catch (error) {
      message.className = "alert error";
      message.textContent = error.message;
    }
  });
}

async function register() {
  const form = $("#register-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#message");
    try {
      await api("/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      location.href = "/account.html";
    } catch (error) {
      message.className = "alert error";
      message.textContent = error.message;
    }
  });
}

async function cart() {
  const root = $("#cart-root");
  if (!root) return;
  const { user } = await me();
  if (!user) {
    root.innerHTML =
      '<div class="panel empty"><h3>Log in to view your cart</h3><p class="muted">Your cart is linked to your account.</p><a class="btn accent" href="/login.html?next=/cart.html">Login</a></div>';
    return;
  }
  async function load() {
    try {
      const cartData = await api("/cart");
      if (!cartData.items.length) {
        root.innerHTML =
          '<div class="panel empty"><h3>Your cart is empty.</h3><p class="muted">Start with a keyboard, switch pack or desk accessory.</p><a class="btn accent" href="/shop.html">Browse products</a></div>';
        return;
      }
      root.innerHTML = `<div class="layout"><div class="panel">${cartData.items
        .map(
          (item) => `<div class="cart-row">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" onerror="imageFallback(event, '${esc(item.category || "")}')">
        <div><strong>${esc(item.name)}</strong><div class="muted">${money(item.price)} each</div><button class="btn small danger remove" data-id="${item.id}" style="margin-top:7px">🗑 Remove</button></div>
        <div class="qty"><button class="dec" data-id="${item.id}" data-q="${item.quantity}">−</button><span>${item.quantity}</span><button class="inc" data-id="${item.id}" data-q="${item.quantity}" data-stock="${item.stock}">+</button></div>
        <strong>${money(item.subtotal)}</strong>
      </div>`,
        )
        .join("")}</div>
      <aside class="panel"><h3>Cart summary</h3><div class="summary-line"><span>Subtotal</span><strong>${money(cartData.total)}</strong></div><div class="summary-line"><span>Shipping</span><span>Calculated at checkout</span></div><div class="summary-line summary-total"><span>Total</span><strong>${money(cartData.total)}</strong></div><a class="btn accent" style="width:100%;margin-top:15px" href="/checkout.html">Checkout</a></aside></div>`;
      $$(".remove").forEach((button) =>
        button.addEventListener("click", async () => {
          await api("/cart/items/" + button.dataset.id, { method: "DELETE" });
          await load();
          updateCartCount();
        }),
      );
      $$(".dec,.inc").forEach((button) =>
        button.addEventListener("click", async () => {
          let quantity = Number(button.dataset.q) + (button.classList.contains("inc") ? 1 : -1);
          if (button.classList.contains("inc") && quantity > Number(button.dataset.stock)) return;
          await api("/cart/items/" + button.dataset.id, { method: "PATCH", body: JSON.stringify({ quantity }) });
          await load();
          updateCartCount();
        }),
      );
    } catch (error) {
      root.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
    }
  }
  await load();
}

async function checkout() {
  const root = $("#checkout-root");
  if (!root) return;
  const { user } = await me();
  if (!user) {
    location.href = "/login.html?next=/checkout.html";
    return;
  }
  try {
    const cartData = await api("/cart");
    if (!cartData.items.length) {
      root.innerHTML =
        '<div class="panel empty"><h3>Your cart is empty.</h3><a class="btn accent" href="/shop.html">Shop products</a></div>';
      return;
    }
    root.innerHTML = `<div class="checkout-layout"><form id="checkout-form" class="panel form"><div class="checkout-head"><div><div class="eyebrow">Step 1 of 2</div><h2>Shipping & payment</h2></div><a class="btn small ghost dark-safe" href="/cart.html">Cancel checkout</a></div><p class="helper">Review your details below. You can safely return to your cart before placing the order.</p><div class="two-col"><div class="form-group"><label>Full name</label><input class="field" name="shipping_name" value="${esc(user.name)}" required></div><div class="form-group"><label>City</label><input class="field" name="shipping_city" placeholder="Johannesburg" required></div></div><div class="form-group"><label>Street address</label><input class="field" name="shipping_address" placeholder="123 Keyboard Street" required></div><div class="form-group"><label>Postal code</label><input class="field" name="shipping_postal_code" inputmode="numeric" required></div><div class="form-group"><label>Payment method</label><select class="field" name="payment_method"><option>Card</option><option>Instant EFT</option><option>Payfast</option></select></div><div class="checkout-actions"><a class="btn secondary" href="/cart.html">← Back to cart</a><button class="btn accent" type="submit">Pay & place order</button></div><div id="message"></div></form><aside class="panel checkout-summary"><div class="summary-title"><h3>Order summary</h3><span class="status">Secure</span></div>${cartData.items.map((item) => `<div class="checkout-item"><img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" onerror="imageFallback(event, '${esc(item.category || "")}')"><span>${esc(item.name)} <small>× ${item.quantity}</small></span><strong>${money(item.subtotal)}</strong></div>`).join("")}<div class="summary-line"><span>Subtotal</span><strong>${money(cartData.total)}</strong></div><div class="summary-line"><span>Shipping</span><strong>Included</strong></div><div class="summary-line summary-total"><span>Total ZAR</span><strong>${money(cartData.total)}</strong></div><div class="secure-box">🔒 This is a simulated payment. No real card details are collected.</div></aside></div>`;
    $("#checkout-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = $("#message");
      try {
        const result = await api("/orders", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
        location.href = "/account.html?order=" + result.orderId;
      } catch (error) {
        message.className = "alert error";
        message.textContent = error.message;
      }
    });
  } catch (error) {
    root.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
}

async function account() {
  const root = $("#account-root");
  if (!root) return;
  const { user } = await me();
  if (!user) {
    root.innerHTML =
      '<div class="panel empty"><h3>Please log in to view your account.</h3><a class="btn accent" href="/login.html">Login</a></div>';
    return;
  }
  try {
    const orders = await api("/orders");
    root.innerHTML = `<div class="account-grid"><section class="panel"><div class="eyebrow">Customer account</div><h2>${esc(user.name)}</h2><p>${esc(user.email)}</p><p class="muted">Use your account to review purchases and track order status.</p><button id="logout" class="btn secondary">Log out</button></section><section class="panel"><h2>Your orders</h2>${orders.length ? orders.map((order) => `<div class="order"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>Order #KS-${order.id}</strong><span class="status">${esc(order.status)}</span></div><div class="muted">${new Date(order.created_at).toLocaleString("en-ZA")} · ${money(order.total)}</div><button class="btn small ghost details" data-id="${order.id}" style="margin-top:9px">View & track order</button></div>`).join("") : '<div class="empty">No orders yet.</div>'}</section></div><div id="order-detail" class="panel" style="margin-top:20px;display:none"></div>`;
    $("#logout").addEventListener("click", async () => {
      await api("/auth/logout", { method: "POST" });
      location.href = "/";
    });
    $$(".details").forEach((button) =>
      button.addEventListener("click", async () => {
        const order = await api("/orders/" + button.dataset.id);
        const detail = $("#order-detail");
        detail.style.display = "block";
        const trackSteps = ["Paid", "Processing", "Shipped", "Delivered"];
        const activeIndex = trackSteps.indexOf(order.status);
        const timeline =
          order.status === "Cancelled"
            ? `<div class="alert error">This order has been cancelled.</div>`
            : `<div class="tracking">${trackSteps.map((step, index) => `<div class="track-step ${index <= activeIndex ? "done" : ""}"><span class="track-dot">${index <= activeIndex ? "✓" : index + 1}</span><div><strong>${step}</strong><small>${index < activeIndex ? "Completed" : index === activeIndex ? "Current status" : "Upcoming"}</small></div></div>`).join("")}</div>`;
        detail.innerHTML = `<div class="order-detail-head"><div><div class="eyebrow">Order tracking</div><h2>Order #KS-${order.id}</h2><p><span class="status">${esc(order.status)}</span></p></div>${["Paid", "Processing"].includes(order.status) ? '<button id="cancel-order" class="btn danger">Cancel order</button>' : ""}</div>${timeline}<div class="summary-line"><span>Placed</span><strong>${new Date(order.created_at).toLocaleString("en-ZA")}</strong></div><div class="summary-line"><span>Deliver to</span><strong>${esc(order.shipping_city)}</strong></div><h3 style="margin-top:18px">Items</h3>${order.items.map((item) => `<div class="summary-line"><span>${esc(item.product_name)} × ${item.quantity}</span><strong>${money(item.price * item.quantity)}</strong></div>`).join("")}<div class="summary-line summary-total"><span>Total</span><strong>${money(order.total)}</strong></div><p class="helper">Payment reference: ${esc(order.reference || "Pending")}</p>`;
        $("#cancel-order")?.addEventListener("click", () => {
          openCancelModal(order.id, () => {
            location.href = "/account.html?order=" + order.id;
          });
        });
        detail.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
    const selected = new URLSearchParams(location.search).get("order");
    if (selected) setTimeout(() => $('.details[data-id="' + selected + '"]')?.click(), 100);
  } catch (error) {
    root.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
}

async function admin() {
  const root = $("#admin-root");
  if (!root) return;
  const { user } = await me();
  if (!user || user.role !== "admin") {
    root.innerHTML = '<div class="alert error">Admin access required.</div>';
    return;
  }
  try {
    const categories = await api("/categories");
    root.innerHTML = `<div class="admin-grid"><section class="panel"><h2>Add product</h2><form id="product-form" class="form"><input class="field" name="name" placeholder="Product name" required><textarea class="field" name="description" placeholder="Description" rows="5" required></textarea><div class="two-col"><input class="field" type="number" step="0.01" name="price" placeholder="Price in ZAR" required><input class="field" type="number" name="stock" placeholder="Stock" required></div><select class="field" name="category_id">${categories.map((category) => `<option value="${category.id}">${esc(category.name)}</option>`).join("")}</select><button class="btn accent">Create product</button><div id="product-msg"></div></form></section><section class="panel"><h2>Recent orders</h2><div id="admin-orders"></div></section></div>`;
    $("#product-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      try {
        await api("/admin/products", {
          method: "POST",
          body: JSON.stringify({
            ...Object.fromEntries(new FormData(form)),
            price: Number(form.price.value),
            stock: Number(form.stock.value),
            featured: false,
          }),
        });
        $("#product-msg").className = "alert success";
        $("#product-msg").textContent = "Product created.";
        form.reset();
      } catch (error) {
        $("#product-msg").className = "alert error";
        $("#product-msg").textContent = error.message;
      }
    });
    const orders = await api("/admin/orders");
    $("#admin-orders").innerHTML = orders.length
      ? orders
          .map(
            (order) =>
              `<div class="list-item"><strong>#KS-${order.id}</strong> · ${esc(order.email)} · ${money(order.total)}<div class="muted">${esc(order.shipping_city)}</div><select class="field status-select" data-id="${order.id}" style="margin-top:8px"><option ${order.status === "Paid" ? "selected" : ""}>Paid</option><option ${order.status === "Processing" ? "selected" : ""}>Processing</option><option ${order.status === "Shipped" ? "selected" : ""}>Shipped</option><option ${order.status === "Delivered" ? "selected" : ""}>Delivered</option><option ${order.status === "Cancelled" ? "selected" : ""}>Cancelled</option></select></div>`,
          )
          .join("")
      : '<div class="empty">No orders yet.</div>';
    $$(".status-select").forEach((select) =>
      select.addEventListener("change", async () => {
        await api("/admin/orders/" + select.dataset.id, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
      }),
    );
  } catch (error) {
    root.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
}

async function init() {
  setupCancelModal();
  await renderNav();
  renderFooter();
  await Promise.all([
    home(),
    shop(),
    buildGuidePage(),
    audiencePage(),
    productPage(),
    login(),
    register(),
    cart(),
    checkout(),
    account(),
    admin(),
  ]);
  setupReveal();
}

init().catch((error) => console.error(error));
