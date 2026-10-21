-- Database sementara Smart Garden (opsional: database & tabel juga dibuat otomatis oleh server)
-- Import lewat phpMyAdmin, atau: mysql -u root < database/peter.sql
CREATE DATABASE IF NOT EXISTS `peter`;
USE `peter`;

CREATE TABLE IF NOT EXISTS `sensor_data` (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NULL,
    tanaman VARCHAR(50) NULL,
    soil_percent INT NULL,
    soil_raw INT NULL,
    temperature FLOAT NULL,
    humidity FLOAT NULL,
    water_raw TINYINT NULL,
    water_level_status VARCHAR(10) NULL,
    is_water_empty TINYINT(1) NOT NULL DEFAULT 0,
    is_soil_dry TINYINT(1) NOT NULL DEFAULT 0,
    pump_status VARCHAR(5) NULL,
    relay_d23 TINYINT(1) NOT NULL DEFAULT 0,
    pump_command VARCHAR(10) NULL,
    pump_command_local VARCHAR(10) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_created_at (created_at)
);
