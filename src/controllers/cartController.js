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
import { checkStock, checkStockBatch } from "../services/stockService.js";
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

    // Cari tahu apakah barang ini udah ada di keranjang sebelumnya
    const existingItem = cart.items?.find((item) => item.id_product === id_product);
    const existingJumlah = existingItem ? existingItem.jumlah : 0;
    const totalJumlahDiminta = existingJumlah + jumlah;

    // 🔥 VALIDASI STOK (cek dengan totalJumlahDiminta)
    const { available } = await checkStock({
      id_product,
      jumlah: totalJumlahDiminta,
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

// ✅ 3. GET CART (dengan pengecekan stok real-time per item)
export const getCartController = async (req, res) => {
  try {
    const sessionId = req.session_id;
    const cacheKey = `cart:${sessionId}`;

    // 1. Cek cache Redis terlebih dahulu
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // 2. Query DB
    const cart = await getCartDetail(sessionId);

    if (!cart) {
      return res.json({
        data: { id_cart: 0, session_id: sessionId, items: [], tanggal_mulai: "", tanggal_selesai: "" },
        message: "Cart kosong"
      });
    }

    // 3. 🛡️ Enrichment: Cek ketersediaan stok real-time untuk setiap item
    //    Jika cart punya tanggal sewa, validasi stok berdasarkan periode tersebut.
    //    Hasilnya ditempelkan ke setiap item sebagai is_available + stok_tersedia.
    let enrichedItems = cart.items;

    if (cart.tanggal_mulai && cart.tanggal_selesai && cart.items.length > 0) {
      try {
        const { results } = await checkStockBatch({
          items: cart.items,
          tanggal_mulai: cart.tanggal_mulai,
          tanggal_selesai: cart.tanggal_selesai,
        });
        enrichedItems = results;
      } catch (err) {
        console.error("Gagal batch cek stok keranjang:", err);
      }
    }

    const result = {
      data: {
        ...cart,
        items: enrichedItems,
      },
    };

    // 4. Simpan ke cache Redis dengan TTL 15 detik (lebih pendek agar stok lebih fresh)
    await setCache(cacheKey, result, 15);

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

    // 🔥 3. Cek ulang semua item secara batch (Bebas N+1)
    if (cart.items && cart.items.length > 0) {
      const { results } = await checkStockBatch({
        items: cart.items,
        tanggal_mulai,
        tanggal_selesai,
      });

      const unavailableItemIds = results
        .filter((r) => !r.is_available)
        .map((r) => r.id_item);

      if (unavailableItemIds.length > 0) {
        await prisma.cartItem.deleteMany({
          where: { id_item: { in: unavailableItemIds } },
        });
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