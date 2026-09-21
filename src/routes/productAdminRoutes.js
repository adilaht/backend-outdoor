import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  getProduct,
  adjustProductStock,
  getProductStockLogs,
} from "../controllers/productController.js";
import { upload } from "../utils/upload.js";

const router = express.Router();

const parseStockBody = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return upload.none()(req, res, next);
  }
  next();
};

router.get("/", authMiddleware, getProducts);
router.post("/", authMiddleware, upload.array("images", 5), createProduct);
router.patch("/:id/stock", authMiddleware, parseStockBody, adjustProductStock);
router.get("/:id/stock-logs", authMiddleware, getProductStockLogs);
router.get("/:id", authMiddleware, getProduct);
router.put("/:id", authMiddleware, upload.array("images", 5), updateProduct);
router.delete("/:id", authMiddleware, deleteProduct);

export default router;
