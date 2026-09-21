import prisma from "../config/prisma.js";
import midtransClient from "midtrans-client";
import { invalidateCache } from "../utils/cacheService.js";
import { sendPaymentSuccessEmail } from "../services/emailService.js";

// Inisialisasi Midtrans Snap Client (Core API)
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

export const midtransWebhook = async (req, res) => {
  try {
    const notificationJson = req.body;

    // Verifikasi notifikasi menggunakan serverKey Midtrans untuk memastikan itu valid
    const statusResponse = await snap.transaction.notification(notificationJson);

    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`[Midtrans Webhook] Menerima notifikasi untuk Order ID: ${orderId} | Status: ${transactionStatus} | Fraud: ${fraudStatus}`);

    // Cari booking berdasarkan kode_booking (orderId)
    const booking = await prisma.booking.findUnique({
      where: { kode_booking: orderId },
      include: { 
        details: {
          include: {
            product: true
          }
        } 
      },
    });

    if (!booking) {
      console.log(`[Midtrans Webhook] Booking dengan kode ${orderId} tidak ditemukan.`);
      return res.status(404).json({ error: "Booking tidak ditemukan" });
    }

    // Hanya proses jika status booking masih 'pending_payment'
    if (booking.status !== "pending_payment") {
      console.log(`[Midtrans Webhook] Booking ${orderId} sudah berstatus ${booking.status}, mengabaikan notifikasi.`);
      return res.status(200).json({ message: "Status sudah diperbarui sebelumnya" });
    }

    // Variabel penampung status berdasarkan ENUM lu
    let finalBookingStatus = "pending_payment";
    let finalPaymentStatus = "pending";
    let isCanceledOrExpired = false;

    // 🗺️ PEMETAAN LOGIKA STATUS (Sesuai dengan Enum BookingStatus & PaymentStatus lu)
    if (transactionStatus === "capture") {
      if (fraudStatus === "challenge") {
        finalBookingStatus = "pending_payment";
        finalPaymentStatus = "pending";
      } else if (fraudStatus === "accept") {
        finalBookingStatus = "paid";         // 🌟 Sesuai Enum BookingStatus: paid
        finalPaymentStatus = "settlement";   // 🌟 Sesuai Enum PaymentStatus: settlement
      }
    } else if (transactionStatus === "settlement") {
      finalBookingStatus = "paid";           // 🌟 Sesuai Enum BookingStatus: paid
      finalPaymentStatus = "settlement";     // 🌟 Sesuai Enum PaymentStatus: settlement
    } else if (transactionStatus === "expire") {
      finalBookingStatus = "expired";        // 🌟 Sesuai Enum BookingStatus: expired
      finalPaymentStatus = "expire";         // 🌟 Sesuai Enum PaymentStatus: expire
      isCanceledOrExpired = true;
    } else if (transactionStatus === "cancel") {
      finalBookingStatus = "canceled";       // 🌟 Sesuai Enum BookingStatus: canceled (satu 'l')
      finalPaymentStatus = "cancel";         // 🌟 Sesuai Enum PaymentStatus: cancel
      isCanceledOrExpired = true;
    } else if (transactionStatus === "deny") {
      finalBookingStatus = "canceled";       // 🌟 Jika ditolak Midtrans, masukkan ke canceled
      finalPaymentStatus = "deny";           // 🌟 Sesuai Enum PaymentStatus: deny
      isCanceledOrExpired = true;
    } else if (transactionStatus === "pending") {
      finalBookingStatus = "pending_payment";
      finalPaymentStatus = "pending";
    }

    // Jika status berubah dari pending_payment, lakukan update via Prisma Transaction
    if (finalBookingStatus !== booking.status) {
      await prisma.$transaction(async (tx) => {

        // 1. Update status utama di tabel Booking
        await tx.booking.update({
          where: { id_booking: booking.id_booking },
          data: { status: finalBookingStatus },
        });

        // 2. Update status detail di tabel Payment
        await tx.payment.updateMany({
          where: { id_booking: booking.id_booking },
          data: {
            status: finalPaymentStatus,
            metode: statusResponse.payment_type || "midtrans",
            reference_id: statusResponse.transaction_id, // Overwrite token snap dengan ID transaksi asli
            payment_time: new Date(),
            catatan: `Status disinkronkan via Webhook Midtrans: ${transactionStatus}`
          }
        });

        // Format tanggal untuk keterangan stock log
        const tglMulai = new Date(booking.tanggal_mulai).toISOString().split("T")[0];
        const tglSelesai = new Date(booking.tanggal_selesai).toISOString().split("T")[0];

        // JIKA PAID: Stok resmi OUT karena alat sudah aman dipesan
        if (finalBookingStatus === "paid") {
          for (const item of booking.details) {
            await tx.stockLog.create({
              data: {
                id_product: item.id_product,
                perubahan: "OUT",
                jumlah: item.jumlah,
                keterangan: `Pembayaran berhasil - Booking ${orderId} (${tglMulai} s/d ${tglSelesai})`,
              },
            });
          }
          console.log(`[Midtrans Webhook] Stok tercatat OUT untuk Booking ${orderId}.`);
        }

        // JIKA EXPIRED / CANCELED: Kembalikan stok yang di-hold tadi (IN)
        if (isCanceledOrExpired) {
          for (const item of booking.details) {
            await tx.stockLog.create({
              data: {
                id_product: item.id_product,
                perubahan: "IN",
                jumlah: item.jumlah,
                keterangan: `Pembatalan/Sesi Habis otomatis sistem [${finalBookingStatus.toUpperCase()}] - Booking ${orderId} (Tgl: ${tglMulai} s/d ${tglSelesai})`,
              },
            });
          }
          console.log(`[Midtrans Webhook] Stok untuk Booking ${orderId} telah dikembalikan (IN).`);
        }
      });

      // Hapus Cache Produk agar info stok terbaru langsung segar di frontend
      await invalidateCache("products:*");
      console.log(`[Midtrans Webhook] Cache produk dihapus karena perubahan status booking ${orderId}.`);

      // 📧 Kirim email konfirmasi sukses jika lunas
      if (finalBookingStatus === "paid") {
        sendPaymentSuccessEmail(booking);
      }
    }

    // Beri HTTP 200 OK ke Midtrans
    return res.status(200).json({ status: "success", message: "Webhook processed successfully" });
  } catch (error) {
    console.error("💥 ERROR PADA MIDTRANS WEBHOOK:", error);
    return res.status(500).json({ error: error.message });
  }
};