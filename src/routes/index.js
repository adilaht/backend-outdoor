import express from "express";
import productRoutes from "./product.routes.js";
import bookingRoutes from "./booking.routes.js";
import authRoutes from "./auth.routes.js";

const router = express.Router();

router.use("/products", productRoutes);
router.use("/booking", bookingRoutes);
router.use("/auth", authRoutes);

export default router;