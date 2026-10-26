import * as cartModel from "../models/cartModel.js";
import * as bookingModel from "../models/bookingModel.js";
import prisma from "../config/prisma.js";
import { sendOTPEmail } from "../utils/sendOtp.js";
import { sendPendingPaymentEmail } from "../services/emailService.js";
import fs from "fs";
import path from "path";
import midtransClient from "midtrans-client";
import crypto from "crypto";
import { getBookingConflictConditions, checkStockBatch } from "../services/stockService.js";
import { invalidateCache } from "../utils/cacheService.js";

// Inisialisasi Midtrans Snap Client
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

export const checkoutBooking = async (req, res) => {
  const t_start = Date.now();
  console.log(`\n🚀 [CHECKOUT START] Session: ${req.session_id} | File: ${req.file?.filename} (${req.file?.size} bytes) | Multer: ${req.multerDuration || 0}ms`);
  try {
    // 1. Ambil data teks biasa dari req.body
    const { nama_customer, email, no_hp, tanggal_mulai, tanggal_selesai, alamat } = req.body;

    // 🌟 TAMBAHAN: Validasi apakah berkas berhasil ditangkap Multer
    if (!req.file) {
      return res.status(400).json({ error: "Foto identitas wajib diunggah" });
    }

    // 🌟 TAMBAHAN: Ambil path penyimpanan sementara berdasarkan session_id
    const sessionId = req.session_id || "guest";
    const foto_identitas = `storage/private/bookings/${sessionId}/${req.file.filename}`;

    // Validasi field teks wajib isi (foto_identitas sudah tidak diambil dari req.body)
    if (!nama_customer || !email || !no_hp || !tanggal_mulai || !tanggal_selesai) {
      return res.status(400).json({ error: "Nama, email, no HP, dan rentang tanggal sewa wajib diisi" });
    }

    // Amankan parsing zona waktu tanggal sewa agar presisi saat pengecekan stok SQL
    const dateMulai = new Date(`${tanggal_mulai}T00:00:00.000Z`);
    const dateSelesai = new Date(`${tanggal_selesai}T23:59:59.000Z`);

    const t_before_cart = Date.now();
    const cart = await prisma.cart.findUnique({
      where: { session_id: req.session_id },
      include: {
        items: {
          include: { product: true },
        },
      },
    });
    const dur_cart = Date.now() - t_before_cart;
    console.log(`🛒 [CHECKOUT 3/5 - AMBIL KERANJANG] Durasi: ${dur_cart}ms | Items: ${cart?.items?.length || 0}`);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: "Keranjang belanja Anda masih kosong" });
    }

    // 🔥 VALIDASI STOK BATCH (Bebas N+1)
    const t_before_stock = Date.now();
    const { is_all_available, results: checkoutStockResults } = await checkStockBatch({
      items: cart.items,
      tanggal_mulai: dateMulai,
      tanggal_selesai: dateSelesai,
    });
    const dur_stock = Date.now() - t_before_stock;
    console.log(`📊 [CHECKOUT 4/5 - VALIDASI STOK BATCH] Durasi: ${dur_stock}ms | Available: ${is_all_available}`);

    if (!is_all_available) {
      const unavailable = checkoutStockResults.find((r) => !r.is_available);
      return res.status(400).json({
        error: `Stok produk [${unavailable.nama}] tidak mencukupi untuk rentang tanggal tersebut.`,
      });
    }

    // ✅ Hapus OTP lama sesi ini secara terindeks (idx_otp_session_verified) di background
    // Tidak di-await agar tidak menahan proses respons HTTP dan menghindari lock wait InnoDB
    prisma.oTPVerification.deleteMany({
      where: {
        session_id: req.session_id,
        is_verified: false,
      },
    }).catch((err) => console.warn("Pembersihan OTP lama sesi (non-blocking):", err.message));

    // ✅ Generate OTP 6 Digit String
    const randomBuffer = crypto.randomBytes(4); // Ambil 4 byte (32-bit)
    const randomNumber = randomBuffer.readUInt32BE(0); // Menggunakan UInt32BE
    const kode_otp = (100000 + (randomNumber % 900000)).toString();

    // 🌟 TAMBAHAN: Amankan konversi objek items (DateTime fields sanitization untuk tipe JSON Prisma)
    const sanitizedItems = JSON.parse(JSON.stringify(cart.items));

    // ✅ Simpan OTP + temp data ke DB
    const t_before_otp = Date.now();
    await prisma.oTPVerification.create({
      data: {
        kontak: email,
        session_id: req.session_id,
        kode_otp: kode_otp,
        expired_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        temp_data: {
          nama_customer,
          email,
          no_hp,
          tanggal_mulai,
          tanggal_selesai,
          foto_identitas, // Jalur path privat sementara ter-record di sini
          alamat,
          items: sanitizedItems,
        },
      },
    });
    const dur_otp = Date.now() - t_before_otp;
    console.log(`🔐 [CHECKOUT 5/5 - SIMPAN OTP] Durasi: ${dur_otp}ms | Email: ${email}`);

    // ✅ Kirim email token via nodemailer di background (non-blocking agar respon ke client instan)
    sendOTPEmail(email, kode_otp).catch((err) => {
      console.error("💥 Gagal kirim email OTP di background:", err.message);
    });

    const total_dur = Date.now() - (req.t_entry || t_start);
    console.log(`✅ [CHECKOUT SUKSES] Total Keseluruhan: ${total_dur}ms (Multer: ${req.multerDuration || 0}ms | Cart: ${dur_cart}ms | Stock: ${dur_stock}ms | OTP: ${dur_otp}ms)\n`);

    // Kirim respons balik ke Next.js secara instan
    res.json({
      success: true,
      message: "OTP berhasil dikirim ke email",
    });

  } catch (error) {
    console.error(`💥 ERROR PADA CONTROLLER CHECKOUT (${Date.now() - t_start}ms):`, error);
    res.status(500).json({ error: error.message });
  }
};


export const verifyBooking = async (req, res) => {
  try {
    const { kode_otp } = req.body;

    // ──────────────────────────────────────────────────────────────
    // 🛡️ LANGKAH 0: Cari OTP Awal (Read-Only, di LUAR transaksi)
    // Tujuan: Validasi cepat sebelum masuk transaksi berat.
    //         Jika OTP salah / expired, tolak langsung tanpa membebani database.
    // ──────────────────────────────────────────────────────────────
    const otp = await prisma.oTPVerification.findFirst({
      where: {
        session_id: req.session_id,
        kode_otp,
        is_verified: false,
        expired_at: {
          gt: new Date(),
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (!otp) {
      return res.status(400).json({ error: "Kode OTP salah atau sudah kedaluwarsa, bro!" });
    }

    const data = otp.temp_data;

    // Hitung selisih hari rental
    const start = new Date(data.tanggal_mulai);
    const end = new Date(data.tanggal_selesai);
    const dateMulai = new Date(`${data.tanggal_mulai}T00:00:00.000Z`);
    const dateSelesai = new Date(`${data.tanggal_selesai}T23:59:59.000Z`);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;

    let total_harga = 0;
    const detailsData = data.items.map((item) => {
      const harga_sewa = item.product.harga_per_hari;
      const subtotal = harga_sewa * item.jumlah * diffDays;
      total_harga += subtotal;
      return {
        id_product: item.id_product,
        jumlah: item.jumlah,
        harga_sewa,
        subtotal,
      };
    });

    // 1. Pembuatan kode_booking / invoice resmi
    const tgl = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const hashAcak = crypto.randomBytes(2).toString("hex").toUpperCase();
    const kode_booking = `BOOK-${tgl}-${hashAcak}`;

    // 2. 📂 PROSES PEMINDAHAN FILE KTP KE FOLDER KODE_BOOKING
    const oldPath = data.foto_identitas;
    const newFolder = `./storage/private/bookings/${kode_booking}`;
    const filename = path.basename(oldPath);
    const finalDbPath = `storage/private/bookings/${kode_booking}/${filename}`;

    if (fs.existsSync(`./${oldPath}`)) {
      if (!fs.existsSync(newFolder)) {
        fs.mkdirSync(newFolder, { recursive: true });
      }
      fs.renameSync(`./${oldPath}`, path.join(newFolder, filename));

      const oldFolder = `./storage/private/bookings/${req.session_id}`;
      if (fs.existsSync(oldFolder)) {
        fs.rmSync(oldFolder, { recursive: true, force: true });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // 3. 🔒 TRANSAKSI DATABASE ATOMIK (Anti Race Condition)
    //    Semua operasi kritis dijalankan di dalam 1 transaksi.
    //    Jika salah satu langkah gagal, SEMUA di-rollback otomatis.
    // ──────────────────────────────────────────────────────────────
    const booking = await prisma.$transaction(async (tx) => {

      // ┌─────────────────────────────────────────────────────────┐
      // │ 🛡️ GUARD 1: Kunci OTP Secara Atomik (Anti Double-Click)│
      // │                                                         │
      // │ Menggunakan updateMany dengan kondisi is_verified:false. │
      // │ Jika 2 request masuk berbarengan, hanya REQUEST PERTAMA │
      // │ yang berhasil meng-update (count = 1). Request kedua    │
      // │ akan mendapat count = 0 karena baris sudah berubah.     │
      // └─────────────────────────────────────────────────────────┘
      const claimResult = await tx.oTPVerification.updateMany({
        where: {
          id_otp: otp.id_otp,
          is_verified: false, // Kondisi kunci: hanya bisa diambil jika BELUM terverifikasi
        },
        data: {
          is_verified: true,
        },
      });

      // Jika count = 0, artinya request lain sudah mengklaim OTP ini lebih dulu
      if (claimResult.count === 0) {
        throw new Error("OTP sudah digunakan oleh permintaan lain. Silakan ulangi proses checkout.");
      }

      // ┌─────────────────────────────────────────────────────────┐
      // │ 🛡️ GUARD 2: Validasi Ulang Stok (Anti Overbooking Batch) │
      // └─────────────────────────────────────────────────────────┘
      const { is_all_available, results: verifyStockResults } = await checkStockBatch({
        items: data.items,
        tanggal_mulai: data.tanggal_mulai,
        tanggal_selesai: data.tanggal_selesai,
        prismaClient: tx,
      });

      if (!is_all_available) {
        const unavailable = verifyStockResults.find((r) => !r.is_available);
        throw new Error(
          `Maaf, stok produk [${unavailable.nama}] baru saja diambil pelanggan lain untuk rentang tanggal tersebut.`
        );
      }

      // ┌─────────────────────────────────────────────────────────┐
      // │ ✅ Semua guard lolos — aman untuk membuat booking.      │
      // └─────────────────────────────────────────────────────────┘
      const newBooking = await tx.booking.create({
        data: {
          kode_booking,
          nama_customer: data.nama_customer,
          email: data.email,
          no_hp: data.no_hp,
          alamat: data.alamat || null,
          foto_identitas: finalDbPath,
          tanggal_mulai: start,
          tanggal_selesai: end,
          total_harga,
          status: "pending_payment",
          details: {
            create: detailsData,
          },
        },
      });

      // Update Stock Log secara Batch INSERT (Hold sementara karena status pending_payment)
      await tx.stockLog.createMany({
        data: data.items.map((item) => ({
          id_product: item.id_product,
          perubahan: "HOLD",
          jumlah: item.jumlah,
          keterangan: `Booking ${kode_booking} (Menunggu Pembayaran)`,
        })),
      });

      // Hapus Cart Belanjaan Guest
      await tx.cart.delete({
        where: { session_id: req.session_id },
      });

      // Buat record Payment awal (Pending)
      await tx.payment.create({
        data: {
          id_booking: newBooking.id_booking,
          metode: "midtrans",
          jumlah_bayar: total_harga,
          status: "pending",
          reference_id: `WAITING_${kode_booking}`,
          catatan: "Menunggu pembayaran diselesaikan oleh customer via Midtrans."
        }
      });

      return newBooking;
    });

    await invalidateCache("products:*");

    // 4. 💳 INTEGRASI MIDTRANS SNAP API
    const itemDetails = data.items.map((item) => ({
      id: item.id_product,
      price: item.product.harga_per_hari * diffDays,
      quantity: item.jumlah,
      name: item.product.nama,
    }));

    const parameterTransaction = {
      transaction_details: {
        order_id: kode_booking,
        gross_amount: total_harga,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: booking.nama_customer,
        email: booking.email,
        phone: booking.no_hp,
      },
      custom_expiry: {
        expiry_duration: 15,
        unit: "minute"
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/checkout/finish`,
      }
    };

    // Tembak ke API Midtrans untuk mendapatkan Snap Token
    const midtransTransaction = await snap.createTransaction(parameterTransaction);

    // Kirim email peringatan pending payment 15 menit
    booking.details = data.items.map(item => ({
      product: { nama: item.product.nama },
      jumlah: item.jumlah,
      harga_saat_booking: item.product.harga_per_hari * diffDays
    }));
    sendPendingPaymentEmail(booking);

    // 5. Kembalikan respons sukses ke frontend beserta snapToken-nya
    res.json({
      success: true,
      message: "Verifikasi OTP sukses & token pembayaran berhasil dibuat.",
      snapToken: midtransTransaction.token,
      totalHarga: total_harga,
      data: booking,
    });

  } catch (error) {
    console.error("💥 ERROR PADA VERIFY BOOKING CONTROLLER:", error);

    // Bedakan antara error validasi (race condition) dan error server
    const isValidationError = error.message.includes("stok produk") || error.message.includes("OTP sudah digunakan");
    const statusCode = isValidationError ? 409 : 500; // 409 = Conflict (standar HTTP untuk race condition)

    res.status(statusCode).json({ error: error.message });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const existing = await prisma.oTPVerification.findFirst({
      where: {
        session_id: req.session_id,
        is_verified: false,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (!existing) {
      return res.status(400).json({
        error: "Belum ada permintaan OTP",
      });
    }

    // ⏱ cooldown 60 detik
    const now = new Date();
    const diff = (now - existing.created_at) / 1000;

    if (diff < 60) {
      return res.status(429).json({
        error: `Tunggu ${Math.ceil(60 - diff)} detik untuk resend`,
      });
    }

    // 🔥 generate OTP baru
    const newKode = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.oTPVerification.update({
      where: { id_otp: existing.id_otp },
      data: {
        kode_otp: newKode,
        expired_at: new Date(Date.now() + 5 * 60 * 1000),
        created_at: new Date(),
      },
    });

    // ✅ ambil email dari DB
    const email = existing.kontak;

    // ✅ Kirim email token via nodemailer di background (non-blocking)
    sendOTPEmail(email, newKode).catch((err) => {
      console.error("💥 Gagal kirim ulang email OTP di background:", err.message);
    });

    res.json({
      message: "OTP berhasil dikirim ulang",
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const checkBookingStatus = async (req, res) => {
  try {
    const { id, email } = req.query;
    if (!id || !email) {
      return res.status(400).json({ message: "Kode booking dan email wajib diisi" });
    }

    const booking = await prisma.booking.findFirst({
      where: {
        kode_booking: id,
        email: email
      },
      include: {
        details: {
          include: {
            product: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan. Pastikan Kode Booking dan Email benar." });
    }

    // Format tanggal untuk frontend
    const tglMulai = new Date(booking.tanggal_mulai).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const tglSelesai = new Date(booking.tanggal_selesai).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const formattedData = {
      status: booking.status,
      total_harga: booking.total_harga,
      nama: booking.nama_customer,
      no_hp: booking.no_hp,
      tanggal_mulai: tglMulai,
      tanggal_selesai: tglSelesai,
      items: booking.details.map(d => ({
        nama_barang: d.product?.nama || "Produk dihapus",
        jumlah: d.jumlah,
        harga: d.harga_sewa
      }))
    };

    return res.json({ data: formattedData });
  } catch (error) {
    console.error("💥 ERROR PADA CHECK BOOKING CONTROLLER:", error);
    return res.status(500).json({ message: error.message });
  }
};