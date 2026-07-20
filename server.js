
/**
 * ====================================================================
 * BACKEND NODE.JS + EXPRESS CON CONECTOR MYSQL (WAMP STACK / PHPMYADMIN)
 * DESIGNS CRM - AGENCIA PIXEL PERFECT
 * ====================================================================
 * 
 * Este archivo está preparado para que puedas descargar el proyecto y correrlo
 * localmente en Visual Studio Code. Utiliza el módulo 'mysql2' para conectarse
 * a tu servidor WAMP (MySQL / MariaDB) utilizando phpMyAdmin.
 * 
 * INSTRUCCIONES DE USO EN VS CODE:
 * 1. Instala las dependencias necesarias:
 *    npm install
 * 
 * 2. Asegúrate de iniciar WAMP Server (Apache y MySQL activos).
 * 
 * 3. Importa el archivo 'database.sql' en tu phpMyAdmin para crear la BD y cargar los datos semilla.
 * 
 * 4. Crea o edita tu archivo '.env' con los siguientes campos:
 *    PORT=3000
 *    DB_HOST=localhost
 *    DB_USER=root
 *    DB_PASSWORD=
 *    DB_NAME=designs_crm
 *    GEMINI_API_KEY=tu_api_key_de_google_gemini
 * 
 * 5. Ejecuta este backend usando:
 *    npm run dev
 */

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const argon2 = require("argon2");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
const webpush = require("web-push");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET es obligatorio en producción.");
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET no configurado: se usará una clave efímera solo para desarrollo.");
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const PUSH_ENABLED = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
if (PUSH_ENABLED) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
} else {
  console.warn("⚠️ Web Push desactivado: configura VAPID_SUBJECT, VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.");
}

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const LOCAL_SEED_PASSWORD = "demo";
const LOCAL_SEED_USERS = [
  { username: "demo", role: "Colaborador", salt: "9a03b5f92bdc489c" },
  { username: "adriana", role: "Admin General", salt: "8c05b2f92bdc234a" },
  { username: "jorge", role: "Administración", salt: "7c01b2f52bdc567b" },
  { username: "carlos", role: "Gerente Dev", salt: "5c03b1f92bdc112d" },
  { username: "sofia", role: "Gerente Web", salt: "4c02b3f92bdc889e" }
];

const allowedOrigins = CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const corsOptions = {
  origin: function(origin, callback) {
    // Permitir wildcard en desarrollo si se activa la variable de entorno
    if (process.env.ALLOW_CORS_WILDCARD === "true") {
      return callback(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// Habilitar CORS y lectura de cuerpos JSON
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, skipSuccessfulRequests: true, message: { error: "Demasiados intentos de autenticación. Intenta nuevamente en 15 minutos." } });
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Se alcanzó el límite temporal de solicitudes de IA." } });

app.use("/api", apiLimiter);
app.use(["/api/auth/login", "/api/auth/quick-login", "/api/auth/signup", "/api/auth/refresh"], authLimiter);

app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object") {
      const { details, ...safeBody } = body;
      return sendJson(safeBody);
    }
    return sendJson(body);
  };
  next();
});

// Configuración del Pool de Conexiones a MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "",
  database: process.env.DB_NAME || "designs_crm",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4_unicode_ci",
  dateStrings: true
});

// Probar conexión a la base de datos al arrancar
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Conexión exitosa a la base de datos de phpMyAdmin (MySQL)");
    connection.release();
    await ensureAuthSchema();
    await ensureUserProfileColumns();
    await ensureDeletedUsersTable();
    await ensureWebProjectsTable();
    await ensureSettingsTable();
    await ensureKanbanTable();
    await ensureTaskStatusColumn();
    await ensureInvoiceColumns();
    await ensurePushSchema();
    if (process.env.ENABLE_DEMO_SEED === "true") {
      await ensureLocalSeedUsers();
      console.warn("⚠️ Usuarios demo habilitados explícitamente para desarrollo local.");
    }
    console.log("Usuarios semilla sincronizados para acceso local.");
  } catch (error) {
    console.error("❌ Error conectando a la base de datos de WAMP (phpMyAdmin):");
    console.error(error.message);
    console.log("👉 Asegúrate de que WAMP Server esté encendido, que creaste la base de datos 'designs_crm' y que importaste 'database.sql'.");
  }
})();

async function ensureAuthSchema() {
  // Argon2 hashes are longer than the legacy 64-character SHA-256 hashes.
  await pool.query("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL");
  await pool.execute(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (username)
      REFERENCES users(username) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureUserProfileColumns() {
  const columns = [
    ["name", "VARCHAR(120) NULL"], ["email", "VARCHAR(150) NULL"],
    ["area", "VARCHAR(100) NULL"], ["status", "ENUM('Activo','Bloqueado') NOT NULL DEFAULT 'Activo'"]
  ];
  for (const [name, definition] of columns) {
    const [found] = await pool.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME=?", [name]);
    if (!found.length) await pool.query(`ALTER TABLE users ADD COLUMN \`${name}\` ${definition}`);
  }
  await pool.execute(`UPDATE users SET
    name=COALESCE(name,CASE username WHEN 'adriana' THEN 'Adriana García López' WHEN 'jorge' THEN 'Jorge Ramírez Acosta' WHEN 'carlos' THEN 'Carlos Mendoza Ruiz' WHEN 'sofia' THEN 'Sofía Rodríguez Vega' ELSE username END),
    email=COALESCE(email,CONCAT(username,'@designs.mx')),
    area=COALESCE(area,CASE role WHEN 'Admin General' THEN 'Dirección' WHEN 'Administración' THEN 'Administración' WHEN 'Gerente Dev' THEN 'Desarrollo' WHEN 'Gerente Web' THEN 'Páginas web' ELSE 'General' END)`);
}

async function ensureDeletedUsersTable() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS deleted_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    name VARCHAR(120) NULL,
    email VARCHAR(150) NULL,
    role VARCHAR(50) NULL,
    area VARCHAR(100) NULL,
    status VARCHAR(20) NULL,
    snapshot JSON NOT NULL,
    deleted_by VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_deleted_users_username (username),
    INDEX idx_deleted_users_date (deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function restoreSnapshotRows(connection, table, rows) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    const escapedColumns = columns.map((column) => `\`${column.replace(/`/g, "``")}\``).join(",");
    const placeholders = columns.map(() => "?").join(",");
    await connection.execute(`INSERT IGNORE INTO \`${table}\` (${escapedColumns}) VALUES (${placeholders})`, columns.map((column) => row[column]));
  }
}

async function ensureWebProjectsTable() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS web_projects (
    id VARCHAR(50) NOT NULL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    client_name VARCHAR(150) NOT NULL,
    manager VARCHAR(100) NOT NULL DEFAULT '',
    designer VARCHAR(100) NOT NULL DEFAULT '',
    builder VARCHAR(100) NOT NULL DEFAULT '',
    start_date DATE NULL,
    due_date DATE NULL,
    progress INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'Diseño inicial',
    priority VARCHAR(20) NOT NULL DEFAULT 'Media',
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_web_projects_user FOREIGN KEY (username)
      REFERENCES users(username) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureSettingsTable() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS settings (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    data JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureKanbanTable() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS kanban_cards (id VARCHAR(50) PRIMARY KEY, board VARCHAR(50) NOT NULL, stage VARCHAR(50) NOT NULL, title VARCHAR(180) NOT NULL, subtitle VARCHAR(180) DEFAULT '', priority ENUM('Alta','Media','Baja') DEFAULT 'Media', tags JSON NOT NULL, progress INT NULL, assignee VARCHAR(10) DEFAULT 'D', due_date VARCHAR(10) DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const cards=[['k1','nuevo','AutoPartes del Norte','Prospecto','Media',['E-commerce'],null,'D','01-29'],['k2','nuevo','Clínica Dental Sonrisa','Prospecto','Media',['Landing'],null,'D','02-05'],['k3','contactado','Bufete Garza & Asoc.','Prospecto','Alta',['Web'],10,'D','01-22'],['k4','reunion','Constructora Pedraza','Prospecto','Alta',['Portal','Dev'],25,'C','01-18'],['k5','cotizacion','Distrib. Central GDL','Prospecto','Alta',['E-commerce'],50,'D','01-23'],['k6','seguimiento','Esc. Montessori Cima','Prospecto','Media',['LMS','Web'],60,'S','01-28'],['k7','ganado','Bufete Garza & Asoc.','Nuevo cliente','Alta',['Web'],100,'D','01-04'],['k8','perdido','Rest. La Hacienda','Excliente','Baja',['Landing'],null,'D','12-25']];
  for(const c of cards) await pool.execute("INSERT IGNORE INTO kanban_cards (id,board,stage,title,subtitle,priority,tags,progress,assignee,due_date) VALUES (?,'comercial',?,?,?,?,?,?,?,?)",[c[0],c[1],c[2],c[3],c[4],JSON.stringify(c[5]),c[6],c[7],c[8]]);
}

async function ensureTaskStatusColumn() {
  const [found] = await pool.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tasks' AND COLUMN_NAME='status'");
  if (!found.length) {
    await pool.query("ALTER TABLE tasks ADD COLUMN status VARCHAR(20) NULL AFTER column_name");
    await pool.query(`UPDATE tasks SET status=CASE
      WHEN column_name='Entregado' THEN 'Completada'
      WHEN column_name='Backlog' THEN 'Pendiente'
      WHEN column_name='QA' THEN 'Urgente'
      ELSE 'En proceso'
    END WHERE status IS NULL`);
    await pool.query("ALTER TABLE tasks MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Pendiente'");
  }
}

async function ensureInvoiceColumns() {
  await pool.query("ALTER TABLE invoices MODIFY COLUMN due_date DATE NULL");
  const columns = [
    ["payment_date", "DATE NULL"],
    ["payment_method", "VARCHAR(40) NULL"],
    ["is_invoiced", "TINYINT(1) NOT NULL DEFAULT 0"]
  ];
  for (const [name, definition] of columns) {
    const [found] = await pool.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND COLUMN_NAME=?", [name]);
    if (!found.length) await pool.query(`ALTER TABLE invoices ADD COLUMN \`${name}\` ${definition}`);
  }
}

async function ensurePushSchema() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id CHAR(64) NOT NULL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_push_username (username),
    CONSTRAINT fk_push_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS push_deliveries (
    subscription_id CHAR(64) NOT NULL,
    event_key VARCHAR(190) NOT NULL,
    delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subscription_id, event_key),
    CONSTRAINT fk_push_delivery_subscription FOREIGN KEY (subscription_id)
      REFERENCES push_subscriptions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

function pushSubscriptionId(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

async function sendPushToRows(rows, payload, eventKey = null) {
  if (!PUSH_ENABLED) return;
  await Promise.allSettled(rows.map(async (row) => {
    if (eventKey) {
      const [delivered] = await pool.execute(
        "SELECT 1 FROM push_deliveries WHERE subscription_id=? AND event_key=? LIMIT 1",
        [row.id, eventKey]
      );
      if (delivered.length) return;
    }
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { TTL: 86400 });
      if (eventKey) await pool.execute("INSERT IGNORE INTO push_deliveries (subscription_id,event_key) VALUES (?,?)", [row.id, eventKey]);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.execute("DELETE FROM push_subscriptions WHERE id=?", [row.id]);
      } else {
        console.error("No se pudo enviar Web Push:", error.message);
      }
    }
  }));
}

async function sendPushToAssignee(assignee, payload) {
  if (!PUSH_ENABLED || !assignee) return;
  const [rows] = await pool.execute(
    `SELECT ps.id,ps.endpoint,ps.p256dh,ps.auth
       FROM push_subscriptions ps JOIN users u ON u.username=ps.username
      WHERE LOWER(?) IN (LOWER(u.username), LOWER(u.name))
         OR LOWER(u.name) LIKE CONCAT(LOWER(?), '%')`,
    [assignee, assignee]
  );
  await sendPushToRows(rows, payload);
}

async function sendPushToOtherUsers(actorUsername, payload) {
  if (!PUSH_ENABLED || !actorUsername) return;
  const [rows] = await pool.execute(
    `SELECT ps.id,ps.endpoint,ps.p256dh,ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.username=ps.username
      WHERE ps.username<>? AND u.status='Activo'`,
    [actorUsername]
  );
  await sendPushToRows(rows, payload);
}

async function sendRenewalPushes() {
  if (!PUSH_ENABLED) return;
  try {
    const [clientsDue] = await pool.execute(
      `SELECT id,company_name AS companyName,next_renewal AS nextRenewal,
              DATEDIFF(next_renewal,CURDATE()) AS days
         FROM clients
        WHERE next_renewal IS NOT NULL AND next_renewal <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND status <> 'Suspendido'`
    );
    const [subscriptions] = await pool.execute(
      `SELECT ps.id,ps.endpoint,ps.p256dh,ps.auth
         FROM push_subscriptions ps JOIN users u ON u.username=ps.username
        WHERE u.role IN ('Admin General','Administración','Gerente Dev','Gerente Web')`
    );
    for (const client of clientsDue) {
      const days = Number(client.days);
      const dateKey = new Date(client.nextRenewal).toISOString().slice(0, 10);
      await sendPushToRows(subscriptions, {
        title: days < 0 ? "Vencimiento de cliente" : "Renovación próxima",
        body: days < 0 ? `${client.companyName} tiene un vencimiento pendiente.` : `${client.companyName} vence ${days === 0 ? "hoy" : `en ${days} día${days === 1 ? "" : "s"}`}.`,
        url: "/?view=clients",
        tag: `renewal:${client.id}:${dateKey}`
      }, `renewal:${client.id}:${dateKey}`);
    }
  } catch (error) {
    console.error("Error revisando vencimientos para Web Push:", error.message);
  }
}

// Legacy helper para SHA256 con salt usado por los datos semilla heredados
function legacyHashPassword(password, salt) {
  return crypto
    .createHash("sha256")
    .update(password + salt)
    .digest("hex");
}

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1
  });
}

async function verifyPassword(password, storedHash, salt) {
  if (typeof storedHash !== "string") {
    return false;
  }

  if (storedHash.startsWith("$argon2")) {
    return argon2.verify(storedHash, password);
  }

  if (salt) {
    return legacyHashPassword(password, salt) === storedHash;
  }

  return false;
}

async function ensureLocalSeedUsers() {
  const seedUsers = LOCAL_SEED_USERS.map(({ username, role, salt }) => ({
    username,
    passwordHash: legacyHashPassword(LOCAL_SEED_PASSWORD, salt),
    salt,
    role
  }));

  const placeholders = seedUsers.map(() => "(?, ?, ?, ?)").join(", ");
  const values = seedUsers.flatMap(({ username, passwordHash, salt, role }) => [
    username,
    passwordHash,
    salt,
    role
  ]);

  await pool.execute(
    `INSERT IGNORE INTO users (username, password_hash, salt, role) VALUES ${placeholders}`,
    values
  );
}

// Helper: Crear y guardar refresh token en BD (dev: 30 días)
async function createRefreshToken(username, daysValid = 30) {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);
  await pool.execute("INSERT INTO refresh_tokens (token_hash, username, expires_at) VALUES (?, ?, ?)", [tokenHash, username, expiresAt.toISOString().slice(0,19).replace('T',' ')]);
  return token;
}

// Helper: revoke refresh token
async function revokeRefreshToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.execute("DELETE FROM refresh_tokens WHERE token_hash = ?", [tokenHash]);
}

const CLIENT_STATUSES = ["Activo", "Próximo a vencer", "Vencido", "Suspendido"];

function getClientInitials(companyName = "") {
  const parts = companyName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return companyName.trim().slice(0, 2).toUpperCase() || "CL";
}

function normalizeClientStatus(status) {
  return CLIENT_STATUSES.includes(status) ? status : "Activo";
}

function normalizeDateInput(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
}

function buildClientPayload(body = {}, existingClient = {}) {
  const companyName = body.companyName?.trim() || existingClient.companyName || "";
  const contactName = body.contactName?.trim() || existingClient.contactName || "";
  const email = body.email?.trim() || existingClient.email || "";
  const phone = body.phone?.trim() || existingClient.phone || null;
  const responsible = body.responsible?.trim() || existingClient.responsible || null;
  const nextRenewal = normalizeDateInput(body.nextRenewal || existingClient.nextRenewal);
  const avatarInitials = body.avatarInitials?.trim() || existingClient.avatarInitials || getClientInitials(companyName);
  const avatarBg = body.avatarBg?.trim() || existingClient.avatarBg || "bg-[#1d63ff]";

  return {
    companyName,
    contactName,
    email,
    phone,
    status: normalizeClientStatus(body.status || existingClient.status),
    services: Number(body.services || existingClient.services || 1),
    responsible,
    nextRenewal,
    avatarInitials,
    avatarBg
  };
}

// ====================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ====================================================================
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado. Token faltante." });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [users] = await pool.execute(
      "SELECT username, role, status FROM users WHERE username = ? LIMIT 1",
      [payload.username]
    );
    if (!users.length || users[0].status !== "Activo") {
      return res.status(401).json({ error: "Sesión inválida o cuenta bloqueada." });
    }
    req.username = users[0].username;
    req.role = users[0].role;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sesión inválida o expirada." });
  }
}

const ROLE_KEY_BY_NAME = {
  admin_general: "admin_general",
  "Admin General": "admin_general",
  administracion: "administracion",
  "Administración": "administracion",
  gerente_dev: "gerente_dev",
  "Gerente Dev": "gerente_dev",
  gerente_web: "gerente_web",
  "Gerente Web": "gerente_web"
};

const PERMISSIONS = {
  clients: ["admin_general", "administracion", "gerente_dev", "gerente_web"],
  leads: ["admin_general", "administracion"],
  services: ["admin_general", "administracion"],
  billing: ["admin_general", "administracion"],
  renewals: ["admin_general", "administracion"],
  quotes: ["admin_general", "administracion", "gerente_dev", "gerente_web"],
  projects: ["admin_general", "administracion", "gerente_dev"],
  projects_web: ["admin_general", "gerente_web"],
  kanban: ["admin_general", "administracion", "gerente_dev", "gerente_web"],
  tasks: ["admin_general", "administracion", "gerente_dev", "gerente_web"],
  staff: ["admin_general", "gerente_dev", "gerente_web"],
  credentials: ["admin_general"],
  reports: ["admin_general", "administracion"],
  users: ["admin_general"],
  settings: ["admin_general"]
};

function requirePermission(permission) {
  return (req, res, next) => {
    const roleKey = ROLE_KEY_BY_NAME[req.role];
    if (!roleKey || !PERMISSIONS[permission]?.includes(roleKey)) {
      return res.status(403).json({ error: "No tienes permiso para acceder a este recurso." });
    }
    next();
  };
}

function requireModulePermission(req, res, next) {
  if (!PERMISSIONS[req.params.module]) return next();
  return requirePermission(req.params.module)(req, res, next);
}

// ====================================================================
// ENDPOINTS DE AUTENTICACIÓN (LOGIN & SIGNUP)
// ====================================================================

// Registro de Usuario Nuevo
app.post("/api/auth/signup", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,50}$/.test(username.trim())) {
    return res.status(400).json({ error: "El usuario debe tener entre 3 y 50 caracteres válidos." });
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: "La contraseña debe tener entre 12 y 128 caracteres." });
  }

  const normalizedUser = username.trim().toLowerCase();

  try {
    // Verificar si el usuario ya existe
    const [existing] = await pool.execute(
      "SELECT username FROM users WHERE username = ?",
      [normalizedUser]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "El usuario ya existe en la base de datos." });
    }

    const passwordHash = await hashPassword(password);
    const defaultRole = normalizedUser === "adriana" ? "Admin General" : "Colaborador";

    // Insertar en MySQL
    await pool.execute(
      "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)",
      [normalizedUser, passwordHash, "", defaultRole]
    );

    // Generar JWT y refresh token
    const accessToken = jwt.sign({ username: normalizedUser, role: defaultRole }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = await createRefreshToken(normalizedUser, 30);
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    };
    res.cookie('refreshToken', refreshToken, cookieOptions);

    res.json({
      success: true,
      user: {
        username: normalizedUser,
        projectsCount: 0,
        role: defaultRole
      },
      sessionId: accessToken
    });
  } catch (err) {
    console.error("Error en registro:", err);
    res.status(500).json({ error: "Error interno al crear usuario.", details: err.message });
  }
});

// Inicio de Sesión
app.post("/api/auth/quick-login", async (req, res) => {
  if (IS_PRODUCTION) return res.status(404).json({ error: "Recurso no encontrado." });

  const allowedUsers = new Set(["adriana", "jorge", "carlos", "sofia"]);
  const normalizedUser = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  if (!allowedUsers.has(normalizedUser)) {
    return res.status(400).json({ error: "Usuario de acceso rápido no válido." });
  }

  try {
    const [users] = await pool.execute(
      "SELECT username, role, status FROM users WHERE username = ? LIMIT 1",
      [normalizedUser]
    );
    if (!users.length || users[0].status !== "Activo") {
      return res.status(401).json({ error: "Acceso rápido no disponible." });
    }

    const dbUser = users[0];
    const [[projectCount]] = await pool.execute(
      "SELECT COUNT(*) AS count FROM projects WHERE username = ?",
      [dbUser.username]
    );
    const accessToken = jwt.sign({ username: dbUser.username, role: dbUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = await createRefreshToken(dbUser.username, 30);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "strict",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    return res.json({
      success: true,
      user: { username: dbUser.username, projectsCount: projectCount.count, role: dbUser.role },
      sessionId: accessToken
    });
  } catch (err) {
    console.error("Error en acceso rápido:", err);
    return res.status(500).json({ error: "Error interno al iniciar sesión." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Faltan credenciales" });
  }

  const normalizedUser = username.trim().toLowerCase();

  try {
    const [users] = await pool.execute(
      "SELECT username, password_hash, salt, role, status FROM users WHERE username = ?",
      [normalizedUser]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    const dbUser = users[0];
    if (dbUser.status !== "Activo") {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    const validPassword = await verifyPassword(password, dbUser.password_hash, dbUser.salt);
    if (!validPassword) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    if (!dbUser.password_hash.startsWith("$argon2")) {
      const upgradedHash = await hashPassword(password);
      await pool.execute(
        "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
        [upgradedHash, "", dbUser.username]
      );
    }

    // Contar proyectos creados por el usuario
    const [projectCountRows] = await pool.execute(
      "SELECT COUNT(*) as count FROM projects WHERE username = ?",
      [normalizedUser]
    );
    const projectsCount = projectCountRows[0].count;

    const accessToken = jwt.sign({ username: dbUser.username, role: dbUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = await createRefreshToken(dbUser.username, 30);

    // Set refresh token in HttpOnly cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    };
    res.cookie('refreshToken', refreshToken, cookieOptions);

    res.json({
      success: true,
      user: {
        username: dbUser.username,
        projectsCount,
        role: dbUser.role
      },
      sessionId: accessToken
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error interno al iniciar sesión.", details: err.message });
  }
});

// Obtener Estado de Sesión Actual
app.get("/api/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.json({ user: null });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const username = payload.username;

    const [users] = await pool.execute(
      "SELECT username, role, status FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0 || users[0].status !== "Activo") {
      return res.json({ user: null });
    }

    const dbUser = users[0];
    const [projectCountRows] = await pool.execute(
      "SELECT COUNT(*) as count FROM projects WHERE username = ?",
      [dbUser.username]
    );
    const projectsCount = projectCountRows[0].count;

    res.json({
      user: {
        username: dbUser.username,
        projectsCount,
        role: dbUser.role
      }
    });
  } catch (err) {
    res.json({ user: null, error: err.message });
  }
});

// Refresh token endpoint - exchange refresh token for new access token (and rotate refresh token)
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const cookieToken = req.cookies?.refreshToken;
    if (!cookieToken) return res.status(400).json({ error: 'Refresh token cookie requerido.' });

    const tokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex');
    const [rows] = await pool.execute(
      `SELECT rt.username, rt.expires_at, u.role, u.status
       FROM refresh_tokens rt
       INNER JOIN users u ON u.username = rt.username
       WHERE rt.token_hash = ?`,
      [tokenHash]
    );
    if (rows.length === 0) {
      // Possible reuse/invalid token
      return res.status(401).json({ error: 'Refresh token inválido.' });
    }

    const row = rows[0];
    if (row.status !== "Activo") {
      await revokeRefreshToken(cookieToken);
      res.clearCookie("refreshToken", { path: "/" });
      return res.status(401).json({ error: "Cuenta bloqueada." });
    }
    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
      // token expirado
      await revokeRefreshToken(cookieToken);
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Refresh token expirado.' });
    }

    // Rotate: revoke old and issue new
    await revokeRefreshToken(cookieToken);
    const newRefreshToken = await createRefreshToken(row.username, 30);

    // Set new cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    };
    res.cookie('refreshToken', newRefreshToken, cookieOptions);

    const accessToken = jwt.sign({ username: row.username, role: row.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ sessionId: accessToken });
  } catch (err) {
    res.status(500).json({ error: 'Error procesando refresh token.', details: err.message });
  }
});

// Logout: revoke a refresh token
app.post('/api/auth/logout', async (req, res) => {
  try {
    const cookieToken = req.cookies?.refreshToken;
    if (!cookieToken) return res.status(400).json({ error: 'Refresh token cookie requerido.' });
    await revokeRefreshToken(cookieToken);
    res.clearCookie('refreshToken', { path: '/' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cerrar la sesión.', details: err.message });
  }
});

// Module-level authorization. Route handlers keep their existing authentication
// middleware so the current auth flow remains unchanged.
app.use("/api/users", requireAuth, requirePermission("users"));
app.use("/api/settings", requireAuth, requirePermission("settings"));
app.use("/api/kanban", requireAuth, requirePermission("kanban"));
app.use("/api/clients", requireAuth, requirePermission("clients"));
app.use("/api/projects", requireAuth, requirePermission("projects"));
app.use("/api/web-projects", requireAuth, requirePermission("projects_web"));
app.use("/api/tasks", requireAuth, requirePermission("tasks"));
app.use("/api/invoices", requireAuth, requirePermission("billing"));
app.use("/api/module-data/:module", requireAuth, requireModulePermission);
app.use("/api/reports", requireAuth, requirePermission("reports"));

app.get("/api/users", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT username,name,email,role,area,status FROM users WHERE username <> 'demo' ORDER BY FIELD(role,'Admin General','Administración','Gerente Dev','Gerente Web'),username`);
    res.json({users:rows.map(u=>({...u,initials:(u.name||u.username).split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}))});
  } catch(err){res.status(500).json({error:"No se pudo cargar el directorio.",details:err.message});}
});

app.get("/api/users-trash", requireAuth, async (req, res) => {
  if(req.role!=="Admin General") return res.status(403).json({error:"Acceso insuficiente."});
  try {
    const [rows] = await pool.execute("SELECT id,username,name,email,role,area,status,deleted_by AS deletedBy,deleted_at AS deletedAt FROM deleted_users ORDER BY deleted_at DESC");
    res.json({users:rows});
  } catch(err){res.status(500).json({error:"No se pudo cargar la papelera.",details:err.message});}
});

app.post("/api/users-trash/:id/restore", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Acceso insuficiente."});
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [archives] = await connection.execute("SELECT snapshot FROM deleted_users WHERE id=? FOR UPDATE",[req.params.id]);
    if(!archives.length){await connection.rollback();return res.status(404).json({error:"El usuario ya no está en la papelera."});}
    const snapshot=typeof archives[0].snapshot==="string"?JSON.parse(archives[0].snapshot):archives[0].snapshot;
    const user=snapshot.user;
    const columns=Object.keys(user), escaped=columns.map(key=>`\`${key.replace(/`/g,"``")}\``).join(","), placeholders=columns.map(()=>"?").join(",");
    await connection.execute(`INSERT INTO users (${escaped}) VALUES (${placeholders})`,columns.map(key=>user[key]));
    await restoreSnapshotRows(connection,"projects",snapshot.projects);
    await restoreSnapshotRows(connection,"web_projects",snapshot.webProjects);
    await restoreSnapshotRows(connection,"module_data",snapshot.moduleData);
    await connection.execute("DELETE FROM deleted_users WHERE id=?",[req.params.id]);
    await connection.commit();
    res.json({success:true});
  } catch(err){await connection.rollback();res.status(err.code==="ER_DUP_ENTRY"?409:500).json({error:err.code==="ER_DUP_ENTRY"?"Ya existe un usuario con ese identificador.":"No se pudo restaurar el usuario.",details:err.message});}
  finally{connection.release();}
});

app.post("/api/users", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Solo Admin General puede crear usuarios."});
  const {username,name,email,password,role,area,status}=req.body;
  if(!username||!name||!email||!password) return res.status(400).json({error:"Completa todos los campos obligatorios."});
  if(typeof password!=="string"||password.length<12||password.length>128)return res.status(400).json({error:"La contraseña debe tener entre 12 y 128 caracteres."});
  const normalized=String(username).trim().toLowerCase();
  try {
    const passwordHash = await hashPassword(password);
    await pool.execute("INSERT INTO users (username,password_hash,salt,role,name,email,area,status) VALUES (?,?,?,?,?,?,?,?)",[normalized,passwordHash,"",role||"Gerente Dev",name.trim(),email.trim(),area||"General",status==="Bloqueado"?"Bloqueado":"Activo"]);
    res.status(201).json({success:true});
  } catch(err) {
    res.status(err.code==="ER_DUP_ENTRY"?409:500).json({error:err.code==="ER_DUP_ENTRY"?"El usuario ya existe.":"No se pudo crear el usuario.",details:err.message});
  }
});

app.put("/api/users/:username", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Acceso insuficiente."});
  if(req.params.username==="adriana"&&req.body.status==="Bloqueado") return res.status(400).json({error:"No se puede bloquear al administrador principal."});
  const allowed=["name","email","role","area","status"], sets=[],values=[];
  for(const key of allowed) if(req.body[key]!==undefined){sets.push(`\`${key}\`=?`);values.push(req.body[key]);}
  if(req.body.password){
    if(typeof req.body.password!=="string"||req.body.password.length<12||req.body.password.length>128)return res.status(400).json({error:"La contraseña debe tener entre 12 y 128 caracteres."});
    const passwordHash = await hashPassword(req.body.password);
    sets.push("password_hash=?","salt=?");
    values.push(passwordHash,"");
  }
  if(!sets.length)return res.status(400).json({error:"No hay cambios."}); values.push(req.params.username);
  try{await pool.execute(`UPDATE users SET ${sets.join(',')} WHERE username=?`,values);res.json({success:true});}catch(err){res.status(500).json({error:"No se pudo actualizar.",details:err.message});}
});

app.delete("/api/users/:username", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Acceso insuficiente."});
  if(req.params.username==="adriana") return res.status(400).json({error:"No se puede eliminar al administrador principal."});
  const connection=await pool.getConnection();
  try{
    await connection.beginTransaction();
    const [users]=await connection.execute("SELECT * FROM users WHERE username=? FOR UPDATE",[req.params.username]);
    if(!users.length){await connection.rollback();return res.status(404).json({error:"Usuario no encontrado."});}
    const [projects]=await connection.execute("SELECT * FROM projects WHERE username=?",[req.params.username]);
    const [webProjects]=await connection.execute("SELECT * FROM web_projects WHERE username=?",[req.params.username]);
    const [moduleData]=await connection.execute("SELECT * FROM module_data WHERE username=?",[req.params.username]);
    const user=users[0], snapshot={user,projects,webProjects,moduleData};
    await connection.execute("INSERT INTO deleted_users (username,name,email,role,area,status,snapshot,deleted_by) VALUES (?,?,?,?,?,?,?,?)",[user.username,user.name,user.email,user.role,user.area,user.status,JSON.stringify(snapshot),req.username]);
    await connection.execute("DELETE FROM users WHERE username=?",[req.params.username]);
    await connection.commit();
    res.json({success:true,recoverable:true});
  }catch(err){await connection.rollback();res.status(500).json({error:"No se pudo mover el usuario a la papelera.",details:err.message});}
  finally{connection.release();}
});

const DEFAULT_SETTINGS = {companyName:"Designs Agency S.A. de C.V.",rfc:"DAG240115TJ1",email:"hola@designs.mx",phone:"+52 664 123 4567",city:"Tijuana, Baja California",country:"México",systemNotifications:true,emailAlerts:true,overduePayments:true,upcomingRenewals:true,delayedProjects:true,newLeads:true,currency:"MXN",timezone:"America/Tijuana",language:"es-MX",dateFormat:"DD/MM/YYYY",sessionTimeout:10,twoFactor:false};
app.get("/api/settings", requireAuth, async (_req,res)=>{try{const [rows]=await pool.execute("SELECT data FROM settings WHERE id=1");const data=rows.length?rows[0].data:null;res.json({settings:data?(typeof data==="string"?JSON.parse(data):data):DEFAULT_SETTINGS});}catch(err){res.status(500).json({error:"No se pudo cargar la configuración.",details:err.message});}});
app.put("/api/settings", requireAuth, async (req,res)=>{if(req.role!=="Admin General")return res.status(403).json({error:"Solo Admin General puede modificar la configuración."});const settings={...DEFAULT_SETTINGS,...req.body,sessionTimeout:Math.max(5,Math.min(60,Number(req.body.sessionTimeout)||10))};try{await pool.execute("INSERT INTO settings (id,data) VALUES (1,?) ON DUPLICATE KEY UPDATE data=VALUES(data)",[JSON.stringify(settings)]);res.json({success:true,settings});}catch(err){res.status(500).json({error:"No se pudo guardar la configuración.",details:err.message});}});

app.get("/api/kanban", requireAuth, async (_req,res)=>{try{const [rows]=await pool.execute("SELECT id,board,stage,title,subtitle,priority,tags,progress,assignee,due_date AS dueDate FROM kanban_cards ORDER BY created_at");res.json({cards:rows.map(r=>({...r,tags:typeof r.tags==='string'?JSON.parse(r.tags):r.tags}))});}catch(err){res.status(500).json({error:"No se pudo cargar el tablero.",details:err.message});}});
app.post("/api/kanban", requireAuth, async (req,res)=>{const {board,stage,title,subtitle,priority,tags,progress,assignee,dueDate}=req.body;if(!board||!stage||!title)return res.status(400).json({error:"Tablero, etapa y título son obligatorios."});const id=`kan_${Date.now()}`;try{await pool.execute("INSERT INTO kanban_cards (id,board,stage,title,subtitle,priority,tags,progress,assignee,due_date) VALUES (?,?,?,?,?,?,?,?,?,?)",[id,board,stage,title,subtitle||'',priority||'Media',JSON.stringify(Array.isArray(tags)?tags:[]),progress??null,assignee||'D',dueDate||'']);res.status(201).json({success:true,id});}catch(err){res.status(500).json({error:"No se pudo crear la tarjeta.",details:err.message});}});
app.put("/api/kanban/:id", requireAuth, async (req,res)=>{const allowed=['board','stage','title','subtitle','priority','progress','assignee'],sets=[],values=[];for(const key of allowed)if(req.body[key]!==undefined){sets.push(`\`${key}\`=?`);values.push(req.body[key]);}if(req.body.tags!==undefined){sets.push('tags=?');values.push(JSON.stringify(req.body.tags));}if(req.body.dueDate!==undefined){sets.push('due_date=?');values.push(req.body.dueDate);}if(!sets.length)return res.status(400).json({error:'No hay cambios.'});values.push(req.params.id);try{await pool.execute(`UPDATE kanban_cards SET ${sets.join(',')} WHERE id=?`,values);res.json({success:true});}catch(err){res.status(500).json({error:"No se pudo mover o actualizar la tarjeta.",details:err.message});}});
app.delete("/api/kanban/:id", requireAuth, async (req,res)=>{try{await pool.execute("DELETE FROM kanban_cards WHERE id=?",[req.params.id]);res.json({success:true});}catch(err){res.status(500).json({error:"No se pudo eliminar la tarjeta.",details:err.message});}});

// ====================================================================
// ENDPOINTS DE CLIENTES
// ====================================================================
app.get("/api/clients", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        id,
        company_name AS companyName,
        contact_name AS contactName,
        email,
        phone,
        status,
        services,
        responsible,
        next_renewal AS nextRenewal,
        avatar_initials AS avatarInitials,
        avatar_bg AS avatarBg,
        created_at AS createdAt
      FROM clients
      ORDER BY created_at DESC`
    );

    res.json({ clients: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener clientes de MySQL.", details: err.message });
  }
});

app.post("/api/clients", requireAuth, async (req, res) => {
  const clientId = `c_${Date.now()}`;
  const client = buildClientPayload(req.body);

  if (!client.companyName || !client.contactName || !client.email) {
    return res.status(400).json({ error: "Empresa, contacto y correo son obligatorios." });
  }

  try {
    await pool.execute(
      `INSERT INTO clients (
        id, company_name, contact_name, email, phone, status, services, responsible, next_renewal, avatar_initials, avatar_bg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        client.companyName,
        client.contactName,
        client.email,
        client.phone,
        client.status,
        client.services,
        client.responsible,
        client.nextRenewal,
        client.avatarInitials,
        client.avatarBg
      ]
    );

    res.status(201).json({
      success: true,
      client: {
        id: clientId,
        ...client,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo crear el cliente en MySQL.", details: err.message });
  }
});

app.put("/api/clients/:id", requireAuth, async (req, res) => {
  const clientId = req.params.id;

  try {
    const [existingRows] = await pool.execute(
      `SELECT
        id,
        company_name AS companyName,
        contact_name AS contactName,
        email,
        phone,
        status,
        services,
        responsible,
        next_renewal AS nextRenewal,
        avatar_initials AS avatarInitials,
        avatar_bg AS avatarBg,
        created_at AS createdAt
      FROM clients
      WHERE id = ?`,
      [clientId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado." });
    }

    const client = buildClientPayload(req.body, existingRows[0]);

    if (!client.companyName || !client.contactName || !client.email) {
      return res.status(400).json({ error: "Empresa, contacto y correo son obligatorios." });
    }

    await pool.execute(
      `UPDATE clients
       SET company_name = ?, contact_name = ?, email = ?, phone = ?, status = ?, services = ?, responsible = ?, next_renewal = ?, avatar_initials = ?, avatar_bg = ?
       WHERE id = ?`,
      [
        client.companyName,
        client.contactName,
        client.email,
        client.phone,
        client.status,
        client.services,
        client.responsible,
        client.nextRenewal,
        client.avatarInitials,
        client.avatarBg,
        clientId
      ]
    );

    res.json({
      success: true,
      client: {
        id: clientId,
        ...client,
        createdAt: existingRows[0].createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el cliente en MySQL.", details: err.message });
  }
});

app.delete("/api/clients/:id", requireAuth, async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM clients WHERE id = ?", [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Cliente no encontrado." });
    }

    res.json({ success: true, message: "Cliente eliminado correctamente." });
  } catch (err) {
    res.status(500).json({ error: "No se pudo eliminar el cliente.", details: err.message });
  }
});


// ====================================================================
// ENDPOINTS DE PROYECTOS (SQL INTEGRADO)
// ====================================================================

// Obtener Proyectos del Usuario Conectado
app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, description, figma_node as figmaNode, tailwind_classes as tailwindClasses, component_code as componentCode, created_at as createdAt FROM projects WHERE username = ? ORDER BY created_at DESC",
      [req.username]
    );
    res.json({ projects: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener proyectos de MySQL.", details: err.message });
  }
});

// Crear o Guardar un Proyecto en MySQL
app.post("/api/projects", requireAuth, async (req, res) => {
  const { name, description, figmaNode, tailwindClasses, componentCode } = req.body;

  if (!name) {
    return res.status(400).json({ error: "El nombre del proyecto es obligatorio." });
  }

  const newId = "proj_" + Date.now();
  const dateIso = new Date().toISOString();

  try {
    await pool.execute(
      "INSERT INTO projects (id, name, description, figma_node, tailwind_classes, component_code, username, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        newId,
        name,
        description || "",
        figmaNode || "",
        tailwindClasses || "",
        componentCode || "",
        req.username,
        dateIso.slice(0, 19).replace('T', ' ') // Formatear para tipo TIMESTAMP de MySQL
      ]
    );

    res.json({
      success: true,
      project: {
        id: newId,
        name,
        description,
        figmaNode,
        tailwindClasses,
        componentCode,
        createdAt: dateIso
      }
    });
  } catch (err) {
    console.error("Error al guardar proyecto:", err);
    res.status(500).json({ error: "No se pudo guardar el proyecto en phpMyAdmin.", details: err.message });
  }
});

app.put("/api/projects/:id", requireAuth, async (req, res) => {
  const projectId = req.params.id;
  const { name, description, figmaNode, tailwindClasses, componentCode } = req.body;

  if (!name) {
    return res.status(400).json({ error: "El nombre del proyecto es obligatorio." });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE projects
       SET name = ?, description = ?, figma_node = ?, tailwind_classes = ?, component_code = ?
       WHERE id = ? AND username = ?`,
      [
        name,
        description || "",
        figmaNode || "",
        tailwindClasses || "",
        componentCode || "",
        projectId,
        req.username
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Proyecto no encontrado o no pertenece a tu cuenta." });
    }

    res.json({
      success: true,
      project: {
        id: projectId,
        name,
        description: description || "",
        figmaNode: figmaNode || "",
        tailwindClasses: tailwindClasses || "",
        componentCode: componentCode || ""
      }
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el proyecto.", details: err.message });
  }
});

// Soporte PATCH para ediciones parciales desde el frontend (compatibilidad)
app.patch("/api/projects/:id", requireAuth, async (req, res) => {
  const projectId = req.params.id;
  const allowed = ["name", "description", "figma_node", "tailwind_classes", "component_code"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`\`${key.replace(/\w+/g, (m) => m)}\` = ?`);
      values.push(req.body[key]);
    }
  }

  if (!sets.length) return res.status(400).json({ error: "No hay cambios." });
  values.push(projectId, req.username);

  try {
    const [result] = await pool.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ? AND username = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Proyecto no encontrado o no pertenece a tu cuenta." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el proyecto.", details: err.message });
  }
});

// Eliminar un Proyecto de MySQL
app.delete("/api/projects/:id", requireAuth, async (req, res) => {
  const projectId = req.params.id;

  try {
    const [result] = await pool.execute(
      "DELETE FROM projects WHERE id = ? AND username = ?",
      [projectId, req.username]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Proyecto no encontrado o no pertenece a tu cuenta." });
    }

    res.json({ success: true, message: "Proyecto eliminado correctamente de phpMyAdmin." });
  } catch (err) {
    res.status(500).json({ error: "No se pudo eliminar el proyecto de la base de datos.", details: err.message });
  }
});

// ====================================================================
// ENDPOINTS PARA WEB_PROJECTS (CRUD completo)
// ====================================================================
app.get("/api/web-projects", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, client_name AS clientName, manager, designer, builder, start_date AS startDate, due_date AS dueDate, progress, status, priority, description, created_at AS createdAt, updated_at AS updatedAt FROM web_projects WHERE username = ? ORDER BY created_at DESC`,
      [req.username]
    );
    res.json({ projects: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener web projects.", details: err.message });
  }
});

app.post("/api/web-projects", requireAuth, async (req, res) => {
  const { name, clientName, manager, designer, builder, startDate, dueDate, progress, status, priority, description } = req.body;
  if (!name || !clientName) return res.status(400).json({ error: "Nombre y cliente son obligatorios." });

  const id = `wp_${Date.now()}`;
  try {
    await pool.execute(
      `INSERT INTO web_projects (id, username, name, client_name, manager, designer, builder, start_date, due_date, progress, status, priority, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.username, name, clientName, manager || '', designer || '', builder || '', startDate || null, dueDate || null, progress ?? 0, status || 'Diseño inicial', priority || 'Media', description || '']
    );

    res.status(201).json({ success: true, project: { id, name, clientName, manager, designer, builder, startDate, dueDate, progress, status, priority, description, createdAt: new Date().toISOString() } });
  } catch (err) {
    res.status(500).json({ error: "No se pudo crear el web project.", details: err.message });
  }
});

app.put("/api/web-projects/:id", requireAuth, async (req, res) => {
  const projectId = req.params.id;
  const allowed = ["name", "client_name", "manager", "designer", "builder", "start_date", "due_date", "progress", "status", "priority", "description"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key]
       !== undefined) {
      sets.push(`\`${key}\` = ?`);
      values.push(req.body[key]);
    }
  }

  if (!sets.length) return res.status(400).json({ error: "No hay cambios." });
  values.push(projectId, req.username);

  try {
    const [result] = await pool.execute(`UPDATE web_projects SET ${sets.join(', ')} WHERE id = ? AND username = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Web project no encontrado o no pertenece a tu cuenta." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el web project.", details: err.message });
  }
});

app.patch("/api/web-projects/:id", requireAuth, async (req, res) => {
  // Reutiliza la lógica de PUT pero permite cambios parciales
  const projectId = req.params.id;
  const mapFields = {
    name: 'name',
    clientName: 'client_name',
    manager: 'manager',
    designer: 'designer',
    builder: 'builder',
    startDate: 'start_date',
    dueDate: 'due_date',
    progress: 'progress',
    status: 'status',
    priority: 'priority',
    description: 'description'
  };
  const sets = [];
  const values = [];

  for (const key of Object.keys(mapFields)) {
    if (req.body[key] !== undefined) {
      sets.push(`\`${mapFields[key]}\` = ?`);
      values.push(req.body[key]);
    }
  }

  if (!sets.length) return res.status(400).json({ error: 'No hay cambios.' });
  values.push(projectId, req.username);

  try {
    const [result] = await pool.execute(`UPDATE web_projects SET ${sets.join(', ')} WHERE id = ? AND username = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Web project no encontrado o no pertenece a tu cuenta.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el web project.', details: err.message });
  }
});

app.delete("/api/web-projects/:id", requireAuth, async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM web_projects WHERE id = ? AND username = ?", [req.params.id, req.username]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Web project no encontrado o no pertenece a tu cuenta." });
    res.json({ success: true, message: "Web project eliminado correctamente." });
  } catch (err) {
    res.status(500).json({ error: "No se pudo eliminar el web project.", details: err.message });
  }
});

app.get("/api/tasks", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        id,
        title,
        description,
        column_name AS columnName,
        status,
        priority,
        project_name AS projectName,
        assignee,
        created_at AS createdAt
      FROM tasks
      ORDER BY created_at DESC`
    );

    res.json({ tasks: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener tareas de MySQL.", details: err.message });
  }
});

app.get("/api/push/public-key", requireAuth, (_req, res) => {
  if (!PUSH_ENABLED) return res.status(503).json({ error: "Web Push todavía no está configurado en el servidor." });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post("/api/push/subscribe", requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!PUSH_ENABLED) return res.status(503).json({ error: "Web Push todavía no está configurado en el servidor." });
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: "Suscripción Push inválida." });
  const id = pushSubscriptionId(endpoint);
  try {
    await pool.execute(
      `INSERT INTO push_subscriptions (id,username,endpoint,p256dh,auth) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE username=VALUES(username),p256dh=VALUES(p256dh),auth=VALUES(auth),updated_at=CURRENT_TIMESTAMP`,
      [id, req.username, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "No se pudo registrar este dispositivo.", details: error.message });
  }
});

app.delete("/api/push/subscribe", requireAuth, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: "Endpoint obligatorio." });
  await pool.execute("DELETE FROM push_subscriptions WHERE id=? AND username=?", [pushSubscriptionId(endpoint), req.username]);
  res.json({ success: true });
});

app.post("/api/tasks", requireAuth, async (req, res) => {
  const { title, description = "", column = "Backlog", status = "Pendiente", priority = "Media", projectName = null, assignee = null } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "El título es obligatorio." });
  const id = `t_${Date.now()}`;
  try {
    await pool.execute("INSERT INTO tasks (id,title,description,column_name,status,priority,project_name,assignee) VALUES (?,?,?,?,?,?,?,?)", [id,title.trim(),description,column,status,priority,projectName,assignee]);
    res.status(201).json({ success: true, task: { id,title:title.trim(),description,column,columnName:column,status,priority,projectName,assignee,createdAt:new Date().toISOString() } });
    void sendPushToAssignee(assignee, { title: "Nueva tarea asignada", body: title.trim(), url: "/?view=tasks", tag: `task:${id}` });
  } catch (err) { res.status(500).json({ error: "No se pudo crear la tarea.", details: err.message }); }
});

app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
  const map = { title:"title", description:"description", column:"column_name", status:"status", priority:"priority", projectName:"project_name", assignee:"assignee" };
  const sets=[], values=[];
  for (const [key,column] of Object.entries(map)) if (req.body[key] !== undefined) { sets.push(`\`${column}\`=?`); values.push(req.body[key]); }
  if (!sets.length) return res.status(400).json({ error: "No hay cambios." });
  values.push(req.params.id);
  try {
    const [beforeRows] = await pool.execute("SELECT title,status FROM tasks WHERE id=?", [req.params.id]);
    if (!beforeRows.length) return res.status(404).json({ error:"Tarea no encontrada." });
    await pool.execute(`UPDATE tasks SET ${sets.join(",")} WHERE id=?`, values);
    const taskTitle = req.body.title?.trim() || beforeRows[0].title;
    res.json({ success:true });

    if (req.body.assignee) {
      void sendPushToAssignee(req.body.assignee, {
        title:"Tarea asignada",
        body:taskTitle,
        url:"/?view=tasks",
        tag:`task:${req.params.id}:${Date.now()}`
      }).catch((error) => console.error("No se pudo notificar la asignación:", error.message));
    }
    if (req.body.status !== undefined && req.body.status !== beforeRows[0].status) {
      void sendPushToOtherUsers(req.username, {
        title:"Estado de tarea actualizado",
        body:`${taskTitle}: ${beforeRows[0].status} → ${req.body.status}`,
        url:"/?view=tasks",
        tag:`task-status:${req.params.id}:${Date.now()}`
      }).catch((error) => console.error("No se pudo notificar el cambio de estado:", error.message));
    }
  } catch(err) {
    res.status(500).json({ error:"No se pudo actualizar la tarea.",details:err.message });
  }
});

app.delete("/api/tasks/:id", requireAuth, async (req,res) => {
  try { const [result]=await pool.execute("DELETE FROM tasks WHERE id=?",[req.params.id]); if(!result.affectedRows)return res.status(404).json({error:"Tarea no encontrada."}); res.json({success:true}); }
  catch(err){res.status(500).json({error:"No se pudo eliminar la tarea.",details:err.message});}
});

app.get("/api/invoices", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        id,
        client_name AS clientName,
        amount,
        status,
        due_date AS dueDate,
        payment_date AS paymentDate,
        payment_method AS paymentMethod,
        is_invoiced AS isInvoiced,
        description,
        created_at AS createdAt
      FROM invoices
      ORDER BY created_at DESC`
    );

    res.json({ invoices: rows });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener facturas de MySQL.", details: err.message });
  }
});

app.post("/api/invoices", requireAuth, async (req,res) => {
  const { clientName, amount, status="Pendiente", dueDate=null, paymentDate=null, paymentMethod=null, isInvoiced=false, description="" }=req.body;
  if(!clientName?.trim() || !Number.isFinite(Number(amount))) return res.status(400).json({error:"Cliente y monto son obligatorios."});
  const id=`inv_${Date.now()}`;
  try { await pool.execute("INSERT INTO invoices (id,client_name,amount,status,due_date,payment_date,payment_method,is_invoiced,description) VALUES (?,?,?,?,?,?,?,?,?)",[id,clientName.trim(),Number(amount),status,dueDate||null,paymentDate||null,paymentMethod||null,isInvoiced?1:0,description]); res.status(201).json({success:true,invoice:{id,clientName:clientName.trim(),amount:Number(amount),status,dueDate:dueDate||"",paymentDate:paymentDate||"",paymentMethod:paymentMethod||"",isInvoiced:Boolean(isInvoiced),description}}); }
  catch(err){res.status(500).json({error:"No se pudo crear la factura.",details:err.message});}
});

app.patch("/api/invoices/:id", requireAuth, async (req,res) => {
  const map={clientName:"client_name",amount:"amount",status:"status",dueDate:"due_date",paymentDate:"payment_date",paymentMethod:"payment_method",isInvoiced:"is_invoiced",description:"description"},sets=[],values=[];
  for(const [key,column] of Object.entries(map))if(req.body[key]!==undefined){sets.push(`\`${column}\`=?`);values.push(req.body[key]);}
  if(!sets.length)return res.status(400).json({error:"No hay cambios."}); values.push(req.params.id);
  try{const [result]=await pool.execute(`UPDATE invoices SET ${sets.join(",")} WHERE id=?`,values);if(!result.affectedRows)return res.status(404).json({error:"Factura no encontrada."});res.json({success:true});}
  catch(err){res.status(500).json({error:"No se pudo actualizar la factura.",details:err.message});}
});

app.delete("/api/invoices/:id", requireAuth, async (req,res) => {
  try{const [result]=await pool.execute("DELETE FROM invoices WHERE id=?",[req.params.id]);if(!result.affectedRows)return res.status(404).json({error:"Factura no encontrada."});res.json({success:true});}
  catch(err){res.status(500).json({error:"No se pudo eliminar la factura.",details:err.message});}
});

const MODULE_NAMES = new Set(["leads","services","renewals","quotes","staff","credentials"]);
app.get("/api/module-data/:module", requireAuth, async (req,res) => {
  if(!MODULE_NAMES.has(req.params.module))return res.status(404).json({error:"Módulo no válido."});
  try{const [rows]=await pool.execute("SELECT data FROM module_data WHERE username=? AND module_name=?",[req.username,req.params.module]);const data=rows.length?(typeof rows[0].data==="string"?JSON.parse(rows[0].data):rows[0].data):null;res.json({data});}
  catch(err){res.status(500).json({error:"No se pudo cargar el módulo.",details:err.message});}
});

app.put("/api/module-data/:module", requireAuth, async (req,res) => {
  if(!MODULE_NAMES.has(req.params.module))return res.status(404).json({error:"Módulo no válido."});
  if(!Array.isArray(req.body.data))return res.status(400).json({error:"Los datos deben ser una lista."});
  try{await pool.execute("INSERT INTO module_data (username,module_name,data) VALUES (?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)",[req.username,req.params.module,JSON.stringify(req.body.data)]);res.json({success:true});}
  catch(err){res.status(500).json({error:"No se pudo guardar el módulo.",details:err.message});}
});

app.get("/api/reports/summary", requireAuth, async (_req, res) => {
  try {
    const [[invoiceTotals], [activeProjects], [monthlyRows], [managerRows]] = await Promise.all([
      pool.execute(`SELECT
        COALESCE(SUM(CASE WHEN status = 'Pagado' AND YEAR(due_date)=YEAR(CURDATE()) AND MONTH(due_date)=MONTH(CURDATE()) THEN amount ELSE 0 END),0) monthlyIncome,
        COALESCE(SUM(CASE WHEN status IN ('Pendiente','Vencido') THEN amount ELSE 0 END),0) pendingPayments
        FROM invoices`),
      pool.execute("SELECT COUNT(*) activeProjects FROM projects"),
      pool.execute(`SELECT DATE_FORMAT(due_date,'%Y-%m') monthKey, SUM(amount) total FROM invoices WHERE status='Pagado' AND due_date >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY monthKey`),
      pool.execute(`SELECT COALESCE(NULLIF(c.responsible,''),p.username) manager, SUM(i.amount) total
        FROM invoices i LEFT JOIN clients c ON c.company_name=i.client_name LEFT JOIN projects p ON p.username=LOWER(SUBSTRING_INDEX(c.responsible,' ',1))
        WHERE i.status='Pagado' GROUP BY manager ORDER BY total DESC LIMIT 4`)
    ]);
    const months=[]; const formatter=new Intl.DateTimeFormat('es-MX',{month:'short'}); const byMonth=Object.fromEntries(monthlyRows.map(r=>[r.monthKey,Number(r.total)]));
    for(let offset=5;offset>=0;offset--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-offset);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;months.push({label:formatter.format(d).replace('.','').replace(/^./,x=>x.toUpperCase()),value:byMonth[key]||0});}
    const shortName=name=>name ? name.split(/\s+/).slice(0,2).map((x,i)=>i?`${x[0]}.`:x).join(' ') : 'Sin asignar';
    res.json({
      metrics:{monthlyIncome:Number(invoiceTotals[0].monthlyIncome),pendingPayments:Number(invoiceTotals[0].pendingPayments),activeProjects:Number(activeProjects[0].activeProjects),wonQuotes:3,incomeChange:-43,projectsChange:12,quotesChange:8},
      monthlyIncome:months,
      services:[{label:'Hosting',value:38,color:'#2f66e9'},{label:'Desarrollo',value:28,color:'#10b981'},{label:'Páginas web',value:22,color:'#8055e9'},{label:'Dominio',value:12,color:'#f59e0b'}],
      managers:managerRows.length?managerRows.map(r=>({label:shortName(r.manager),value:Number(r.total)})):[{label:'Carlos M.',value:85000},{label:'Sofía R.',value:57000},{label:'Marco H.',value:118000},{label:'Luis P.',value:48000}]
    });
  } catch(err){res.status(500).json({error:'Error al generar el reporte.',details:err.message});}
});


// ====================================================================
// PROXY DE INTELIGENCIA ARTIFICIAL (GEMINI 3.5 FLASH)
// ====================================================================
app.post("/api/generate-component", requireAuth, aiLimiter, async (req, res) => {
  const { prompt } = req.body;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    return res.status(400).json({ error: "El prompt debe contener entre 1 y 4000 caracteres." });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(503).json({
      error: "El servicio de Inteligencia Artificial de Google Gemini no está configurado localmente. Por favor configura GEMINI_API_KEY en tu archivo '.env'."
    });
  }

  try {
    // Importación dinámica del SDK moderno de Google GenAI
    const { GoogleGenAI, Type } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const systemInstruction = `Eres un experto internacional en Figma y frontend React con Tailwind CSS.
Recibirás un prompt en español que describe un elemento de diseño, una sección, o una replica de Figma. Tu objetivo es generar una respuesta JSON que contenga código React puro de un componente moderno, estético y responsive.

Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "name": "NombreDeComponenteEnPascalCase",
  "explanation": "Breve explicación en español de los breakpoints responsivos, animaciones y elecciones estéticas usadas en el diseño.",
  "code": "El código completo de React. El componente debe ser self-contained, importar los iconos de 'lucide-react' explícitamente en la cabecera (por ejemplo: import { ArrowRight, Star } from 'lucide-react';) y usar la exportación por defecto (export default function ...)."
}

Reglas estrictas de diseño y código:
1. No utilices librerías de diseño adicionales excepto 'lucide-react' para los iconos.
2. Utiliza exclusivamente clases de Tailwind CSS para el estilo (gradientes refinados, bordes sutiles, espaciados generosos). Evita estilos en línea o CSS plano.
3. El componente debe ser perfectamente responsivo (adaptándose desde móviles hasta escritorio usando prefijos sm:, md:, lg:).
4. El código debe ser ejecutable directamente como un componente React (sin dependencias extrañas ni props requeridas).
5. Escapa correctamente las comillas y saltos de línea para que el JSON sea válido.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Genera un componente React para el siguiente diseño: "${prompt}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            explanation: { type: Type.STRING },
            code: { type: Type.STRING },
          },
          required: ["name", "explanation", "code"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No se recibió contenido de texto desde Gemini.");
    }

    const data = JSON.parse(resultText);
    res.json(data);
  } catch (error) {
    console.error("Error generating component with Gemini:", error);
    res.status(500).json({
      error: "Ocurrió un error al procesar tu solicitud con la IA.",
      details: error.message || error,
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Error HTTP controlado:", err.message);
  if (res.headersSent) return next(err);
  const isCorsError = err.message?.startsWith("Origen no permitido por CORS");
  return res.status(isCorsError ? 403 : 500).json({
    error: isCorsError ? "Origen no permitido." : "Error interno del servidor."
  });
});


// Servir archivos estáticos del build de React en Producción
const distPath = process.env.FRONTEND_DIST_PATH
  ? path.resolve(process.env.FRONTEND_DIST_PATH)
  : path.join(__dirname, "../crm-front/dist");
app.use(express.static(distPath));

// Ruta comodín para SPA Fallback de React
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Arrancar el Servidor
app.listen(PORT, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`🚀 DESIGNS CRM - SERVIDOR DE RESPALDO WAMP MYSQL`);
  console.log(`🖥️  Local: http://localhost:${PORT}`);
  console.log(`====================================================`);
  setTimeout(() => void sendRenewalPushes(), 15_000);
  setInterval(() => void sendRenewalPushes(), 6 * 60 * 60 * 1000);
});
