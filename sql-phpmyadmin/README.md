# SQL para phpMyAdmin

Si ya importaste anteriormente `database.sql`, selecciona la base `designs_crm` en phpMyAdmin e importa solamente:

1. `002_modulos_y_crud.sql`

Este script agrega `module_data`, donde se guardan por usuario los datos de Leads, Servicios, Renovaciones, Cotizaciones, Personal y Credenciales. Las rutas CRUD de Tareas y Facturación usan las tablas `tasks` e `invoices` que ya existen.

Para una instalación nueva puedes importar directamente `../database.sql`; ya contiene la tabla nueva.

La primera vez que cada usuario abra un módulo, los datos existentes en `localStorage` se migrarán a MySQL automáticamente.

> Importante: el módulo de credenciales conserva el comportamiento actual y almacena las contraseñas dentro del JSON. Restringe el acceso a MySQL y realiza respaldos seguros.
Para habilitar notificaciones Web Push en una instalación existente, importa también `003_web_push.sql`. El backend intenta crear estas tablas automáticamente; este archivo sirve para hostings que bloquean el permiso `CREATE` al usuario de Node.
