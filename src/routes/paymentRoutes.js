import express from "express";
import * as paymentController from "../controllers/paymentController.js";

const router = express.Router();

// Route untuk menerima notifikasi otomatis dari Midtrans (Webhook)
router.post("/webhook", paymentController.midtransWebhook);

export default router;