import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  getBookings,
  getBooking,
  updateBookingStatus,
} from "../controllers/bookingAdminController.js";

const router = express.Router();

// 🔐 Semua endpoint khusus admin
router.get("/", authMiddleware, getBookings);
router.get("/:id", authMiddleware, getBooking);
router.put("/:id/status", authMiddleware, updateBookingStatus);

export default router;
