-- dcpet labborrow: lab equipment borrowing and inventory system
-- import in phpmyadmin (import tab) or: mysql -u root < labborrow_db.sql
-- demo password for every account: password123

DROP DATABASE IF EXISTS labborrow_db;
CREATE DATABASE labborrow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE labborrow_db;

-- accounts and roles
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id      VARCHAR(20)  NOT NULL UNIQUE,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('super_admin','admin','user') NOT NULL DEFAULT 'user',
  borrower_type  ENUM('Student','Faculty','Staff') NOT NULL DEFAULT 'Student',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- inventory catalog, availability is computed from borrow_requests
CREATE TABLE equipment (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  category        VARCHAR(60)  NOT NULL,
  laboratory      VARCHAR(80)  NOT NULL,
  total_units     INT UNSIGNED NOT NULL,
  item_condition  ENUM('Good','Needs calibration','Under repair','Retired') NOT NULL DEFAULT 'Good',
  description     TEXT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_equipment_category (category),
  CHECK (total_units >= 1)
) ENGINE=InnoDB;

-- main record: one borrower, one item, a quantity and a date range
-- overdue is not stored: status = BORROWED and due_date < today
CREATE TABLE borrow_requests (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(20)  NULL UNIQUE,
  user_id          INT UNSIGNED NOT NULL,
  equipment_id     INT UNSIGNED NOT NULL,
  quantity         INT UNSIGNED NOT NULL,
  purpose          ENUM('Class activity','Project','Thesis','Other') NOT NULL,
  purpose_details  VARCHAR(255) NULL,
  borrow_date      DATE NOT NULL,
  due_date         DATE NOT NULL,
  returned_date    DATE NULL,
  status           ENUM('PENDING','APPROVED','BORROWED','RETURNED','REJECTED') NOT NULL DEFAULT 'PENDING',
  remarks          VARCHAR(255) NULL,
  created_by       INT UNSIGNED NULL,
  processed_by     INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_user      FOREIGN KEY (user_id)      REFERENCES users(id)     ON DELETE RESTRICT,
  CONSTRAINT fk_requests_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requests_creator   FOREIGN KEY (created_by)   REFERENCES users(id)     ON DELETE SET NULL,
  CONSTRAINT fk_requests_processor FOREIGN KEY (processed_by) REFERENCES users(id)     ON DELETE SET NULL,
  INDEX idx_requests_status (status),
  INDEX idx_requests_due (due_date),
  CHECK (quantity >= 1),
  CHECK (due_date >= borrow_date)
) ENGINE=InnoDB;

-- audit trail of every change
CREATE TABLE activity_log (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NULL,
  action       VARCHAR(30)  NOT NULL,
  entity_type  VARCHAR(30)  NOT NULL,
  entity_id    INT UNSIGNED NULL,
  summary      VARCHAR(255) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_created (created_at)
) ENGINE=InnoDB;

-- seed data
INSERT INTO users (id, school_id, full_name, email, password_hash, role, borrower_type, is_active) VALUES
(1, 'SA-0001', 'Dr. Elena Castillo', 'superadmin@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'super_admin', 'Staff', 1),
(2, 'STAFF-001', 'Ronald Dizon', 'admin@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'admin', 'Staff', 1),
(3, 'STAFF-002', 'Grace Manalo', 'gmanalo@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'admin', 'Staff', 1),
(4, '2023-00142', 'Andrea Santos', 'asantos@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(5, '2022-00318', 'Mark Villanueva', 'mvillanueva@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(6, 'F-0031', 'Engr. Liza Ramos', 'lramos@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Faculty', 1),
(7, '2024-00077', 'Paolo Reyes', 'preyes@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(8, '2022-00451', 'Kristine Lim', 'klim@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(9, '2023-00219', 'Joshua Tan', 'jtan@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(10, '2024-00103', 'Maria Cruz', 'mcruz@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(11, '2022-00502', 'Carlo Mendoza', 'cmendoza@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(12, 'F-0017', 'Engr. Ramon Garcia', 'rgarcia@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Faculty', 1),
(13, '2024-00188', 'Bea Navarro', 'bnavarro@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(14, '2023-00390', 'Enzo Aquino', 'eaquino@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(15, '2024-00055', 'Trisha Gomez', 'tgomez@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(16, '2023-00264', 'Nathan Flores', 'nflores@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1),
(17, '2024-00126', 'Ella Bautista', 'ebautista@school.edu.ph', '$2y$10$rucITLmTwdCu/YyoT1Es6OTksymPwtP3ixZBIl880owSn/UGUhttu', 'user', 'Student', 1);

INSERT INTO equipment (id, code, name, category, laboratory, total_units, item_condition, description) VALUES
(1, 'EQ-001', 'Digital Oscilloscope', 'Electronics', 'Electronics Lab (EN-201)', 4, 'Good', NULL),
(2, 'EQ-002', 'Function Generator', 'Electronics', 'Electronics Lab (EN-201)', 4, 'Good', NULL),
(3, 'EQ-003', 'Digital Multimeter', 'Measurement', 'Electronics Lab (EN-201)', 12, 'Good', NULL),
(4, 'EQ-004', 'Arduino Uno Starter Kit', 'Microcontrollers', 'Embedded Systems Lab (ES-204)', 10, 'Good', NULL),
(5, 'EQ-005', 'Raspberry Pi 4 Kit', 'Microcontrollers', 'Embedded Systems Lab (ES-204)', 6, 'Good', NULL),
(6, 'EQ-006', 'Soldering Station', 'Tools', 'Embedded Systems Lab (ES-204)', 5, 'Needs calibration', NULL),
(7, 'EQ-007', 'Network Cable Tester', 'Networking', 'Networking Lab (NL-302)', 3, 'Good', NULL),
(8, 'EQ-008', 'RJ45 Crimping Tool', 'Networking', 'Networking Lab (NL-302)', 6, 'Good', NULL),
(9, 'EQ-009', '24-Port Managed Switch', 'Networking', 'Networking Lab (NL-302)', 2, 'Good', NULL),
(10, 'EQ-010', 'Laptop (Core i5, 16 GB)', 'Computing', 'Computer Lab (CL-105)', 8, 'Good', NULL),
(11, 'EQ-011', 'DC Power Supply', 'Electronics', 'Electronics Lab (EN-201)', 5, 'Good', NULL),
(12, 'EQ-012', 'Logic Analyzer', 'Measurement', 'Electronics Lab (EN-201)', 2, 'Good', NULL);

INSERT INTO borrow_requests (id, code, user_id, equipment_id, quantity, purpose, purpose_details, borrow_date, due_date, returned_date, status, remarks, created_by, processed_by, created_at) VALUES
(1, 'BR-2026-0001', 4, 4, 2, 'Class activity', NULL, '2026-10-31', '2026-11-04', '2026-11-04', 'RETURNED', NULL, 4, 2, '2026-10-29 09:15:00'),
(2, 'BR-2026-0002', 5, 1, 1, 'Thesis', NULL, '2026-11-02', '2026-11-09', '2026-11-10', 'RETURNED', 'Returned one day late.', 5, 2, '2026-10-31 14:02:00'),
(3, 'BR-2026-0003', 6, 10, 3, 'Class activity', NULL, '2026-11-07', '2026-11-11', '2026-11-11', 'RETURNED', NULL, 6, 2, '2026-11-04 08:40:00'),
(4, 'BR-2026-0004', 7, 7, 1, 'Project', NULL, '2026-11-09', '2026-11-16', NULL, 'BORROWED', NULL, 7, 2, '2026-11-08 10:20:00'),
(5, 'BR-2026-0005', 8, 5, 1, 'Thesis', NULL, '2026-11-14', '2026-11-28', NULL, 'BORROWED', NULL, 8, 2, '2026-11-11 16:45:00'),
(6, 'BR-2026-0006', 9, 6, 1, 'Project', NULL, '2026-11-15', '2026-11-18', NULL, 'BORROWED', NULL, 9, 2, '2026-11-14 11:05:00'),
(7, 'BR-2026-0007', 10, 3, 4, 'Class activity', NULL, '2026-11-21', '2026-11-25', NULL, 'BORROWED', NULL, 10, 2, '2026-11-19 09:30:00'),
(8, 'BR-2026-0008', 11, 12, 1, 'Thesis', NULL, '2026-11-24', '2026-12-01', NULL, 'APPROVED', NULL, 11, 2, '2026-11-20 13:10:00'),
(9, 'BR-2026-0009', 12, 2, 2, 'Class activity', NULL, '2026-11-25', '2026-11-25', NULL, 'APPROVED', NULL, 12, 2, '2026-11-21 07:55:00'),
(10, 'BR-2026-0010', 13, 8, 2, 'Project', NULL, '2026-11-27', '2026-11-30', NULL, 'PENDING', NULL, 13, NULL, '2026-11-22 15:25:00'),
(11, 'BR-2026-0011', 14, 9, 1, 'Other', 'Network certification review', '2026-11-28', '2026-12-02', NULL, 'PENDING', NULL, 14, NULL, '2026-11-22 17:40:00'),
(12, 'BR-2026-0012', 15, 11, 1, 'Project', NULL, '2026-11-29', '2026-12-01', NULL, 'PENDING', NULL, 15, NULL, '2026-11-23 08:05:00'),
(13, 'BR-2026-0013', 16, 1, 2, 'Project', NULL, '2026-11-17', '2026-11-19', NULL, 'REJECTED', 'Only one unit allowed per student group.', 16, 2, '2026-11-15 10:00:00'),
(14, 'BR-2026-0014', 17, 4, 3, 'Class activity', NULL, '2026-11-18', '2026-11-22', NULL, 'BORROWED', NULL, 17, 2, '2026-11-17 12:35:00'),
(15, 'BR-2026-0015', 6, 5, 5, 'Class activity', NULL, '2026-11-23', '2026-11-23', NULL, 'BORROWED', 'Laboratory exercise 4.', 6, 2, '2026-11-21 09:00:00'),
(16, 'BR-2026-0016', 7, 3, 1, 'Thesis', NULL, '2026-11-30', '2026-12-04', NULL, 'PENDING', NULL, 7, NULL, '2026-11-23 10:12:00'),
(17, 'BR-2026-0017', 8, 10, 1, 'Thesis', NULL, '2026-11-04', '2026-11-08', '2026-11-07', 'RETURNED', NULL, 8, 2, '2026-11-02 15:50:00');

INSERT INTO activity_log (user_id, action, entity_type, entity_id, summary, created_at) VALUES
(1, 'create', 'database', NULL, 'Database created with demo records', '2026-11-24 08:00:00');
