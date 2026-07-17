-- Web Push: suscripciones por usuario y control de entregas únicas.
-- Ejecutar sobre la base de datos del CRM si el usuario de Node no tiene permiso CREATE.

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` CHAR(64) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dh` VARCHAR(255) NOT NULL,
  `auth` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_push_username` (`username`),
  CONSTRAINT `fk_push_user` FOREIGN KEY (`username`) REFERENCES `users` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_deliveries` (
  `subscription_id` CHAR(64) NOT NULL,
  `event_key` VARCHAR(190) NOT NULL,
  `delivered_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscription_id`, `event_key`),
  CONSTRAINT `fk_push_delivery_subscription` FOREIGN KEY (`subscription_id`)
    REFERENCES `push_subscriptions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
