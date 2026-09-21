import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { invalidateCache } from '../utils/cacheService.js';
import fs from 'fs';
import path from 'path';

// Jalankan cron jobs
export const startCronJobs = () => {
  // 1. Sweeper Booking Kadaluarsa (Jalan setiap 1 menit)
  cron.schedule('* * * * *', async () => {
    try {
      // 1. Cari batas waktu (15 menit yang lalu dari sekarang)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      // 2. Cari semua booking yang masih pending_payment dan sudah kadaluarsa
      const expiredBookings = await prisma.booking.findMany({
        where: {
          status: "pending_payment",
          created_at: {
            lt: fifteenMinutesAgo // created_at kurang dari (lebih lama dari) 15 menit lalu
          }
        },
        include: { details: true }
      });

      if (expiredBookings.length > 0) {
        console.log(`[Cron Sweeper] Ditemukan ${expiredBookings.length} transaksi kadaluarsa. Memproses pembatalan...`);

        // 3. Proses pembatalan dan pelepasan stok dengan transaction
        for (const booking of expiredBookings) {
          await prisma.$transaction(async (tx) => {
            // Update status booking jadi expired
            await tx.booking.update({
              where: { id_booking: booking.id_booking },
              data: { status: "expired" }
            });

            // Update status payment terkait jadi expire
            await tx.payment.updateMany({
              where: { id_booking: booking.id_booking, status: "pending" },
              data: { 
                status: "expire",
                catatan: "Dibatalkan otomatis oleh sistem (Waktu 15 menit habis)."
              }
            });

            // Format tanggal untuk keterangan
            const tglMulai = new Date(booking.tanggal_mulai).toISOString().split("T")[0];
            const tglSelesai = new Date(booking.tanggal_selesai).toISOString().split("T")[0];

            // Kembalikan stok yang di-hold (IN)
            for (const item of booking.details) {
              await tx.stockLog.create({
                data: {
                  id_product: item.id_product,
                  perubahan: "IN",
                  jumlah: item.jumlah,
                  keterangan: `Pembatalan Otomatis Sistem [EXPIRED] - Booking ${booking.kode_booking} (Tgl: ${tglMulai} s/d ${tglSelesai})`
                }
              });
            }
            
            console.log(`[Cron Sweeper] Booking ${booking.kode_booking} dibatalkan. Stok dikembalikan.`);
          });
        }

        // Hapus cache produk karena ada stok yang dirilis
        await invalidateCache("products:*");
        console.log(`[Cron Sweeper] Cache produk dihapus karena pembebasan stok.`);
      }

    } catch (error) {
      console.error("[Cron Sweeper] Error saat membersihkan transaksi kadaluarsa:", error);
    }
  });

  // 2. Sweeper Keranjang Belanja / Cart (Jalan setiap jam 03:00 pagi)
  cron.schedule('0 3 * * *', async () => {
    try {
      // Cari batas waktu (24 jam yang lalu)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 2A. Hapus cart yang tidak ada aktivitas (updated_at) selama lebih dari 24 jam
      // Berkat onDelete: Cascade di Prisma, item di dalam cart otomatis ikut terhapus
      const deletedCarts = await prisma.cart.deleteMany({
        where: {
          updated_at: {
            lt: twentyFourHoursAgo
          }
        }
      });

      if (deletedCarts.count > 0) {
        console.log(`[Cron Sweeper] Menghapus ${deletedCarts.count} keranjang belanja usang (24 Jam tidak aktif).`);
      }

      // 2B. Hapus data OTP yang sudah expired (Lebih dari 24 jam)
      // Ini membersihkan database dari riwayat request OTP sampah
      const deletedOtps = await prisma.oTPVerification.deleteMany({
        where: {
          expired_at: {
            lt: twentyFourHoursAgo
          }
        }
      });

      if (deletedOtps.count > 0) {
        console.log(`[Cron Sweeper] Menghapus ${deletedOtps.count} data OTP kadaluarsa.`);
      }

      // 2C. Hapus file KTP (foto_identitas) untuk booking EXPIRED / CANCELED yang lebih dari 7 hari
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const oldExpiredBookings = await prisma.booking.findMany({
        where: {
          status: { in: ["expired", "canceled"] },
          updated_at: { lt: sevenDaysAgo },
          foto_identitas: { not: null }
        },
        select: { id_booking: true, foto_identitas: true, kode_booking: true }
      });

      if (oldExpiredBookings.length > 0) {
        let deletedKtpCount = 0;
        
        for (const b of oldExpiredBookings) {
          const filePath = `./${b.foto_identitas}`;
          
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // Hapus file KTP fisik
            deletedKtpCount++;
            
            // Coba hapus folder kosong booking tersebut
            const folderPath = path.dirname(filePath);
            if (fs.existsSync(folderPath) && fs.readdirSync(folderPath).length === 0) {
              fs.rmdirSync(folderPath);
            }
          }
          
          // Set foto_identitas jadi null di database agar tidak dicari lagi besoknya
          await prisma.booking.update({
            where: { id_booking: b.id_booking },
            data: { foto_identitas: null }
          });
        }
        
        console.log(`[Cron Sweeper] Berhasil menghapus ${deletedKtpCount} file foto KTP dari booking lama yang expired/canceled.`);
      }

    } catch (error) {
      console.error("[Cron Sweeper] Error saat membersihkan keranjang usang:", error);
    }
  });

  console.log("⏰ Cron Service diaktifkan (Sweeper 15 Menit & Sweeper Cart Jam 03:00).");
};
