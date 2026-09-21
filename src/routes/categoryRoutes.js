import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";

const router = express.Router();

// Public routes
router.get("/", getCategories);
router.get("/:id", getCategory);

// Protected routes (Admin-only)
router.post("/", authMiddleware, createCategory);
router.put("/:id", authMiddleware, updateCategory);
router.delete("/:id", authMiddleware, deleteCategory);

export default router;
