import * as cartModel from "../models/cartModel.js";
import * as bookingModel from "../models/bookingModel.js";
import prisma from "../config/prisma.js";
import { sendOTPEmail } from "../utils/sendOtp.js";
import { sendPendingPaymentEmail } from "../services/emailService.js";
import fs from "fs";
import path from "path";
import midtransClient from "midtrans-client";
import crypto from "crypto";

// Inisialisasi Midtrans Snap Client
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

export const checkoutBooking = async (req, res) => {
  console.log("ISI BODY:", req.body); // Cek apakah teks (nama, dll) masuk
  console.log("ISI FILE:", req.file); // Cek apakah file masuk
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

    const cart = await prisma.cart.findUnique({
      where: { session_id: req.session_id },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: "Keranjang belanja Anda masih kosong" });
    }

    // 🔥 VALIDASI STOK
    for (const item of cart.items) {
      const konflik = await prisma.bookingDetail.findMany({
        where: {
          id_product: item.id_product,
          booking: {
            OR: [
              {
                status: { in: ["pending_payment", "paid", "ongoing"] },
                AND: [
                  { tanggal_mulai: { lte: dateSelesai } },
                  { tanggal_selesai: { gte: dateMulai } },
                ],
              },
              {
                status: "completed",
                tanggal_kembali: { gte: dateMulai },
                AND: [
                  { tanggal_mulai: { lte: dateSelesai } },
                ],
              },
            ],
          },
        },
      });

      const totalDipakai = konflik.reduce((sum, d) => sum + d.jumlah, 0);

      if (totalDipakai + item.jumlah > item.product.stok_total) {
        return res.status(400).json({
          error: `Stok produk [${item.product.nama}] tidak mencukupi untuk rentang tanggal tersebut.`,
        });
      }
    }

    // Hapus rekam jejak kode OTP lama yang hangus / belum terverifikasi
    await prisma.oTPVerification.deleteMany({
      where: {
        kontak: email,
        is_verified: false,
      },
    });

    // ✅ Generate OTP 6 Digit String
    //  KODE BARU (Paling Aman menggunakan Kriptografi):
    // Mengambil 3 byte data acak murni dari kernel sistem, lalu dikonversi ke angka integer
    // ✅ GANTI DENGAN KODE INI (Antipeluru di semua versi Node.js):
    const randomBuffer = crypto.randomBytes(4); // Ambil 4 byte (32-bit)
    const randomNumber = randomBuffer.readUInt32BE(0); // Menggunakan UInt32BE (pasti ada di semua versi)

    // Modulo 900.000 lalu ditambah 100.000 agar hasilnya selalu tepat 6 digit (100000 - 999999)
    const kode_otp = (100000 + (randomNumber % 900000)).toString();

    // 🌟 TAMBAHAN: Amankan konversi objek items (DateTime fields sanitization untuk tipe JSON Prisma)
    const sanitizedItems = JSON.parse(JSON.stringify(cart.items));

    // ✅ Simpan OTP + temp data ke DB
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

    // ✅ Kirim email token via nodemailer
    await sendOTPEmail(email, kode_otp);

    // Kirim respons balik ke Next.js
    res.json({
      success: true,
      message: "OTP berhasil dikirim ke email",
    });

  } catch (error) {
    console.error("💥 ERROR PADA CONTROLLER CHECKOUT:", error);
    res.status(500).json({ error: error.message });
  }
};


export const verifyBooking = async (req, res) => {
  try {
    const { kode_otp } = req.body;

    const otp = await prisma.oTPVerification.findFirst({
      where: {
        session_id: req.session_id,
        kode_otp,
        is_verified: false,
        expired_at: {
          gt: new Date(), // Menjaga perbandingan UTC murni database vs server
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

    // 🌟 KODE BARU (Kombinasi Tanggal + Kriptografi Acak):
    const tgl = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Hasilnya: "20260702"
    const hashAcak = crypto.randomBytes(2).toString("hex").toUpperCase(); // Hasilnya 4 karakter acak, misal: "F3B8"

    const kode_booking = `BOOK-${tgl}-${hashAcak}`;
    // Output final super estetik: BOOK-20260702-F3B8

    // 2. 📂 PROSES PEMINDAHAN FILE KTP KE FOLDER KODE_BOOKING
    const oldPath = data.foto_identitas; // Letaknya masih di: storage/private/bookings/session_id/identitas_xxx.jpg
    const newFolder = `./storage/private/bookings/${kode_booking}`;
    const filename = path.basename(oldPath);
    const finalDbPath = `storage/private/bookings/${kode_booking}/${filename}`;

    if (fs.existsSync(`./${oldPath}`)) {
      // Buat folder kode_booking jika belum ada
      if (!fs.existsSync(newFolder)) {
        fs.mkdirSync(newFolder, { recursive: true });
      }
      // Pindahkan file fisiknya
      fs.renameSync(`./${oldPath}`, path.join(newFolder, filename));

      // Hapus folder session_id lama agar server bersih
      const oldFolder = `./storage/private/bookings/${req.session_id}`;
      if (fs.existsSync(oldFolder)) {
        fs.rmdirSync(oldFolder, { recursive: true });
      }
    }

    // 3. Simpan booking ke database lewat Prisma Transaction
    const booking = await prisma.$transaction(async (tx) => {
      const newBooking = await tx.booking.create({
        data: {
          kode_booking,
          nama_customer: data.nama_customer,
          email: data.email,
          no_hp: data.no_hp,
          alamat: data.alamat || null,
          foto_identitas: finalDbPath, // 🌟 Path database sudah diperbarui ke folder final
          tanggal_mulai: start,
          tanggal_selesai: end,
          total_harga,
          status: "pending_payment", // Set status awal menunggu pembayaran
          details: {
            create: detailsData,
          },
        },
      });

      // Update Stock Log (Hold sementara karena status pending_payment)
      for (const item of data.items) {
        await tx.stockLog.create({
          data: {
            id_product: item.id_product,
            perubahan: "HOLD",
            jumlah: item.jumlah,
            keterangan: `Booking ${kode_booking} (Menunggu Pembayaran)`,
          },
        });
      }


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

      // Update status OTP menjadi terverifikasi
      await tx.oTPVerification.update({
        where: { id_otp: otp.id_otp },
        data: { is_verified: true },
      });

      return newBooking;
    });

    // 4. 💳 INTEGRASI MIDTRANS SNAP API
    const itemDetails = data.items.map((item) => ({
      id: item.id_product,
      price: item.product.harga_per_hari * diffDays, // Harga per unit total durasi hari
      quantity: item.jumlah,
      name: item.product.nama,
    }));

    const parameterTransaction = {
      transaction_details: {
        order_id: kode_booking, // Wajib unik
        gross_amount: total_harga,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: booking.nama_customer,
        email: booking.email,
        phone: booking.no_hp,
      },
      // Set expired otomatis dari sisi Midtrans (15 Menit)
      custom_expiry: {
        expiry_duration: 15,
        unit: "minute"
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/checkout/finish`, // Link redirect Next.js lu nanti
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
      snapToken: midtransTransaction.token, // 🌟 Token ini yang ditunggu Step 2 Frontend!
      totalHarga: total_harga,
      data: booking,
    });

  } catch (error) {
    console.error("💥 ERROR PADA VERIFY BOOKING CONTROLLER:", error);
    res.status(500).json({ error: error.message });
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

    await sendOTPEmail(email, newKode);

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