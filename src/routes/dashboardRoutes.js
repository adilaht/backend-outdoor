import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { getDashboardStats } from "../controllers/dashboardController.js";

const router = express.Router();

// 🔐 Semua endpoint khusus admin
router.get("/stats", authMiddleware, getDashboardStats);

export default router;
