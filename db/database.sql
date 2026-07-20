-- BASE DE DATOS PARA DESIGNS CRM (COPIA DE database.sql)
-- Úsalo para importar en phpMyAdmin o en tu servidor MySQL local

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "-06:00";

CREATE DATABASE IF NOT EXISTS `designs_crm` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `designs_crm`;

CREATE TABLE IF NOT EXISTS `users` (
  `username` VARCHAR(50) NOT NULL PRIMARY KEY,
  `password_hash` VARCHAR(255) NOT NULL,
  `salt` VARCHAR(32) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'Colaborador',
  `name` VARCHAR(120) NULL,
  `email` VARCHAR(150) NULL,
  `area` VARCHAR(100) NULL,
  `status` ENUM('Activo','Bloqueado') NOT NULL DEFAULT 'Activo',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS `web_projects` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `client_name` VARCHAR(150) NOT NULL,
  `manager` VARCHAR(100) NOT NULL,
  `designer` VARCHAR(100) NOT NULL,
  `builder` VARCHAR(100) NOT NULL,
  `start_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `progress` INT NOT NULL DEFAULT 0,
  `status` ENUM('Diseño inicial', 'Carga de contenido', 'Revisión cliente', 'Publicado', 'Maquetación') NOT NULL DEFAULT 'Diseño inicial',
  `priority` ENUM('Alta', 'Media', 'Baja') NOT NULL DEFAULT 'Media',
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `client_name` VARCHAR(150) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` ENUM('Pagado', 'Pendiente', 'Vencido') NOT NULL DEFAULT 'Pendiente',
  `due_date` DATE NOT NULL,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de refresh tokens para autenticación (rotación y revocación)
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `token_hash` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeds mínimos
INSERT IGNORE INTO `users` (`username`, `password_hash`, `salt`, `role`, `name`, `email`) VALUES
('demo', '00b28913b839804e339178cb3cb4fe4b8a5c3bbecbf9e023472be9bf1293aeb4', '9a03b5f92bdc489c', 'Colaborador', 'Demo User', 'demo@designs.mx'),
('adriana', 'be3927d206f6904e223192cb9cb4fefb2a8c3bbffbf9e083472be9bf1283deb5', '8c05b2f92bdc234a', 'Admin General', 'Adriana García', 'adriana@designs.mx');

CREATE TABLE IF NOT EXISTS `module_data` (
  `username` VARCHAR(50) NOT NULL,
  `module_name` VARCHAR(40) NOT NULL,
  `data` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`username`, `module_name`),
  FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;
