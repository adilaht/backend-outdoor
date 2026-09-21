import express from "express";
import * as otpController from "../controllers/otpController.js";

const router = express.Router();

router.post("/send", otpController.sendOTP);
router.post("/verify", otpController.verifyOTP);

export default router;