const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "nodex.db");
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) =>
      err ? reject(err) : resolve(rows)
    )
  );
}

function get(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) =>
      err ? reject(err) : resolve(row)
    )
  );
}

async function addColumnIfMissing(table, column, definition) {
  const cols = await all(`PRAGMA table_info(${table})`);

  if (!cols.some(c => c.name === column)) {
    await run(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

async function initDatabase() {

  // ============================================================
  // WIFI
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS wifi (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    ping TEXT,
    status TEXT,
    signal TEXT,
    speed TEXT
  )`);


  // ============================================================
  // POIs
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS pois (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    category TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    status TEXT,
    details TEXT,
    phone TEXT
  )`);

  await addColumnIfMissing("pois", "category", "TEXT");
  await addColumnIfMissing("pois", "details", "TEXT");
  await addColumnIfMissing("pois", "phone", "TEXT");


  // ============================================================
  // HOSPITALS
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    lat REAL,
    lng REAL,
    status TEXT,
    details TEXT
  )`);

  await addColumnIfMissing("hospitals", "details", "TEXT");


  // ============================================================
  // NEWS
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    date TEXT,
    body TEXT
  )`);

  await addColumnIfMissing("news", "body", "TEXT");


  // ============================================================
  // COMPLAINTS
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    category TEXT,
    priority TEXT,
    description TEXT,
    location TEXT,
    lat REAL,
    lng REAL,
    status TEXT DEFAULT 'Pending',
    createdAt TEXT,
    imagePath TEXT
  )`);

  await addColumnIfMissing("complaints", "imagePath", "TEXT");


  // ============================================================
  // PROFILES
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS profiles (
    userId TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    updatedAt TEXT
  )`);


  // ============================================================
  // SOS EVENTS
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS sos_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    lat REAL,
    lng REAL,
    message TEXT,
    status TEXT DEFAULT 'Logged',
    createdAt TEXT
  )`);


  // ============================================================
  // DEAD ZONES
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS deadzones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    location TEXT,
    lat REAL,
    lng REAL,
    description TEXT,
    status TEXT DEFAULT 'Open',
    createdAt TEXT
  )`);


  // ============================================================
  // USERS - LOGIN / SIGNUP
  // ============================================================

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);


  // ============================================================
  // DEFAULT NODEX USER
  // ============================================================

  const existingUser = await get(
    `SELECT id FROM users WHERE username = ?`,
    ["CHERRY"]
  );

  if (!existingUser) {

    await run(
      `INSERT INTO users
       (username, email, password)
       VALUES (?, ?, ?)`,
      [
        "CHERRY",
        "cherry@nodex.com",
        "CODEX"
      ]
    );

    console.log("Default NODEX user created: CHERRY");
  }


  // ============================================================
  // WIFI SEED DATA
  // ============================================================

  const wifiCount =
    await get(`SELECT COUNT(*) AS count FROM wifi`);

  if (wifiCount.count === 0) {

    for (const row of [
      [
        101,
        "Central Plaza Free Wi-Fi",
        28.6145,
        77.2095,
        "14 ms",
        "Active",
        "Strong",
        "100 Mbps"
      ],
      [
        102,
        "Metro Transit Node Wi-Fi",
        28.6180,
        77.2140,
        "22 ms",
        "Active",
        "Strong",
        "50 Mbps"
      ],
      [
        103,
        "Civic Library Public Net",
        28.6090,
        77.2030,
        "45 ms",
        "Busy",
        "Moderate",
        "25 Mbps"
      ]
    ]) {

      await run(
        `INSERT INTO wifi
        (id,name,lat,lng,ping,status,signal,speed)
        VALUES (?,?,?,?,?,?,?,?)`,
        row
      );
    }
  }


  // ============================================================
  // POI SEED DATA
  // ============================================================

  const poiCount =
    await get(`SELECT COUNT(*) AS count FROM pois`);

  if (poiCount.count === 0) {

    for (const row of [
      [
        "Central Plaza",
        "landmark",
        "landmark",
        28.6145,
        77.2095,
        "Open",
        "Public city landmark",
        "N/A"
      ],
      [
        "Metro Transit Station",
        "transport",
        "transport",
        28.6180,
        77.2140,
        "Operational",
        "Public transit station",
        "N/A"
      ],
      [
        "Civic Library",
        "public",
        "public",
        28.6090,
        77.2030,
        "Open",
        "Public library",
        "N/A"
      ],
      [
        "City Police Station",
        "police",
        "police",
        28.6115,
        77.2110,
        "Operational",
        "District police station",
        "100"
      ],
      [
        "City General Hospital",
        "hospital",
        "hospitals",
        28.6160,
        77.2060,
        "Operational",
        "24/7 emergency services",
        "102"
      ],
      [
        "Green Valley Public Park",
        "parks",
        "parks",
        28.6100,
        77.2200,
        "Open",
        "Public eco zone and jogging track",
        "N/A"
      ]
    ]) {

      await run(
        `INSERT INTO pois
        (name,type,category,lat,lng,status,details,phone)
        VALUES (?,?,?,?,?,?,?,?)`,
        row
      );
    }

  } else {

    await run(
      `UPDATE pois
       SET category = COALESCE(category,type)
       WHERE category IS NULL OR category=''`
    );
  }


  // ============================================================
  // HOSPITAL SEED DATA
  // ============================================================

  const hospitalCount =
    await get(`SELECT COUNT(*) AS count FROM hospitals`);

  if (hospitalCount.count === 0) {

    for (const row of [
      [
        "City General Hospital",
        "Central City",
        "102",
        28.6160,
        77.2060,
        "Open",
        "24/7 emergency medical services"
      ],
      [
        "Metro Emergency Hospital",
        "Metro Road",
        "102",
        28.6200,
        77.2180,
        "Open",
        "Emergency and trauma care"
      ],
      [
        "Civic Care Hospital",
        "Civic Avenue",
        "102",
        28.6080,
        77.2010,
        "Open",
        "General and emergency care"
      ]
    ]) {

      await run(
        `INSERT INTO hospitals
        (name,address,phone,lat,lng,status,details)
        VALUES (?,?,?,?,?,?,?)`,
        row
      );
    }
  }


  // ============================================================
  // NEWS SEED DATA
  // ============================================================

  const newsCount =
    await get(`SELECT COUNT(*) AS count FROM news`);

  if (newsCount.count === 0) {

    const now = new Date().toISOString();

    for (const row of [
      [
        "Smart City Network Update",
        "City network services are operating normally.",
        "Network",
        now,
        "City network services are operating normally."
      ],
      [
        "Public Wi-Fi Expansion",
        "Additional public Wi-Fi nodes are available across the city.",
        "Connectivity",
        now,
        "Additional public Wi-Fi nodes are available across the city."
      ],
      [
        "Traffic System Update",
        "Traffic monitoring systems are online.",
        "Traffic",
        now,
        "Traffic monitoring systems are online."
      ]
    ]) {

      await run(
        `INSERT INTO news
        (title,description,category,date,body)
        VALUES (?,?,?,?,?)`,
        row
      );
    }

  } else {

    await run(
      `UPDATE news
       SET body = COALESCE(body,description),
           date = COALESCE(date,datetime('now'))
       WHERE body IS NULL OR body=''`
    );
  }


  // ============================================================
  // DEFAULT PROFILE
  // ============================================================

  const profile =
    await get(
      `SELECT userId
       FROM profiles
       WHERE userId=?`,
      ["PC-884920"]
    );

  if (!profile) {

    await run(
      `INSERT INTO profiles
       (userId,name,email,phone,updatedAt)
       VALUES (?,?,?,?,?)`,
      [
        "PC-884920",
        "Citizen Admin",
        "citizen@nodex.local",
        "100",
        new Date().toISOString()
      ]
    );
  }

  console.log("NODEX database initialized successfully.");
}


module.exports = {
  db,
  run,
  all,
  get,
  initDatabase,
  DB_PATH
};