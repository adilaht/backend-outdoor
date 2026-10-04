import {
  getOrCreateCart,
  setCartDates,
  addToCart,
  getCartDetail,
  updateCartItem,
  deleteCartItem,
  clearCart,
  calculateCartTotal,
} from "../models/cartModel.js";
import { checkStock } from "../services/stockService.js";
import prisma from "../config/prisma.js";
import { getCache, setCache, invalidateCache } from "../utils/cacheService.js";

// ✅ 1. SET TANGGAL CART
export const setCartDateController = async (req, res) => {
  try {
    const { tanggal_mulai, tanggal_selesai } = req.body;

    if (!tanggal_mulai || !tanggal_selesai) {
      return res.status(400).json({ error: "Tanggal harus diisi" });
    }

    const cart = await getOrCreateCart(req.session_id);

    await setCartDates(
      req.session_id,
      tanggal_mulai,
      tanggal_selesai
    );

    res.json({
      message: "Tanggal cart berhasil diset",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ 2. ADD TO CART + VALIDASI STOK
export const addToCartController = async (req, res) => {
  try {
    const { id_product, jumlah } = req.body;

    const cart = await getOrCreateCart(req.session_id);

    if (!cart.tanggal_mulai || !cart.tanggal_selesai) {
      return res.status(400).json({
        error: "Set tanggal dulu sebelum tambah barang",
      });
    }

    // 🔥 VALIDASI STOK
    const { available } = await checkStock({
      id_product,
      jumlah,
      tanggal_mulai: cart.tanggal_mulai,
      tanggal_selesai: cart.tanggal_selesai,
    });

    if (!available) {
      return res.status(400).json({
        error: "Stok tidak mencukupi untuk tanggal tersebut",
      });
    }

    await addToCart(req.session_id, id_product, jumlah);

    await invalidateCache(`cart:${req.session_id}`);

    res.json({
      message: "Berhasil ditambahkan ke cart",

    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ 3. GET CART
export const getCartController = async (req, res) => {
  try {
    const sessionId = req.session_id;
    const cacheKey = `cart:${sessionId}`;

    // 1. cek cache
    const cached = await getCache(cacheKey);
    if (cached) {
      // 🌟 PERBAIKAN: Karena data di dalam 'cached' sudah berupa objek matang, 
      // langsung return objeknya murni tanpa dibungkus { data: cached } lagi!
      return res.json(cached);
    }

    // 2. query DB / service
    const cart = await getCartDetail(sessionId);

    if (!cart) {
      return res.json({
        data: { id_cart: 0, session_id: sessionId, items: [], tanggal_mulai: "", tanggal_selesai: "" },
        message: "Cart kosong"
      });
    }

    const result = {
      data: cart,
    };

    // 3. simpan ke cache TTL 30 detik
    await setCache(cacheKey, result, 30);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ 4. UPDATE JUMLAH ITEM
export const updateCartItemController = async (req, res) => {
  try {
    const { id_item } = req.params;
    const { jumlah } = req.body;

    const item = await prisma.cartItem.findUnique({
      where: { id_item: Number(id_item) },
      include: {
        cart: true,
      },
    });

    if (!item) {
      return res.status(404).json({ error: "Item tidak ditemukan" });
    }

    if (item.cart.session_id !== req.session_id) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    if (jumlah > 0) {
      // 🔥 validasi stok lagi
      const { available } = await checkStock({
        id_product: item.id_product,
        jumlah,
        tanggal_mulai: item.cart.tanggal_mulai,
        tanggal_selesai: item.cart.tanggal_selesai,
      });

      if (!available) {
        return res.status(400).json({
          error: "Stok tidak mencukupi",
        });
      }
    }

    await updateCartItem(Number(id_item), jumlah);
    await invalidateCache(`cart:${req.session_id}`);

    res.json({
      message: "Cart berhasil diupdate",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ 5. DELETE ITEM
export const deleteCartItemController = async (req, res) => {
  try {
    const { id_item } = req.params;

    const item = await prisma.cartItem.findUnique({
      where: { id_item: Number(id_item) },
      include: { cart: true },
    });

    if (!item) {
      return res.status(404).json({ error: "Item tidak ditemukan" });
    }

    if (item.cart.session_id !== req.session_id) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    await deleteCartItem(Number(id_item));

    const updatedCart = await getCartDetail(req.session_id);
    await invalidateCache(`cart:${req.session_id}`);

    res.json({
      message: "Item dihapus",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ 6. UPDATE TANGGAL CART (🔥 paling penting)
export const updateCartDateController = async (req, res) => {
  try {
    const { tanggal_mulai, tanggal_selesai } = req.body;

    // 1. Pastikan cart ada (bikin kalau belum ada)
    let cart = await getOrCreateCart(req.session_id);

    // 2. Tetap jalankan fungsi bawaan lu untuk memastikan sinkronisasi state tanggal
    await setCartDates(
      req.session_id,
      tanggal_mulai,
      tanggal_selesai
    );

    // 🔥 3. Cek ulang semua item
    for (const item of cart.items) {
      const { available } = await checkStock({
        id_product: item.id_product,
        jumlah: item.jumlah,
        tanggal_mulai,
        tanggal_selesai,
      });

      if (!available) {
        await deleteCartItem(item.id_item);
      }
    }

    // 4. Bersihkan cache lama biar ga nyangkut
    await invalidateCache(`cart:${req.session_id}`);

    // 5. Ambil kondisi data cart paling mutakhir untuk dilempar ke Next.js
    const updatedCart = await getCartDetail(req.session_id);

    res.json({
      message: "Tanggal berhasil diupdate",
      data: updatedCart,
    });
  } catch (error) {
    console.error("💥 GAGAL UPDATE TANGGAL DETAIL PRODUK:", error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ 7. CLEAR CART
export const clearCartController = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.session_id);

    await clearCart(cart.id_cart);


    res.json({
      message: "Cart dikosongkan",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};