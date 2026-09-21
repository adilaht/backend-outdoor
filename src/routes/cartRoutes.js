import express from "express";
import {
  setCartDateController,
  addToCartController,
  getCartController,
  updateCartItemController,
  deleteCartItemController,
  updateCartDateController,
  clearCartController,
} from "../controllers/cartController.js";

const router = express.Router();

router.get("/", getCartController);

router.post("/set-date", setCartDateController);
router.put("/update-date", updateCartDateController);

router.post("/", addToCartController);

router.put("/item/:id_item", updateCartItemController);
router.delete("/item/:id_item", deleteCartItemController);

router.delete("/clear", clearCartController);

export default router;