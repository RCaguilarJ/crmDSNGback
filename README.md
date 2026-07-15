# 📦 Designs CRM - Backend MySQL (WAMP Stack)

Este es el módulo del servidor de base de datos para **Designs CRM**. Está diseñado para interactuar de forma nativa con **WAMP Server** (MySQL/MariaDB) a través de **phpMyAdmin** para que continúes tu desarrollo localmente en Visual Studio Code.

---

## 🛠️ Requisitos
- **Node.js** (Versión 18 o superior)
- **WAMP Server** encendido (Apache y MySQL activos)
- Acceso a **phpMyAdmin** en `http://localhost/phpmyadmin`

---

## 🚀 Pasos para la Configuración Local

### 1. Preparar la Base de Datos
- Abre **phpMyAdmin** e inicia sesión con el usuario `root` (sin contraseña por defecto en WAMP).
- Haz clic en la pestaña **Importar** (Import).
- Selecciona el archivo `database.sql` de esta carpeta y ejecútalo. Esto creará la base de datos `designs_crm` y cargará los datos de prueba corporativos de fábrica.

### 2. Configurar Variables de Entorno
- Copia el archivo `.env.example` y renómbralo a `.env` en esta misma carpeta.
- Rellena las variables:
  ```env
  PORT=3000
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=
  DB_NAME=designs_crm
  GEMINI_API_KEY=tu_clave_de_gemini
  ```

### 3. Instalar Dependencias del Servidor
Abre la terminal de tu editor de código en la carpeta `crm-back/` e instala las librerías necesarias ejecutando:
```bash
npm install
```

### 4. Iniciar el Servidor de Respaldo
Ejecuta el siguiente comando para poner el servidor backend a la escucha:
```bash
npm run dev
```

El servidor estará corriendo en: `http://localhost:3000`.

---

## 💡 Credenciales de Acceso Semilla (Cargadas en SQL)
Puedes ingresar usando los siguientes usuarios de la agencia pixel-perfect para realizar pruebas:
- **Demo general:** `demo` (contraseña: `demo`)
- **Administradora:** `adriana` (contraseña: `demo`)
- **Finanzas:** `jorge` (contraseña: `demo`)
- **Desarrollo:** `carlos` (contraseña: `demo`)
- **Diseño:** `sofia` (contraseña: `demo`)

## 🔐 Seguridad de Contraseñas Actualizada
- Las contraseñas nuevas y actualizadas se almacenan con `argon2id`.
- Los usuarios heredados con SHA256+salt se migran automáticamente a Argon2 al iniciar sesión.
- El refresh token se guarda en cookie `HttpOnly` y no se expone a JavaScript.
