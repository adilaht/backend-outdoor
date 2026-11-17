import rateLimit from 'express-rate-limit';

// 1. Global API Limiter
// Mencegah scraping massal dan infinite loop di frontend
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: process.env.NODE_ENV === "production" ? 1000 : 5000, // 1000 di production, 5000 di development agar leluasa saat testing
  message: {
    success: false,
    message: "Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit."
  },
  standardHeaders: true, // Return rate limit info di `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// 2. Strict OTP Limiter
// Sangat ketat untuk mencegah Brute-Force dan SMS/Email Bombing
// Membatasi seluruh request pembuatan/pengiriman OTP (checkout awal, resend, ganti email) maksimal 5x per 15 menit
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Limit akumulatif setiap IP maksimal 5 request OTP per 15 menit
  message: {
    success: false,
    error: "Terlalu banyak permintaan OTP dari perangkat ini. Silakan tunggu 15 menit untuk mencoba lagi.",
    message: "Terlalu banyak permintaan OTP dari perangkat ini. Silakan tunggu 15 menit untuk mencoba lagi."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. Checkout / Booking Limiter
// Pembatas umum untuk aktivitas booking (verifikasi, status check, cancel) agar tidak flood API
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 30, // 30 request umum booking per 15 menit per IP
  message: {
    success: false,
    error: "Terlalu banyak aktivitas pemesanan dari IP ini, silakan coba lagi setelah beberapa saat.",
    message: "Terlalu banyak aktivitas pemesanan dari IP ini, silakan coba lagi setelah beberapa saat."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. Admin Login Limiter
// Melindungi dari serangan Brute-Force pada login form
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Maksimal 5x salah/coba login
  message: {
    success: false,
    message: "Terlalu banyak percobaan login, silakan tunggu 15 menit."
  },
  standardHeaders: true,
  legacyHeaders: false,
});
