-- Ejecutar en phpMyAdmin después de seleccionar/importar la base designs_crm.
USE `designs_crm`;

CREATE TABLE IF NOT EXISTS `module_data` (
  `username` VARCHAR(50) NOT NULL,
  `module_name` VARCHAR(40) NOT NULL,
  `data` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`username`, `module_name`),
  CONSTRAINT `fk_module_data_user` FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
