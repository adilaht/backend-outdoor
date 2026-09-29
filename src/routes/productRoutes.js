import express from "express";
import * as productController from "../controllers/productController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", productController.getProducts);
router.get("/popular", productController.getPopularProducts);
router.get("/chatbot/search", productController.getChatbotProducts);
router.get("/:id", productController.getProduct);

export default router;