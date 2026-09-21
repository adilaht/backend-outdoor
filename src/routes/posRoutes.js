import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  addPosCartItem,
  clearPosCart,
  createOfflineSale,
  deletePosCartItem,
  getPosCart,
  getPosProducts,
  setPosCartDate,
  updatePosCartItem,
} from "../controllers/posController.js";

const router = express.Router();

router.get("/products", authMiddleware, getPosProducts);

router.get("/cart", authMiddleware, getPosCart);
router.post("/cart/date", authMiddleware, setPosCartDate);
router.post("/cart/items", authMiddleware, addPosCartItem);
router.put("/cart/items/:id_item", authMiddleware, updatePosCartItem);
router.delete("/cart/items/:id_item", authMiddleware, deletePosCartItem);
router.delete("/cart", authMiddleware, clearPosCart);

router.post("/checkout", authMiddleware, createOfflineSale);

export default router;
