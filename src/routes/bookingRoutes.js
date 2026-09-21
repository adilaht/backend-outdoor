import express from "express";
import * as bookingController from "../controllers/bookingController.js";
import { uploadIdentitas } from "../middlewares/uploadMiddleware.js";
import multer from "multer";

const router = express.Router();

// 🌟 UPDATE: Masukkan middleware upload berkas di sini
router.post('/checkout', (req, res, next) => {
    // 🌟 Jalankan Multer secara manual untuk mengisolasi aliran biner file
    uploadIdentitas.single('foto_identitas')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error("💥 KESALAHAN INTERNAL MULTER:", err);
            return res.status(400).json({ error: `Gagal upload berkas: ${err.message}` });
        } else if (err) {
            console.error("💥 KESALAHAN FILTER BERKAS:", err);
            return res.status(400).json({ error: err.message });
        }

        // Jika aman, validasi apakah file beneran nempel di req setelah melewati Multer
        if (!req.file) {
            console.error("🚨 WARNING: Multer lolos tanpa error, tapi req.file tetap KOSONG!");
        }

        next();
    });
}, bookingController.checkoutBooking);

router.post("/verify", bookingController.verifyBooking);
router.post("/resend-otp", bookingController.resendOTP);
router.get("/check", bookingController.checkBookingStatus);

export default router;