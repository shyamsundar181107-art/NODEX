const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { run, all, get, initDatabase, DB_PATH } = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND = path.join(__dirname, "..");

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) =>
    cb(
      null,
      `${Date.now()}-${file.originalname.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`
    )
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// HEALTH
// ======================================================

app.get("/api/health", async (_, res) => {
  res.json({
    ok: true,
    service: "NODEX backend",
    database: "SQLite",
    time: new Date().toISOString()
  });
});

// ======================================================
// AUTH - SIGNUP
// ======================================================

app.post("/api/auth/signup", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Username, email and password are required"
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        ok: false,
        error: "Username must contain at least 3 characters"
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        ok: false,
        error: "Password must contain at least 4 characters"
      });
    }

    const existingUsername = await get(
      "SELECT id FROM users WHERE lower(username)=lower(?)",
      [username]
    );

    if (existingUsername) {
      return res.status(409).json({
        ok: false,
        error: "Username already exists"
      });
    }

    const existingEmail = await get(
      "SELECT id FROM users WHERE lower(email)=lower(?)",
      [email]
    );

    if (existingEmail) {
      return res.status(409).json({
        ok: false,
        error: "Email already exists"
      });
    }

    const result = await run(
      `INSERT INTO users(username,email,password,created_at)
       VALUES(?,?,?,?)`,
      [username, email, password, new Date().toISOString()]
    );

    const user = await get(
      "SELECT id,username,email,created_at FROM users WHERE id=?",
      [result.id]
    );

    res.status(201).json({
      ok: true,
      message: "Account created successfully",
      user
    });

  } catch (e) {
    console.error("Signup error:", e);
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

// ======================================================
// AUTH - LOGIN
// ======================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error: "Username and password are required"
      });
    }

    const user = await get(
      `SELECT id,username,email,created_at
       FROM users
       WHERE lower(username)=lower(?) AND password=?`,
      [username, password]
    );

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Invalid username or password"
      });
    }

    res.json({
      ok: true,
      message: "Login successful",
      user
    });

  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

// ======================================================
// WIFI
// ======================================================

app.get("/api/wifi", async (_, res) => {
  try {
    res.json(await all("SELECT * FROM wifi ORDER BY id"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// POIs
// ======================================================

app.get("/api/pois", async (_, res) => {
  try {
    res.json(
      await all(`
        SELECT
          id,
          name,
          COALESCE(category,type) AS category,
          lat,
          lng,
          status,
          details,
          phone
        FROM pois
        ORDER BY id
      `)
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// HOSPITALS
// ======================================================

app.get("/api/hospitals", async (_, res) => {
  try {
    res.json(
      await all(`
        SELECT
          id,
          name,
          address,
          phone,
          lat,
          lng,
          status,
          COALESCE(details,address) AS details
        FROM hospitals
        ORDER BY id
      `)
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// NEWS
// ======================================================

app.get("/api/news", async (_, res) => {
  try {
    res.json(
      await all(`
        SELECT
          id,
          title,
          COALESCE(body,description) AS body,
          COALESCE(date,'') AS date,
          category
        FROM news
        ORDER BY id DESC
      `)
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// COMPLAINTS
// ======================================================

function normalizeComplaint(row) {
  return {
    ...row,
    desc: row.description || row.title || "",
    timestamp: row.createdAt || "",
    image: row.imagePath || null
  };
}

app.get("/api/complaints", async (_, res) => {
  try {
    const rows = await all(
      "SELECT * FROM complaints ORDER BY id DESC"
    );

    res.json(rows.map(normalizeComplaint));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post(
  "/api/complaints",
  upload.single("image"),
  async (req, res) => {
    try {
      const b = req.body || {};

      const description = String(
        b.description || b.desc || b.title || ""
      ).trim();

      if (!description) {
        return res.status(400).json({
          ok: false,
          error: "Description is required"
        });
      }

      const category = String(b.category || "General");
      const priority = String(b.priority || "Medium");
      const location = String(b.location || "");

      const lat = Number.isFinite(Number(b.lat))
        ? Number(b.lat)
        : null;

      const lng = Number.isFinite(Number(b.lng))
        ? Number(b.lng)
        : null;

      const createdAt = new Date().toISOString();

      const imagePath = req.file
        ? `/uploads/${req.file.filename}`
        : null;

      const result = await run(
        `INSERT INTO complaints
        (
          title,
          category,
          priority,
          description,
          location,
          lat,
          lng,
          status,
          createdAt,
          imagePath
        )
        VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [
          description,
          category,
          priority,
          description,
          location,
          lat,
          lng,
          "Pending",
          createdAt,
          imagePath
        ]
      );

      const item = normalizeComplaint(
        await get(
          "SELECT * FROM complaints WHERE id=?",
          [result.id]
        )
      );

      res.status(201).json({
        ok: true,
        ...item,
        complaint: item
      });

    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e.message
      });
    }
  }
);

app.put("/api/complaints/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = req.body?.status;

    if (!status) {
      return res.status(400).json({
        error: "status is required"
      });
    }

    await run(
      "UPDATE complaints SET status=? WHERE id=?",
      [status, id]
    );

    const row = await get(
      "SELECT * FROM complaints WHERE id=?",
      [id]
    );

    if (!row) {
      return res.status(404).json({
        error: "Complaint not found"
      });
    }

    res.json(normalizeComplaint(row));

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// ======================================================
// PROFILE
// ======================================================

app.get("/api/profile/:userId", async (req, res) => {
  try {
    const p = await get(
      `SELECT userId,name,email,phone,updatedAt
       FROM profiles
       WHERE userId=?`,
      [req.params.userId]
    );

    if (!p) {
      return res.status(404).json({
        error: "Profile not found"
      });
    }

    res.json(p);

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

app.put("/api/profile/:userId", async (req, res) => {
  try {
    const id = req.params.userId;

    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();

    if (!name) {
      return res.status(400).json({
        error: "Name is required"
      });
    }

    await run(
      `INSERT INTO profiles
      (userId,name,email,phone,updatedAt)
      VALUES(?,?,?,?,?)
      ON CONFLICT(userId)
      DO UPDATE SET
        name=excluded.name,
        email=excluded.email,
        phone=excluded.phone,
        updatedAt=excluded.updatedAt`,
      [
        id,
        name,
        email,
        phone,
        new Date().toISOString()
      ]
    );

    res.json(
      await get(
        `SELECT userId,name,email,phone,updatedAt
         FROM profiles
         WHERE userId=?`,
        [id]
      )
    );

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// ======================================================
// SOS
// ======================================================

app.post("/api/sos", async (req, res) => {
  try {
    const b = req.body || {};

    const result = await run(
      `INSERT INTO sos_events
      (userId,lat,lng,message,status,createdAt)
      VALUES(?,?,?,?,?,?)`,
      [
        String(b.userId || "citizen"),
        b.lat == null ? null : Number(b.lat),
        b.lng == null ? null : Number(b.lng),
        String(
          b.message ||
          "Emergency SOS triggered from NODEX"
        ),
        "Logged",
        new Date().toISOString()
      ]
    );

    const event = await get(
      "SELECT * FROM sos_events WHERE id=?",
      [result.id]
    );

    res.status(201).json({
      ok: true,
      event,
      contacts: {
        police: "100",
        fire: "101",
        ambulance: "102",
        disaster: "108"
      }
    });

  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

app.get("/api/sos", async (_, res) => {
  try {
    res.json(
      await all(
        "SELECT * FROM sos_events ORDER BY id DESC"
      )
    );
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

app.post("/api/emergency", async (req, res) => {
  req.body = req.body || {};

  req.body.message =
    req.body.message ||
    "Emergency SOS triggered from NODEX";

  const b = req.body;

  try {
    const result = await run(
      `INSERT INTO sos_events
      (userId,lat,lng,message,status,createdAt)
      VALUES(?,?,?,?,?,?)`,
      [
        String(b.userId || "citizen"),
        b.lat ?? null,
        b.lng ?? null,
        b.message,
        "Logged",
        new Date().toISOString()
      ]
    );

    const event = await get(
      "SELECT * FROM sos_events WHERE id=?",
      [result.id]
    );

    res.status(201).json({
      success: true,
      event,
      location: {
        lat: b.lat ?? null,
        lng: b.lng ?? null
      },
      contacts: {
        Police: "100",
        Fire: "101",
        Ambulance: "102",
        DisasterManagement: "108"
      }
    });

  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

// ======================================================
// DEAD ZONES
// ======================================================

app.get("/api/deadzones", async (_, res) => {
  try {
    res.json(
      await all(
        "SELECT * FROM deadzones ORDER BY id DESC"
      )
    );
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

app.post("/api/deadzones", upload.none(), async (req, res) => {
  try {
    const b = req.body || {};

    const r = await run(
      `INSERT INTO deadzones
      (name,location,lat,lng,description,status,createdAt)
      VALUES(?,?,?,?,?,?,?)`,
      [
        b.name || "Dead Zone",
        b.location || "",
        b.lat ?? null,
        b.lng ?? null,
        b.description || "",
        "Open",
        new Date().toISOString()
      ]
    );

    res.status(201).json(
      await get(
        "SELECT * FROM deadzones WHERE id=?",
        [r.id]
      )
    );

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// ======================================================
// DASHBOARD
// ======================================================

app.get("/api/dashboard", async (_, res) => {
  try {
    const [
      complaints,
      wifi,
      pois,
      hospitals,
      sos,
      deadzones
    ] = await Promise.all([
      get("SELECT COUNT(*) count FROM complaints"),
      get("SELECT COUNT(*) count FROM wifi"),
      get("SELECT COUNT(*) count FROM pois"),
      get("SELECT COUNT(*) count FROM hospitals"),
      get("SELECT COUNT(*) count FROM sos_events"),
      get("SELECT COUNT(*) count FROM deadzones")
    ]);

    const status = await all(
      "SELECT status,COUNT(*) count FROM complaints GROUP BY status"
    );

    const s = Object.fromEntries(
      status.map(x => [
        String(x.status)
          .toLowerCase()
          .replace(/\s+/g, ""),
        x.count
      ])
    );

    res.json({
      complaints: {
        total: complaints.count,
        pending: s.pending || 0,
        inProgress: s.inprogress || 0,
        resolved: s.resolved || 0
      },
      deadzones: deadzones.count,
      sosEvents: sos.count,
      wifiNodes: wifi.count,
      pois: pois.count,
      hospitals: hospitals.count
    });

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// ======================================================
// GLOBAL SEARCH
// ======================================================

app.get("/api/search", async (req, res) => {
  try {
    const q = String(
      req.query.q || ""
    ).trim().toLowerCase();

    if (!q) {
      return res.json([]);
    }

    const rows = await all(
      `SELECT
        id,
        name,
        COALESCE(category,type) AS category,
        lat,
        lng,
        status,
        details,
        phone
       FROM pois
       WHERE
        lower(name) LIKE ?
        OR lower(COALESCE(category,type)) LIKE ?
       ORDER BY id`,
      [`%${q}%`, `%${q}%`]
    );

    res.json(rows);

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// ======================================================
// AI CITY ASSISTANT
// ======================================================

app.post("/api/ai/chat", async (req, res) => {
  try {
    const query = String(
      req.body?.query ||
      req.body?.message ||
      ""
    ).trim();

    const q = query.toLowerCase();

    let reply =
      "I am the NODEX City Assistant. Ask me about Wi-Fi, hospitals, complaints, news, traffic, or emergency services.";

    if (
      q.includes("wifi") ||
      q.includes("internet")
    ) {
      const x = await get(
        "SELECT COUNT(*) count FROM wifi"
      );

      reply =
        `NODEX currently has ${x.count} public Wi-Fi nodes in the database.`;

    } else if (q.includes("hospital")) {
      const x = await get(
        "SELECT COUNT(*) count FROM hospitals"
      );

      reply =
        `NODEX has ${x.count} hospitals available in the directory.`;

    } else if (q.includes("complaint")) {
      const x = await get(
        "SELECT COUNT(*) count FROM complaints"
      );

      reply =
        `There are ${x.count} complaints recorded in the system.`;

    } else if (q.includes("news")) {
      const x = await get(
        "SELECT COUNT(*) count FROM news"
      );

      reply =
        `There are ${x.count} city news items available.`;

    } else if (
      q.includes("emergency") ||
      q.includes("police")
    ) {
      reply =
        "Emergency contacts: Police 100, Fire 101, Ambulance 102, Disaster Management 108. The NODEX SOS button also logs an emergency event.";

    } else if (q.includes("traffic")) {
      reply =
        "NODEX traffic demo status is LOW congestion (22%). Use the Traffic Layer on the Digital Twin map.";
    }

    res.json({ reply });

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// ======================================================
// STATIC FILES / FRONTEND
// ======================================================

app.use(
  "/uploads",
  express.static(uploadDir)
);

app.use(
  express.static(FRONTEND)
);

app.get("/", (_, res) =>
  res.sendFile(
    path.join(FRONTEND, "index.html")
  )
);

// ======================================================
// ERROR HANDLER
// ======================================================

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error"
  });
});

// ======================================================
// START SERVER
// ======================================================

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(
        `NODEX backend running on http://localhost:${PORT}`
      );

      console.log(
        `SQLite database: ${DB_PATH}`
      );
    });

  } catch (e) {
    console.error(
      "Failed to initialize NODEX:",
      e
    );

    process.exit(1);
  }
}

startServer();