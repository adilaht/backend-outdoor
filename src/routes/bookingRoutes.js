import express from "express";
import * as bookingController from "../controllers/bookingController.js";
import { uploadIdentitas } from "../middlewares/uploadMiddleware.js";
import { otpLimiter } from "../middlewares/rateLimitMiddleware.js";
import multer from "multer";

const router = express.Router();

// 🌟 Terapkan otpLimiter (maks 5 request OTP / 15 menit per IP)
router.post('/checkout', otpLimiter, (req, res, next) => {
    const t_entry = Date.now();
    const contentLength = req.headers['content-length'] ? `${Math.round(req.headers['content-length'] / 1024)} KB` : 'Unknown';
    console.log(`\n📥 [CHECKOUT 1/5 - HTTP MASUK] IP: ${req.ip} | Session: ${req.headers['x-session-id'] || 'None'} | Size: ${contentLength}`);

    uploadIdentitas.single('foto_identitas')(req, res, function (err) {
        req.multerDuration = Date.now() - t_entry;
        req.t_entry = t_entry;

        if (err instanceof multer.MulterError) {
            console.error(`💥 [CHECKOUT ERROR MULTER] (${req.multerDuration}ms):`, err);
            return res.status(400).json({ error: `Gagal upload berkas: ${err.message}` });
        } else if (err) {
            console.error(`💥 [CHECKOUT ERROR FILTER] (${req.multerDuration}ms):`, err);
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            console.warn(`🚨 [CHECKOUT WARNING] Multer lolos tapi req.file kosong (${req.multerDuration}ms)!`);
        } else {
            console.log(`📦 [CHECKOUT 2/5 - MULTER SELESAI] Durasi: ${req.multerDuration}ms | File: ${req.file.filename} (${Math.round(req.file.size / 1024)} KB)`);
        }

        next();
    });
}, bookingController.checkoutBooking);

// Verifikasi OTP (tidak dibatasi otpLimiter agar input user tidak terhalang)
router.post("/verify", bookingController.verifyBooking);

// Kirim Ulang OTP & Ubah Email (dibatasi otpLimiter maks 5x per 15 menit bersama dengan checkout)
router.post("/resend-otp", otpLimiter, bookingController.resendOTP);
router.post("/change-email", otpLimiter, bookingController.changeEmailOTP);

// Pembatalan & Pengecekan Status
router.post("/cancel", bookingController.cancelBookingByUser);
router.get("/check", bookingController.checkBookingStatus);

export default router;