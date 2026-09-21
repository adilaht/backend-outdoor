-- CreateTable
CREATE TABLE `Cart` (
    `id_cart` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` VARCHAR(191) NOT NULL,
    `tanggal_mulai` DATETIME(3) NULL,
    `tanggal_selesai` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `expired_at` DATETIME(3) NULL,

    UNIQUE INDEX `Cart_session_id_key`(`session_id`),
    PRIMARY KEY (`id_cart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CartItem` (
    `id_item` INTEGER NOT NULL AUTO_INCREMENT,
    `id_cart` INTEGER NOT NULL,
    `id_product` INTEGER NOT NULL,
    `jumlah` INTEGER NOT NULL,
    `is_available` BOOLEAN NOT NULL DEFAULT true,

    INDEX `CartItem_id_cart_idx`(`id_cart`),
    INDEX `CartItem_id_product_idx`(`id_product`),
    PRIMARY KEY (`id_item`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Admin` (
    `id_admin` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `nama` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Admin_email_key`(`email`),
    PRIMARY KEY (`id_admin`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id_product` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `deskripsi` VARCHAR(191) NOT NULL,
    `harga_per_hari` INTEGER NOT NULL,
    `stok_total` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `category_id` INTEGER NULL,

    UNIQUE INDEX `Product_slug_key`(`slug`),
    INDEX `idx_category_id`(`category_id`),
    INDEX `idx_active_category`(`is_active`, `category_id`),
    PRIMARY KEY (`id_product`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id_category` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id_category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductImage` (
    `id_image` INTEGER NOT NULL AUTO_INCREMENT,
    `id_product` INTEGER NOT NULL,
    `url` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id_image`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id_booking` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_booking` VARCHAR(191) NOT NULL,
    `nama_customer` VARCHAR(191) NOT NULL,
    `no_hp` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `alamat` VARCHAR(191) NULL,
    `foto_identitas` VARCHAR(191) NULL,
    `tanggal_mulai` DATETIME(3) NOT NULL,
    `tanggal_selesai` DATETIME(3) NOT NULL,
    `total_harga` INTEGER NOT NULL,
    `status` ENUM('pending_payment', 'paid', 'ongoing', 'completed', 'expired', 'canceled') NOT NULL DEFAULT 'pending_payment',
    `sumber` ENUM('online', 'offline') NOT NULL DEFAULT 'online',
    `expired_at` DATETIME(3) NULL,
    `tanggal_kembali` DATETIME(3) NULL,
    `nominal_denda` INTEGER NOT NULL DEFAULT 0,
    `catatan_denda` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Booking_kode_booking_key`(`kode_booking`),
    PRIMARY KEY (`id_booking`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingDetail` (
    `id_detail` INTEGER NOT NULL AUTO_INCREMENT,
    `id_booking` INTEGER NOT NULL,
    `id_product` INTEGER NOT NULL,
    `jumlah` INTEGER NOT NULL,
    `harga_sewa` INTEGER NOT NULL,
    `subtotal` INTEGER NOT NULL,

    INDEX `BookingDetail_id_booking_idx`(`id_booking`),
    INDEX `BookingDetail_id_product_idx`(`id_product`),
    PRIMARY KEY (`id_detail`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id_payment` INTEGER NOT NULL AUTO_INCREMENT,
    `id_booking` INTEGER NOT NULL,
    `metode` VARCHAR(191) NOT NULL,
    `catatan` TEXT NULL,
    `jumlah_bayar` INTEGER NOT NULL,
    `status` ENUM('pending', 'settlement', 'expire', 'cancel', 'deny', 'refund') NOT NULL DEFAULT 'pending',
    `reference_id` VARCHAR(191) NOT NULL,
    `payment_time` DATETIME(3) NULL,

    UNIQUE INDEX `Payment_reference_id_key`(`reference_id`),
    INDEX `Payment_id_booking_idx`(`id_booking`),
    PRIMARY KEY (`id_payment`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLog` (
    `id_log` INTEGER NOT NULL AUTO_INCREMENT,
    `id_product` INTEGER NOT NULL,
    `perubahan` ENUM('IN', 'OUT', 'HOLD', 'RELEASE') NOT NULL,
    `jumlah` INTEGER NOT NULL,
    `keterangan` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockLog_id_product_idx`(`id_product`),
    PRIMARY KEY (`id_log`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OTPVerification` (
    `id_otp` INTEGER NOT NULL AUTO_INCREMENT,
    `kontak` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `kode_otp` VARCHAR(191) NOT NULL,
    `expired_at` DATETIME(3) NOT NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `temp_data` JSON NULL,

    INDEX `OTPVerification_kontak_idx`(`kontak`),
    PRIMARY KEY (`id_otp`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CartItem` ADD CONSTRAINT `CartItem_id_cart_fkey` FOREIGN KEY (`id_cart`) REFERENCES `Cart`(`id_cart`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartItem` ADD CONSTRAINT `CartItem_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `Product`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `Category`(`id_category`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `Product`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingDetail` ADD CONSTRAINT `BookingDetail_id_booking_fkey` FOREIGN KEY (`id_booking`) REFERENCES `Booking`(`id_booking`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingDetail` ADD CONSTRAINT `BookingDetail_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `Product`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_id_booking_fkey` FOREIGN KEY (`id_booking`) REFERENCES `Booking`(`id_booking`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLog` ADD CONSTRAINT `StockLog_id_product_fkey` FOREIGN KEY (`id_product`) REFERENCES `Product`(`id_product`) ON DELETE RESTRICT ON UPDATE CASCADE;
