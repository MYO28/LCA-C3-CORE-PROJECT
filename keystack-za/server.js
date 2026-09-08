const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Create the database folder/file when the server starts.
const dataFolder = path.join(__dirname, "data");
fs.mkdirSync(dataFolder, { recursive: true });

const db = new Database(path.join(dataFolder, "keystack.db"));
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf8"));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: "keystack-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }),
);
app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in first." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in first." });
  }

  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  next();
}

function getUser(id) {
  return db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(id);
}

function productForWebsite(product) {
  return {
    ...product,
    price: product.price_cents,
    originalPrice: product.original_price_cents,
    onSale: product.original_price_cents !== null && product.original_price_cents > product.price_cents,
    featured: Boolean(product.featured),
  };
}

function getCart(userId) {
  const items = db
    .prepare(
      `
    SELECT ci.id, ci.product_id, ci.quantity,
           p.name, p.price_cents, p.stock, p.image,
           c.name AS category
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE ci.user_id = ?
    ORDER BY ci.id DESC
  `,
    )
    .all(userId)
    .map((item) => ({
      ...item,
      price: item.price_cents,
      subtotal: item.price_cents * item.quantity,
    }));

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, total, totalCents: total };
}

function makePaymentReference() {
  return `KS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Authentication
app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = getUser(req.session.userId);
  res.json({ user: user || null });
});

app.post("/api/auth/register", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, passwordHash);

  req.session.userId = Number(result.lastInsertRowid);
  res.status(201).json({ user: getUser(req.session.userId) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  req.session.userId = user.id;
  res.json({ user: getUser(user.id) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out." }));
});

// Products
app.get("/api/categories", (req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY name").all());
});

app.get("/api/products", (req, res) => {
  const filters = [];
  const values = [];

  if (req.query.category) {
    filters.push("c.slug = ?");
    values.push(req.query.category);
  }

  if (req.query.search) {
    const search = `%${req.query.search.toLowerCase()}%`;
    filters.push("(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ?)");
    values.push(search, search);
  }

  if (req.query.featured === "true") {
    filters.push("p.featured = 1");
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const products = db
    .prepare(
      `
    SELECT p.*, c.name AS category, c.slug AS category_slug
    FROM products p
    JOIN categories c ON c.id = p.category_id
    ${where}
    ORDER BY p.featured DESC, p.id DESC
  `,
    )
    .all(...values);

  res.json(products.map(productForWebsite));
});

app.get("/api/products/:id", (req, res) => {
  const product = db
    .prepare(
      `
    SELECT p.*, c.name AS category, c.slug AS category_slug
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `,
    )
    .get(req.params.id);

  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(productForWebsite(product));
});

app.post("/api/products", requireAdmin, (req, res) => {
  const categoryId = Number(req.body.category_id);
  const name = (req.body.name || "").trim();
  const description = (req.body.description || "").trim();
  const price = Number(req.body.price);
  const stock = Number(req.body.stock);
  const image = req.body.image || "/images/keycaps.svg";

  if (!categoryId || !name || !description || price < 0 || stock < 0) {
    return res.status(400).json({ error: "Please provide valid product details." });
  }

  const result = db
    .prepare(
      `
    INSERT INTO products (category_id, name, description, price_cents, stock, image, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(categoryId, name, description, Math.round(price * 100), stock, image, req.body.featured ? 1 : 0);

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put("/api/products/:id", requireAdmin, (req, res) => {
  const result = db
    .prepare(
      `
    UPDATE products
    SET category_id = ?, name = ?, description = ?, price_cents = ?, stock = ?, image = ?, featured = ?
    WHERE id = ?
  `,
    )
    .run(
      Number(req.body.category_id),
      (req.body.name || "").trim(),
      (req.body.description || "").trim(),
      Math.round(Number(req.body.price) * 100),
      Number(req.body.stock),
      req.body.image || "/images/keycaps.svg",
      req.body.featured ? 1 : 0,
      req.params.id,
    );

  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.json({ message: "Product updated." });
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.json({ message: "Product deleted." });
});

// Cart
app.get("/api/cart", requireLogin, (req, res) => {
  res.json(getCart(req.session.userId));
});

app.post("/api/cart/items", requireLogin, (req, res) => {
  const productId = Number(req.body.product_id);
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const product = db.prepare("SELECT id, stock FROM products WHERE id = ?").get(productId);

  if (!product) return res.status(404).json({ error: "Product not found." });
  if (quantity > product.stock) return res.status(400).json({ error: "Not enough stock available." });

  const existing = db
    .prepare("SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?")
    .get(req.session.userId, productId);

  const newQuantity = (existing ? existing.quantity : 0) + quantity;
  if (newQuantity > product.stock) {
    return res.status(400).json({ error: "Requested quantity exceeds stock." });
  }

  db.prepare(
    `
    INSERT INTO cart_items (user_id, product_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, product_id)
    DO UPDATE SET quantity = excluded.quantity
  `,
  ).run(req.session.userId, productId, newQuantity);

  res.json(getCart(req.session.userId));
});

app.patch("/api/cart/items/:id", requireLogin, (req, res) => {
  const quantity = Number(req.body.quantity);
  const item = db
    .prepare(
      `
    SELECT ci.id, p.stock
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.id = ? AND ci.user_id = ?
  `,
    )
    .get(req.params.id, req.session.userId);

  if (!item) return res.status(404).json({ error: "Cart item not found." });

  if (quantity <= 0) {
    db.prepare("DELETE FROM cart_items WHERE id = ?").run(item.id);
  } else if (quantity <= item.stock) {
    db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(quantity, item.id);
  } else {
    return res.status(400).json({ error: "Quantity exceeds stock." });
  }

  res.json(getCart(req.session.userId));
});

app.delete("/api/cart/items/:id", requireLogin, (req, res) => {
  db.prepare("DELETE FROM cart_items WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  res.json(getCart(req.session.userId));
});

// Checkout and orders
app.post("/api/orders", requireLogin, (req, res) => {
  const cart = getCart(req.session.userId);
  if (!cart.items.length) return res.status(400).json({ error: "Your cart is empty." });

  const name = (req.body.shipping_name || "").trim();
  const address = (req.body.shipping_address || "").trim();
  const city = (req.body.shipping_city || "").trim();
  const postalCode = (req.body.shipping_postal_code || "").trim();
  const paymentMethod = req.body.payment_method || "Card (Simulation)";

  if (!name || !address || !city || !postalCode) {
    return res.status(400).json({ error: "Please complete all shipping fields." });
  }

  try {
    const result = db.transaction(() => {
      // Make sure stock has not changed since the cart was loaded.
      for (const item of cart.items) {
        const product = db.prepare("SELECT stock FROM products WHERE id = ?").get(item.product_id);
        if (!product || product.stock < item.quantity) {
          throw new Error(`Stock changed for ${item.name}. Please update your cart.`);
        }
      }

      const order = db
        .prepare(
          `
        INSERT INTO orders
        (user_id, total_cents, status, shipping_name, shipping_address, shipping_city, shipping_postal_code)
        VALUES (?, ?, 'Paid', ?, ?, ?, ?)
      `,
        )
        .run(req.session.userId, cart.total, name, address, city, postalCode);

      const orderId = Number(order.lastInsertRowid);
      const addOrderItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, price_cents, quantity)
        VALUES (?, ?, ?, ?, ?)
      `);
      const reduceStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

      for (const item of cart.items) {
        addOrderItem.run(orderId, item.product_id, item.name, item.price_cents, item.quantity);
        reduceStock.run(item.quantity, item.product_id);
      }

      const reference = makePaymentReference();
      db.prepare(
        `
        INSERT INTO payments (order_id, method, reference, amount_cents, status)
        VALUES (?, ?, ?, ?, 'Completed')
      `,
      ).run(orderId, paymentMethod, reference, cart.total);

      db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.session.userId);
      return { orderId, reference };
    })();

    res.status(201).json({ ...result, total: cart.total });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/orders", requireLogin, (req, res) => {
  const orders = db
    .prepare(
      `
    SELECT id, total_cents, status, created_at
    FROM orders
    WHERE user_id = ?
    ORDER BY id DESC
  `,
    )
    .all(req.session.userId)
    .map((order) => ({
      ...order,
      total: order.total_cents,
    }));

  res.json(orders);
});

app.get("/api/orders/:id", requireLogin, (req, res) => {
  const order = db
    .prepare(
      `
    SELECT o.*, p.reference, p.method, p.status AS payment_status
    FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE o.id = ? AND o.user_id = ?
  `,
    )
    .get(req.params.id, req.session.userId);

  if (!order) return res.status(404).json({ error: "Order not found." });

  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(order.id)
    .map((item) => ({
      ...item,
      price: item.price_cents,
    }));

  res.json({ ...order, total: order.total_cents, items });
});

app.patch("/api/orders/:id/cancel", requireLogin, (req, res) => {
  try {
    const orderId = db.transaction(() => {
      const order = db.prepare("SELECT id, status FROM orders WHERE id = ? AND user_id = ?").get(req.params.id, req.session.userId);

      if (!order) throw new Error("Order not found.");
      if (!["Paid", "Processing"].includes(order.status)) {
        throw new Error("This order can no longer be cancelled.");
      }

      const items = db.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?").all(order.id);
      const restoreStock = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");

      for (const item of items) {
        restoreStock.run(item.quantity, item.product_id);
      }

      db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(order.id);
      db.prepare("UPDATE payments SET status = 'Refunded' WHERE order_id = ?").run(order.id);

      return order.id;
    })();

    res.json({ message: "Order cancelled.", orderId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin orders
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db
    .prepare(
      `
    SELECT o.id, o.total_cents, o.status, o.shipping_name, o.shipping_city, o.created_at, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    ORDER BY o.id DESC
  `,
    )
    .all()
    .map((order) => ({ ...order, total: order.total_cents }));

  res.json(orders);
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const statuses = ["Pending Payment", "Paid", "Processing", "Shipped", "Delivered", "Cancelled"];

  if (!statuses.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid order status." });
  }

  const result = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Order not found." });

  res.json({ message: "Order status updated." });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Keystack ZA running at http://localhost:${PORT}`);
});
