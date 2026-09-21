import express from "express";
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Import rute-rute lu
import cartRoutes from "./routes/cartRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import otpRoutes from "./routes/otpRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import productAdminRoutes from "./routes/productAdminRoutes.js";
import bookingAdminRoutes from "./routes/bookingAdminRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import posRoutes from "./routes/posRoutes.js";

// Import custom middleware
import { sessionMiddleware } from "./middlewares/sessionMiddleware.js";
import { apiLimiter, otpLimiter, checkoutLimiter } from "./middlewares/rateLimitMiddleware.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";

const app = express();

// 1. Setup CORS paling atas
app.use(cors({
    origin: 'http://localhost:4000', // Port frontend Next.js lu
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
}));

// 1.5 Setup Cookie Parser
app.use(cookieParser());

// 2. Pasang Session Tracker agar tracking guest aman
app.use(sessionMiddleware);

// 3. Parser JSON ditaruh TEPAT DI BAWAH session agar tidak merusak stream FormData/Multer
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Folder static asset
app.use("/uploads", express.static("uploads")); // Ini untuk foto produk (publik)

// 4.1 Folder Storage Privat (Hanya untuk Admin / Authenticated)
app.use("/storage", authMiddleware, express.static("storage")); 
// 4.5 Terapkan Global Rate Limiter untuk semua request API (biar scraping terbatasi)
app.use("/api/", apiLimiter);

// 5. Daftarkan semua Router Admin
app.use("/api/admin", adminRoutes);
app.use("/api/admin/products", productAdminRoutes);
app.use("/api/admin/bookings", bookingAdminRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/pos", posRoutes);

// 6. Daftarkan semua Router Customer/Guest
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/products", productRoutes);
app.use("/api/otp", otpLimiter, otpRoutes); // <-- Apply OTP Limiter
app.use("/api/booking", checkoutLimiter, bookingRoutes); // <-- Apply Checkout Limiter
app.use("/api/payment", paymentRoutes);

// 7. KUNCI: Export default harus di baris PALING BENTUT/AKHIR file!
export default app;