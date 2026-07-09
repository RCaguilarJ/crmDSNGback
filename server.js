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
const LOCAL_SEED_PASSWORD = "demo";
const LOCAL_SEED_USERS = [
  { username: "demo", role: "Colaborador", salt: "9a03b5f92bdc489c" },
  { username: "adriana", role: "Admin General", salt: "8c05b2f92bdc234a" },
  { username: "jorge", role: "Administración", salt: "7c01b2f52bdc567b" },
  { username: "carlos", role: "Gerente Dev", salt: "5c03b1f92bdc112d" },
  { username: "sofia", role: "Gerente Web", salt: "4c02b3f92bdc889e" }
];

// Habilitar CORS y lectura de cuerpos JSON
app.use(cors());
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
  charset: "utf8mb4_unicode_ci"
});

// Probar conexión a la base de datos al arrancar
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Conexión exitosa a la base de datos de phpMyAdmin (MySQL)");
    connection.release();
    await ensureLocalSeedUsers();
    console.log("âœ… Usuarios semilla sincronizados para acceso local.");
  } catch (error) {
    console.error("❌ Error conectando a la base de datos de WAMP (phpMyAdmin):");
    console.error(error.message);
    console.log("👉 Asegúrate de que WAMP Server esté encendido, que creaste la base de datos 'designs_crm' y que importaste 'database.sql'.");
  }
})();

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
