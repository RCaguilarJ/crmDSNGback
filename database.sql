-- ====================================================================
-- BASE DE DATOS PARA DESIGNS CRM (AGENCIA PIXEL PERFECT)
-- COMPATIBLE CON PHPMYADMIN, WAMP SERVER, MYSQL Y MARIADB
-- ====================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "-06:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------------------
-- 2. TABLA DE USUARIOS / CORPORATIVOS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `username` VARCHAR(50) NOT NULL PRIMARY KEY,
  `password_hash` VARCHAR(255) NOT NULL,
  `salt` VARCHAR(32) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'Colaborador',
  `name` VARCHAR(120) DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `area` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('Activo','Bloqueado') NOT NULL DEFAULT 'Activo',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de renovación para sesiones persistentes
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `token_hash` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deleted_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `name` VARCHAR(120) DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `role` VARCHAR(50) DEFAULT NULL,
  `area` VARCHAR(100) DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT NULL,
  `snapshot` JSON NOT NULL,
  `deleted_by` VARCHAR(50) NOT NULL,
  `deleted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_deleted_users_username` (`username`),
  INDEX `idx_deleted_users_date` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` CHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dh` VARCHAR(255) NOT NULL,
  `auth` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_push_username` (`username`),
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_deliveries` (
  `subscription_id` CHAR(64) NOT NULL,
  `event_key` VARCHAR(190) NOT NULL,
  `delivered_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscription_id`, `event_key`),
  FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `recipient_username` VARCHAR(50) NOT NULL,
  `actor_username` VARCHAR(50) NOT NULL,
  `module_name` VARCHAR(50) NOT NULL,
  `target_view` VARCHAR(50) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `entity_id` VARCHAR(100) DEFAULT NULL,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_notifications_recipient` (`recipient_username`, `created_at`),
  INDEX `idx_notifications_unread` (`recipient_username`, `read_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 3. TABLA DE CLIENTES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clients` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `company_name` VARCHAR(150) NOT NULL,
  `contact_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `status` ENUM('Activo', 'Próximo a vencer', 'Vencido', 'Suspendido') NOT NULL DEFAULT 'Activo',
  `services` INT NOT NULL DEFAULT 1,
  `responsible` VARCHAR(100) DEFAULT NULL,
  `next_renewal` DATE DEFAULT NULL,
  `avatar_initials` VARCHAR(5) DEFAULT 'CL',
  `avatar_bg` VARCHAR(50) DEFAULT 'bg-[#1d63ff]',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 4. TABLA DE PROYECTOS (RÉPLICAS DE FIGMA Y COMPONENTES)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projects` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `figma_node` VARCHAR(100) DEFAULT NULL,
  `tailwind_classes` TEXT DEFAULT NULL,
  `component_code` MEDIUMTEXT DEFAULT NULL,
  `username` VARCHAR(50) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 5. TABLA DE TAREAS KANBAN
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `column_name` ENUM('Backlog', 'Diseño', 'Desarrollo', 'QA', 'Entregado') NOT NULL DEFAULT 'Backlog',
  `status` VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
  `priority` ENUM('Baja', 'Media', 'Alta') NOT NULL DEFAULT 'Media',
  `project_name` VARCHAR(150) DEFAULT NULL,
  `assignee` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 6. TABLA DE FACTURAS / COBROS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `client_name` VARCHAR(150) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` ENUM('Pagado', 'Pendiente', 'Vencido') NOT NULL DEFAULT 'Pendiente',
  `due_date` DATE DEFAULT NULL,
  `payment_date` DATE DEFAULT NULL,
  `payment_method` VARCHAR(40) DEFAULT NULL,
  `is_invoiced` TINYINT(1) NOT NULL DEFAULT 0,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `id` TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  `data` JSON NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kanban_cards` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY, `board` VARCHAR(50) NOT NULL,
  `stage` VARCHAR(50) NOT NULL, `title` VARCHAR(180) NOT NULL,
  `subtitle` VARCHAR(180) DEFAULT '', `priority` ENUM('Alta','Media','Baja') DEFAULT 'Media',
  `tags` JSON NOT NULL, `progress` INT DEFAULT NULL, `assignee` VARCHAR(10) DEFAULT 'D',
  `due_date` VARCHAR(10) DEFAULT '', `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- SEED DE DATOS: CARGA INICIAL COMPATIBLE CON EL DEMO DEL COMPONENTE
-- ====================================================================

-- 1. USUARIOS
--    Contraseña de fábrica de los usuarios heredados: 'demo' encriptada con SHA256 + salt.
--    Los usuarios heredados se migran automáticamente a Argon2 al iniciar sesión o cambiar contraseña.
INSERT INTO `users` (`username`, `password_hash`, `salt`, `role`) VALUES
('demo', 'd7a5c84907c293d9e2646d45059acfbb5ceee6d8d669342149adf1cd61971a73', '9a03b5f92bdc489c', 'Colaborador'),
('adriana', '9fbfc9d2b8e61c62b9779df52cd4599a24cda3a68404e47cb1b8b725728b3889', '8c05b2f92bdc234a', 'Admin General'),
('jorge', '704c7758426449955ef45fdab45838b45915f306c8596e77ee2373b8140a7bf8', '7c01b2f52bdc567b', 'Administración'),
('carlos', '4029235116365d966ecb5bce7ec803b6093a1f4d218e3d7dc8304b6064025120', '5c03b1f92bdc112d', 'Gerente Dev'),
('sofia', '3e3e39aa812c07d618fbdd1b2c5142e1082567b2e225a440e22708744ac98628', '4c02b3f92bdc889e', 'Gerente Web')
ON DUPLICATE KEY UPDATE `role`=VALUES(`role`);

-- 2. CLIENTES
INSERT INTO `clients` (`id`, `company_name`, `contact_name`, `email`, `phone`, `status`, `services`, `responsible`, `next_renewal`, `avatar_initials`, `avatar_bg`) VALUES
('c_1', 'Constructora Murillo S.A.', 'Ing. Roberto Murillo', 'r.murillo@constructoramurillo.mx', '+52 664 234 5678', 'Activo', 4, 'Carlos Mendoza', '2025-02-15', 'CO', 'bg-[#f59e0b]'),
('c_2', 'Farmacia San Pablo del Norte', 'Lic. Patricia Sánchez', 'p.sanchez@farmsanpablo.mx', '+52 33 1234 5678', 'Activo', 3, 'Sofía Rodríguez', '2025-01-20', 'FA', 'bg-[#ec4899]'),
('c_3', 'Clínica Médica del Valle', 'Dr. Ernesto Valdés', 'e.valdes@clinicadelvalle.mx', '+52 81 9876 5432', 'Activo', 2, 'Luis Pérez', '2025-03-10', 'CL', 'bg-[#eab308]'),
('c_4', 'Grupo Inmobiliario Arenas', 'Arq. Mónica Arenas', 'm.arenas@grupoarenas.mx', '+52 55 5555 1234', 'Activo', 5, 'Marco Herrera', '2025-01-31', 'GR', 'bg-[#84cc16]'),
('c_5', 'Restaurante El Fogón Real', 'Chef Omar Lozano', 'o.lozano@elfogonreal.mx', '+52 33 8765 4321', 'Activo', 2, 'Sofía Rodríguez', '2025-04-05', 'RE', 'bg-[#a855f7]'),
('c_6', 'Academia de Idiomas Luminar', 'Mtra. Elena Quiroga', 'e.quiroga@idiomesluminar.mx', '+52 442 345 6789', 'Activo', 3, 'Luis Pérez', '2025-02-28', 'AC', 'bg-[#10b981]'),
('c_7', 'Despacho Jurídico Montoya & Asoc.', 'Lic. Hernán Montoya', 'h.montoya@montoya-abogados.mx', '+52 55 4444 3333', 'Próximo a vencer', 2, 'Carlos Mendoza', '2025-01-12', 'DE', 'bg-[#f59e0b]'),
('c_8', 'Distribuidora Noroeste Express', 'Lic. Beatriz Flores', 'b.flores@noroeste-express.mx', '+52 664 555 6677', 'Vencido', 3, 'Marco Herrera', '2024-12-20', 'DI', 'bg-[#ef4444]'),
('c_9', 'Hotel Boutique Riviera Maya', 'Lic. Andrés Castellanos', 'a.castellanos@rivieramaya-hotel.mx', '+52 998 123 4567', 'Activo', 4, 'Valeria Castro', '2025-05-15', 'HO', 'bg-[#1d63ff]'),
('c_10', 'Taller Automotriz Express TJ', 'Ing. Miguel Ramos', 'm.ramos@tallerexpress.mx', '+52 664 789 0123', 'Suspendido', 1, 'Luis Pérez', '2025-06-01', 'TA', 'bg-[#94a3b8]')
ON DUPLICATE KEY UPDATE `company_name`=VALUES(`company_name`);

-- 3. TAREAS KANBAN
INSERT INTO `tasks` (`id`, `title`, `description`, `column_name`, `priority`, `project_name`, `assignee`) VALUES
('t_1', 'Diseñar wireframes de la landing page', 'Crear bosquejo estructural en Figma y validar la alineación áurea.', 'Backlog', 'Media', 'Dashboard de Análisis Financiero', 'Eduardo López'),
('t_2', 'Replicar card de precios con gradiente', 'Desarrollar el componente en React + Tailwind usando clases rítmicas.', 'Desarrollo', 'Alta', 'Bento Layout Hero Section', 'Ana Silva'),
('t_3', 'Revisión de accesibilidad de colores', 'Verificar contraste contrast ratio AAA de los badges.', 'QA', 'Baja', 'Bento Layout Hero Section', 'Carlos Slim'),
('t_4', 'Definir tipografía Space Grotesk', 'Configurar fuentes responsivas y tracking tight en el header.', 'Diseño', 'Alta', 'Dashboard de Análisis Financiero', 'Eduardo López')
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`);

-- 4. FACTURAS / COBROS
INSERT INTO `invoices` (`id`, `client_name`, `amount`, `status`, `due_date`, `description`) VALUES
('inv_1', 'Google Latam', 45000.00, 'Pagado', '2026-07-15', 'Servicio de diseño UI/UX y exportación de componentes reactivos.'),
('inv_2', 'Nike México', 35000.00, 'Pendiente', '2026-07-28', 'Réplica interactiva del Bento Hero Section en React.'),
('inv_3', 'Netflix Inc', 15000.00, 'Vencido', '2026-06-30', 'Consultoría de branding y diseño de bento grids.')
ON DUPLICATE KEY UPDATE `amount`=VALUES(`amount`);

CREATE TABLE IF NOT EXISTS `module_data` (
  `username` VARCHAR(50) NOT NULL,
  `module_name` VARCHAR(40) NOT NULL,
  `data` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`username`, `module_name`),
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;
