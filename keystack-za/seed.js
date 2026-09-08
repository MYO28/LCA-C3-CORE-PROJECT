const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "keystack.db"));
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf8"));

db.exec(
  `DELETE FROM payments; DELETE FROM order_items; DELETE FROM orders; DELETE FROM cart_items; DELETE FROM products; DELETE FROM categories; DELETE FROM users;`,
);

const categories = [
  ["Keyboards", "keyboards"],
  ["Switches", "switches"],
  ["Keycaps", "keycaps"],
  ["Desk Mats", "desk-mats"],
  ["Accessories", "accessories"],
];

const addCategory = db.prepare("INSERT INTO categories (name, slug) VALUES (?, ?)");
for (const category of categories) addCategory.run(...category);

const getCategoryId = (slug) => db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug).id;
const addProduct = db.prepare(`
  INSERT INTO products
  (category_id, name, description, price_cents, original_price_cents, stock, image, featured)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const products = [
  [
    "keyboards",
    "Premium Magnetic Switch 60% Keyboard",
    "Pre-built 60% keyboard with magnetic switches, fast response and adjustable actuation.",
    299900,
    399900,
    8,
    "https://computerlounge.co.nz/cdn/shop/files/eb662adcb76750dd34423c3218ccaadbd057aa7f_102677_1.png?v=1770628632&width=1214",
    1,
  ],
  [
    "keyboards",
    "Atlas 75 Hot-Swap Keyboard",
    "75% aluminium-style keyboard with a hot-swap PCB, RGB lighting and a flexible gasket-style feel.",
    219900,
    null,
    12,
    "https://landingpad.shop/cdn/shop/files/nt75-bla.png?v=1762248757&width=1066",
    1,
  ],
  [
    "keyboards",
    "Nova 65 Starter Board",
    "Compact 65% board for first-time builders with VIA-ready controls and a practical layout.",
    159900,
    null,
    18,
    "https://m.media-amazon.com/images/I/71xIWolM9PL._AC_SL1500_.jpg",
    0,
  ],
  [
    "switches",
    "Silk Linear 70-Pack",
    "Smooth factory-lubed linear switches suited to quiet office typing and gaming builds.",
    39900,
    null,
    40,
    "https://kbdfans.com/cdn/shop/files/7_08f79c76-13c3-488b-97c0-606285ea08cd.jpg?v=1685608911",
    1,
  ],
  [
    "switches",
    "Tactile Forge 70-Pack",
    "Rounded tactile bump with a medium spring weight for typing and programming.",
    42900,
    null,
    33,
    "https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/ad7c/921ff99f6c83d3c974a157d67b06869266a992918330e99f65f4a7d15052.jpg",
    0,
  ],
  [
    "keycaps",
    "Midnight PBT Keycap Set",
    "Durable PBT keycaps with a dark minimalist colourway and standard legends.",
    59900,
    null,
    21,
    "https://cdn.shopify.com/s/files/1/0059/0630/1017/t/5/assets/cherry-profile-doubleshot-pbt-keycapswhiteonblackwobfull-setmaterial-1661337453574.jpg?v=1661337455",
    1,
  ],
  [
    "keycaps",
    "SAKURA Accent Set",
    "Pink-and-cream accent keycaps for adding personality to a desk setup.",
    49900,
    null,
    17,
    "https://i5.walmartimages.com/seo/COSTOM-Cute-Pink-Sakura-Custom-Keycaps-133-Keys-Dye-Sublimation-PBT-Keycaps-MOA-Profile-Key-caps-Set-61-68-84-87-98-100-104-Cherry-MX-Mechanical-Keyb_abc15a1d-882a-4967-bfdb-332b68341ef1.3a5afb15a87b0151a991b69b1dc8d08d.jpeg",
    0,
  ],
  [
    "desk-mats",
    "Basalt XL Desk Mat",
    "900 x 400 mm desk mat with stitched edges and a smooth low-friction surface.",
    49900,
    null,
    24,
    "https://cdn.shopify.com/s/files/1/0059/0630/1017/files/Keychron-desk-mat-black.jpg?v=1723623715",
    1,
  ],
  [
    "accessories",
    "Coiled USB-C Cable",
    "Detachable coiled cable with an aviator-style connector and USB-C end.",
    32900,
    null,
    28,
    "https://mechanicalkeyboards.com/cdn/shop/files/6008_62900862c3b7c_Coiled-Keyboard-Cable-Black.jpg?v=1707262596&width=1558",
    0,
  ],
  [
    "accessories",
    "Switch & Stabiliser Tool Kit",
    "Entry-level toolkit for switch swapping, stabiliser tuning and maintenance.",
    29900,
    null,
    31,
    "https://kbdfans.com/cdn/shop/products/2_fb98ead1-ec90-4156-956b-c515a725e565.jpg?v=1632793633&width=1800",
    0,
  ],
  [
    "accessories",
    "Aluminium Desk Stand",
    "Minimal stand for displaying a keyboard or keeping your desk organised.",
    39900,
    null,
    15,
    "https://kbdfans.com/cdn/shop/files/01_ea1a6950-ce97-4cb1-a16b-6e85b07aad68.jpg?v=1773971027&width=1800",
    0,
  ],
];

for (const product of products) addProduct.run(getCategoryId(product[0]), ...product.slice(1));

const addUser = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
addUser.run("Keystack Customer", "customer@keystack.co.za", bcrypt.hashSync("Demo123!", 10), "customer");
addUser.run("Keystack Admin", "admin@keystack.co.za", bcrypt.hashSync("Admin123!", 10), "admin");

db.close();
console.log("Keystack ZA database ready.");
