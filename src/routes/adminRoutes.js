import express from "express";
import { adminLogin, adminLogout, getAdminProfile } from "../controllers/authController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { loginLimiter } from "../middlewares/rateLimitMiddleware.js";

const router = express.Router();

router.post("/login", loginLimiter, adminLogin);
router.post("/logout", adminLogout);
router.get("/me", authMiddleware, getAdminProfile);

export default router;