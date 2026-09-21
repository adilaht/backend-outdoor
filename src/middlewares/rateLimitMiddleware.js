import rateLimit from 'express-rate-limit';

// 1. Global API Limiter
// Mencegah scraping massal dan infinite loop di frontend
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // Limit setiap IP maksimal 100 request per windowMs
  message: {
    success: false,
    message: "Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit."
  },
  standardHeaders: true, // Return rate limit info di `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// 2. Strict OTP Limiter
// Sangat ketat untuk mencegah Brute-Force dan SMS/Email Bombing
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Limit setiap IP maksimal 5 request OTP per windowMs
  message: {
    success: false,
    message: "Terlalu banyak permintaan OTP dari IP ini, silakan tunggu 15 menit untuk mencoba lagi."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. Checkout / Booking Limiter
// Mencegah spam fake booking meskipun belum menahan stok, tetap mengurangi beban validasi OTP yang sia-sia
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10, // Limit setiap IP maksimal 10 request checkout/booking per windowMs
  message: {
    success: false,
    message: "Terlalu banyak percobaan pemesanan dari IP ini, silakan coba lagi setelah 15 menit."
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
