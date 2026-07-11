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
const cors = require("cors");
require("dotenv").config();

const app = express();
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
  origin(origin, callback) {
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
app.use(express.json());

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
    await ensureUserProfileColumns();
    await ensureSettingsTable();
    await ensureKanbanTable();
    await ensureLocalSeedUsers();
    console.log("âœ… Usuarios semilla sincronizados para acceso local.");
  } catch (error) {
    console.error("❌ Error conectando a la base de datos de WAMP (phpMyAdmin):");
    console.error(error.message);
    console.log("👉 Asegúrate de que WAMP Server esté encendido, que creaste la base de datos 'designs_crm' y que importaste 'database.sql'.");
  }
})();

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

// Helper para cifrar contraseñas (SHA256 con Salt)
function hashPassword(password, salt) {
  return crypto
    .createHash("sha256")
    .update(password + salt)
    .digest("hex");
}

async function ensureLocalSeedUsers() {
  const seedUsers = LOCAL_SEED_USERS.map(({ username, role, salt }) => ({
    username,
    passwordHash: hashPassword(LOCAL_SEED_PASSWORD, salt),
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
    `INSERT INTO users (username, password_hash, salt, role) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       salt = VALUES(salt),
       role = VALUES(role)`,
    values
  );
}

const CLIENT_STATUSES = ["Activo", "PrÃ³ximo a vencer", "Vencido", "Suspendido"];

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

  // En el entorno local simplificado, el token Bearer representa el 'username'
  const token = authHeader.substring(7);
  
  try {
    const [rows] = await pool.execute(
      "SELECT username, role FROM users WHERE username = ?", 
      [token]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Sesión inválida o expirada." });
    }

    req.username = rows[0].username;
    req.role = rows[0].role;
    next();
  } catch (err) {
    res.status(500).json({ error: "Error de validación de sesión.", details: err.message });
  }
}

// ====================================================================
// ENDPOINTS DE AUTENTICACIÓN (LOGIN & SIGNUP)
// ====================================================================

// Registro de Usuario Nuevo
app.post("/api/auth/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Faltan credenciales" });
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

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    const defaultRole = normalizedUser === "adriana" ? "Admin General" : "Colaborador";

    // Insertar en MySQL
    await pool.execute(
      "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)",
      [normalizedUser, passwordHash, salt, defaultRole]
    );

    res.json({
      success: true,
      user: {
        username: normalizedUser,
        projectsCount: 0,
        role: defaultRole
      },
      sessionId: normalizedUser // En local usamos el mismo username como token simplificado
    });
  } catch (err) {
    console.error("Error en registro:", err);
    res.status(500).json({ error: "Error interno al crear usuario.", details: err.message });
  }
});

// Inicio de Sesión
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Faltan credenciales" });
  }

  const normalizedUser = username.trim().toLowerCase();

  try {
    const [users] = await pool.execute(
      "SELECT username, password_hash, salt, role FROM users WHERE username = ?",
      [normalizedUser]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    const dbUser = users[0];
    const checkHash = hashPassword(password, dbUser.salt);

    if (checkHash !== dbUser.password_hash) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    // Contar proyectos creados por el usuario
    const [projectCountRows] = await pool.execute(
      "SELECT COUNT(*) as count FROM projects WHERE username = ?",
      [normalizedUser]
    );
    const projectsCount = projectCountRows[0].count;

    res.json({
      success: true,
      user: {
        username: dbUser.username,
        projectsCount,
        role: dbUser.role
      },
      sessionId: dbUser.username // Token simplificado para agilizar el desarrollo local
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
    const [users] = await pool.execute(
      "SELECT username, role FROM users WHERE username = ?",
      [token]
    );

    if (users.length === 0) {
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

app.get("/api/users", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT username,name,email,role,area,status FROM users WHERE username <> 'demo' ORDER BY FIELD(role,'Admin General','Administración','Gerente Dev','Gerente Web'),username`);
    res.json({users:rows.map(u=>({...u,initials:(u.name||u.username).split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}))});
  } catch(err){res.status(500).json({error:"No se pudo cargar el directorio.",details:err.message});}
});

app.post("/api/users", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Solo Admin General puede crear usuarios."});
  const {username,name,email,password,role,area,status}=req.body;
  if(!username||!name||!email||!password) return res.status(400).json({error:"Completa todos los campos obligatorios."});
  const normalized=String(username).trim().toLowerCase(),salt=crypto.randomBytes(16).toString("hex");
  try{await pool.execute("INSERT INTO users (username,password_hash,salt,role,name,email,area,status) VALUES (?,?,?,?,?,?,?,?)",[normalized,hashPassword(password,salt),salt,role||"Gerente Dev",name.trim(),email.trim(),area||"General",status==="Bloqueado"?"Bloqueado":"Activo"]);res.status(201).json({success:true});}
  catch(err){res.status(err.code==="ER_DUP_ENTRY"?409:500).json({error:err.code==="ER_DUP_ENTRY"?"El usuario ya existe.":"No se pudo crear el usuario.",details:err.message});}
});

app.put("/api/users/:username", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Acceso insuficiente."});
  if(req.params.username==="adriana"&&req.body.status==="Bloqueado") return res.status(400).json({error:"No se puede bloquear al administrador principal."});
  const allowed=["name","email","role","area","status"], sets=[],values=[];
  for(const key of allowed) if(req.body[key]!==undefined){sets.push(`\`${key}\`=?`);values.push(req.body[key]);}
  if(req.body.password){const salt=crypto.randomBytes(16).toString("hex");sets.push("password_hash=?","salt=?");values.push(hashPassword(req.body.password,salt),salt);}
  if(!sets.length)return res.status(400).json({error:"No hay cambios."}); values.push(req.params.username);
  try{await pool.execute(`UPDATE users SET ${sets.join(',')} WHERE username=?`,values);res.json({success:true});}catch(err){res.status(500).json({error:"No se pudo actualizar.",details:err.message});}
});

app.delete("/api/users/:username", requireAuth, async (req,res)=>{
  if(req.role!=="Admin General") return res.status(403).json({error:"Acceso insuficiente."});
  if(req.params.username==="adriana") return res.status(400).json({error:"No se puede eliminar al administrador principal."});
  try{await pool.execute("DELETE FROM users WHERE username=?",[req.params.username]);res.json({success:true});}catch(err){res.status(500).json({error:"No se pudo eliminar.",details:err.message});}
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

app.get("/api/tasks", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        id,
        title,
        description,
        column_name AS columnName,
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

app.get("/api/invoices", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        id,
        client_name AS clientName,
        amount,
        status,
        due_date AS dueDate,
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
app.post("/api/generate-component", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "El prompt descriptivo es requerido." });
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


// Servir archivos estáticos del build de React en Producción
const distPath = path.join(__dirname, "../dist");
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
});
