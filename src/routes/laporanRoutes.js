import express from "express";
import { getLaporanData } from "../controllers/laporanController.js";

const router = express.Router();

router.get("/", getLaporanData);

export default router;
