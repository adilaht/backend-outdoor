import prisma from "../config/prisma.js";
import db from "../config/db.js";
import slugify from "slugify";
import { deleteFile } from "../utils/deleteFile.js";
import { buildImageUrl } from "../utils/fileHelper.js";
import { getCache, setCache, invalidateCache } from "../utils/cacheService.js";


export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, tanggal_mulai, tanggal_selesai } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    // bikin cache key unik berdasarkan query
    const cacheKey = tanggal_mulai && tanggal_selesai
      ? `products:page=${page}:limit=${limit}:mulai=${tanggal_mulai}:selesai=${tanggal_selesai}`
      : `products:page=${page}:limit=${limit}`;

    // 1. cek cache dulu
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // 2. query DB
    const whereClause = req.admin ? {} : { is_active: true };
    let result;

    if (!tanggal_mulai || !tanggal_selesai) {
      // TANPA FILTER TANGGAL
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          skip,
          take,
          where: whereClause,
          orderBy: { id_product: "asc" },
          include: {
            images: true,
            category: {
              select: {
                nama: true
              }
            }
          },
        }),
        prisma.product.count({ where: whereClause }),
      ]);

      const mapped = products.map((p) => ({
        ...p,
        images: p.images.map((img) => ({
          ...img,
          url: buildImageUrl(req, img.url),
        })),
      }));

      result = {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
        data: mapped,
      };
    } else {
      // ADA FILTER TANGGAL
      const konflik = await prisma.bookingDetail.groupBy({
        by: ["id_product"],
        _sum: { jumlah: true },
        where: {
          booking: {
            OR: [
              {
                status: { in: ["pending_payment", "paid", "ongoing"] },
                AND: [
                  { tanggal_mulai: { lte: new Date(tanggal_selesai) } },
                  { tanggal_selesai: { gte: new Date(tanggal_mulai) } },
                ],
              },
              {
                status: "completed",
                tanggal_kembali: { gte: new Date(tanggal_mulai) },
                AND: [{ tanggal_mulai: { lte: new Date(tanggal_selesai) } }],
              },
            ],
          },
        },
      });

      const stokMap = Object.fromEntries(
        konflik.map((k) => [k.id_product, k._sum.jumlah || 0])
      );

      const conflictedProductIds = konflik.map((k) => k.id_product);

      let fullyBookedProductIds = [];
      if (conflictedProductIds.length > 0) {
        const productsStok = await prisma.product.findMany({
          where: { id_product: { in: conflictedProductIds } },
          select: { id_product: true, stok_total: true },
        });

        fullyBookedProductIds = productsStok
          .filter((p) => (stokMap[p.id_product] || 0) >= p.stok_total)
          .map((p) => p.id_product);
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          skip,
          take,
          where: {
            ...whereClause,
            id_product: { notIn: fullyBookedProductIds },
          },
          orderBy: { id_product: "asc" },
          include: {
            images: true,
            category: {
              select: {
                nama: true
              }
            }
          },
        }),
        prisma.product.count({
          where: {
            ...whereClause,
            id_product: { notIn: fullyBookedProductIds },
          },
        }),
      ]);

      const mapped = products.map((p) => ({
        ...p,
        stok_tersedia: p.stok_total - (stokMap[p.id_product] || 0),
        images: p.images.map((img) => ({
          ...img,
          url: buildImageUrl(req, img.url),
        })),
      }));

      result = {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
        data: mapped,
      };
    }

    // 3. simpan hasil ke cache (TTL 60 detik)
    await setCache(cacheKey, result, 60 * 60);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//single product
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;

    // 1. cek cache dulu
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // 2. query DB
    const product = await prisma.product.findUnique({
      where: { id_product: Number(id) },
      include: { images: true },
    });

    if (!product) {
      return res.status(404).json({ error: "Product tidak ditemukan" });
    }

    // Jika produk tidak aktif dan bukan admin, return 404
    if (!product.is_active && !req.admin) {
      return res.status(404).json({ error: "Product tidak ditemukan" });
    }

    const result = {
      ...product,
      images: product.images.map((img) => ({
        ...img,
        url: buildImageUrl(req, img.url),
      })),
    };

    // 3. simpan ke cache (TTL 30–60 detik)
    await setCache(cacheKey, result, 60);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


//Admin
// ✅ CREATE PRODUCT
export const createProduct = async (req, res) => {
  try {
    const { nama, deskripsi, harga_per_hari, stok_total, category_id } = req.body;
    const slug = slugify(nama, { lower: true });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Buat produk baru
      const newProduct = await tx.product.create({
        data: {
          nama,
          slug,
          deskripsi,
          harga_per_hari: Number(harga_per_hari),
          stok_total: Number(stok_total),
          category_id: category_id ? Number(category_id) : null,
        },
      });

      // 2. Catat stok awal
      if (Number(stok_total) > 0) {
        await tx.stockLog.create({
          data: {
            id_product: newProduct.id_product,
            perubahan: "IN",
            jumlah: Number(stok_total),
            keterangan: "Stok awal produk",
          },
        });
      }

      // 3. Upload images (sekali jalan)
      if (req.files && req.files.length > 0) {
        const images = req.files.map((file) => ({
          url: `/uploads/${file.filename}`,
          id_product: newProduct.id_product,
        }));
        await tx.productImage.createMany({ data: images });
      }

      // 4. Ambil ulang product lengkap dengan relasi
      return tx.product.findUnique({
        where: { id_product: newProduct.id_product },
        include: {
          images: { select: { id_image: true, url: true } },
          category: { select: { id_category: true, nama: true } },
        },
      });
    });

    // invalidate cache setelah data berubah
    await invalidateCache("products:*");

    res.json({
      message: "Product berhasil dibuat",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// ✅ UPDATE PRODUCT
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, deskripsi, harga_per_hari, stok_total, category_id, is_active } = req.body;
    const slug = slugify(nama, { lower: true });

    const result = await prisma.$transaction(async (tx) => {
      // Ambil produk lama untuk cek perubahan stok
      const oldProduct = await tx.product.findUnique({
        where: { id_product: Number(id) },
      });

      if (!oldProduct) {
        throw new Error("Product tidak ditemukan");
      }

      const diff = Number(stok_total) - oldProduct.stok_total;

      // Update produk
      await tx.product.update({
        where: { id_product: Number(id) },
        data: {
          nama,
          slug,
          deskripsi,
          harga_per_hari: Number(harga_per_hari),
          stok_total: Number(stok_total),
          category_id: category_id ? Number(category_id) : null,
          is_active: is_active !== undefined ? (is_active === true || is_active === "true") : undefined,
        },
      });

      // Catat log stok jika ada perubahan
      if (diff !== 0) {
        await tx.stockLog.create({
          data: {
            id_product: Number(id),
            perubahan: diff > 0 ? "IN" : "OUT",
            jumlah: Math.abs(diff),
            keterangan: `Penyesuaian stok manual oleh admin (sebelumnya ${oldProduct.stok_total})`,
          },
        });
      }

      // 🔥 kalau upload gambar baru → hapus lama + replace
      if (req.files && req.files.length > 0) {
        const oldImages = await tx.productImage.findMany({
          where: { id_product: Number(id) },
        });

        // hapus file di folder
        oldImages.forEach((img) => deleteFile(img.url));

        // hapus dari DB
        await tx.productImage.deleteMany({
          where: { id_product: Number(id) },
        });

        // simpan gambar baru
        const images = req.files.map((file) => ({
          url: `/uploads/${file.filename}`,
          id_product: Number(id),
        }));
        await tx.productImage.createMany({ data: images });
      }

      // Ambil ulang produk lengkap dengan relasi
      return tx.product.findUnique({
        where: { id_product: Number(id) },
        include: {
          images: { select: { id_image: true, url: true } },
          category: { select: { id_category: true, nama: true } },
        },
      });
    });

    // invalidate cache setelah data berubah
    await invalidateCache(`product:${id}`);
    await invalidateCache("products:*");

    res.json({
      message: "Product berhasil diupdate",
      data: result,
    });
  } catch (error) {
    if (error.message === "Product tidak ditemukan") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};


// ✅ DELETE PRODUCT (Soft Delete)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      // cek produk dulu
      const product = await tx.product.findUnique({
        where: { id_product: Number(id) },
      });

      if (!product) {
        throw new Error("Product tidak ditemukan");
      }

      // soft delete → set is_active = false
      await tx.product.update({
        where: { id_product: Number(id) },
        data: { is_active: false },
      });

      // ambil ulang produk untuk response
      return tx.product.findUnique({
        where: { id_product: Number(id) },
        include: {
          images: { select: { id_image: true, url: true } },
          category: { select: { id_category: true, nama: true } },
        },
      });
    });

    // invalidate cache setelah data berubah
    await invalidateCache(`product:${id}`);
    await invalidateCache("products:*");


    res.json({
      message: "Product berhasil dinonaktifkan (soft delete)",
      data: result,
    });
  } catch (error) {
    if (error.message === "Product tidak ditemukan") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};


// ADJUST PRODUCT STOCK
export const adjustProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipe, jumlah, keterangan } = req.body || {};

    if (tipe === undefined || jumlah === undefined) {
      return res.status(400).json({ error: "Request body harus berisi tipe dan jumlah" });
    }

    const productId = Number(id);
    const qty = Number(jumlah);
    const normalizedType = String(tipe || "").toUpperCase();

    if (!["IN", "OUT", "SET"].includes(normalizedType)) {
      return res.status(400).json({ error: "Tipe stok harus IN, OUT, atau SET" });
    }

    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: "Jumlah stok harus angka bulat minimal 0" });
    }

    const updatedProduct = await prisma.$transaction(async (tx) => {
      // Ambil produk lama di dalam transaction
      const product = await tx.product.findUnique({
        where: { id_product: productId },
      });

      if (!product) {
        throw new Error("Product tidak ditemukan");
      }

      // Hitung stok baru + tipe log
      let newStock;
      let logType;
      let logQty;

      if (normalizedType === "SET") {
        newStock = qty;
        const diff = newStock - product.stok_total;
        logType = diff >= 0 ? "IN" : "OUT";
        logQty = Math.abs(diff);
      } else {
        newStock = normalizedType === "IN"
          ? product.stok_total + qty
          : product.stok_total - qty;
        logType = normalizedType;
        logQty = qty;
      }

      if (newStock < 0) {
        throw new Error("Stok tidak boleh kurang dari 0");
      }

      // Update stok produk
      const updated = await tx.product.update({
        where: { id_product: productId },
        data: { stok_total: newStock },
        include: {
          images: { select: { id_image: true, url: true } },
          category: { select: { id_category: true, nama: true } },
        },
      });

      // Catat log stok jika ada perubahan
      if (logQty > 0) {
        await tx.stockLog.create({
          data: {
            id_product: productId,
            perubahan: logType,
            jumlah: logQty,
            keterangan: keterangan || `Penyesuaian stok manual (${normalizedType})`,
          },
        });
      }

      return updated;
    });

    // invalidate cache setelah data berubah
    await invalidateCache(`product:${id}`);
    await invalidateCache("products:*");
    await invalidateCache(`stockLogs:product=${id}:*`);


    res.json({
      message: "Stok produk berhasil diperbarui",
      data: updatedProduct,
    });
  } catch (error) {
    if (error.message === "Product tidak ditemukan" || error.message.includes("Stok tidak boleh")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};



// GET PRODUCT STOCK LOGS
export const getProductStockLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const cacheKey = `stockLogs:product=${id}:page=${page}:limit=${limit}`;

    // 1. cek cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // 2. query DB
    const [logs, total] = await Promise.all([
      prisma.stockLog.findMany({
        where: { id_product: Number(id) },
        orderBy: { created_at: "desc" },
        skip,
        take,
        select: {
          id_log: true,
          perubahan: true,
          jumlah: true,
          keterangan: true,
          created_at: true,
        },
      }),
      prisma.stockLog.count({ where: { id_product: Number(id) } }),
    ]);

    const result = {
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
      data: logs,
    };

    // 3. simpan ke cache (TTL 60 detik)
    await setCache(cacheKey, result, 60);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// GET POPULAR PRODUCTS FOR LANDING PAGE (HIGHLIGHT WITHOUT STOCK INFO)
export const getPopularProducts = async (req, res) => {
  try {
    const { limit = 4 } = req.query;
    const take = Number(limit);

    const cacheKey = `popularProducts:limit=${take}`;

    // 1. cek cache dulu
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ data: cached });
    }

    // 2. query DB
    const popularGroup = await prisma.bookingDetail.groupBy({
      by: ["id_product"],
      _sum: { jumlah: true },
      where: {
        booking: { status: { in: ["paid", "ongoing", "completed"] } },
        product: { is_active: true },
      },
      orderBy: { _sum: { jumlah: "desc" } },
      take,
    });

    const popularProductIds = popularGroup.map((item) => item.id_product);

    let products = [];
    if (popularProductIds.length > 0) {
      const fetchedProducts = await prisma.product.findMany({
        where: { id_product: { in: popularProductIds }, is_active: true },
        include: {
          images: { select: { id_image: true, url: true } },
          category: { select: { id_category: true, nama: true } },
        },
      });

      products = popularProductIds
        .map((id) => fetchedProducts.find((p) => p.id_product === id))
        .filter(Boolean);
    }

    if (products.length < take) {
      const excludeIds = products.map((p) => p.id_product);
      const remainingCount = take - products.length;

      const fallbackProducts = await prisma.product.findMany({
        where: { is_active: true, id_product: { notIn: excludeIds } },
        take: remainingCount,
        include: {
          images: { select: { id_image: true, url: true } },
          category: { select: { id_category: true, nama: true } },
        },
      });

      products = [...products, ...fallbackProducts];
    }

    const result = products.map((p) => ({
      id_product: p.id_product,
      nama: p.nama,
      slug: p.slug,
      deskripsi: p.deskripsi,
      harga_per_hari: p.harga_per_hari,
      category: p.category
        ? { id_category: p.category.id_category, nama: p.category.nama }
        : null,
      images: p.images.map((img) => ({
        id_image: img.id_image,
        url: buildImageUrl(req, img.url),
      })),
    }));

    // 3. simpan ke cache (TTL 300 detik = 5 menit)
    await setCache(cacheKey, result, 300);

    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// ENDPOINT KHUSUS CHATBOT
// ==========================================
export const getChatbotProducts = async (req, res) => {
  try {
    const { search, q, tanggal_mulai, tanggal_selesai } = req.query;
    const queryText = search || q || "";

    const whereClause = {
      is_active: true,
      ...(queryText && {
        nama: { contains: queryText }
      })
    };

    let stokMap = {};

    // Jika ada tanggal, kita hitung stok yang sudah di-booking
    if (tanggal_mulai && tanggal_selesai) {
      const konflik = await prisma.bookingDetail.groupBy({
        by: ["id_product"],
        _sum: { jumlah: true },
        where: {
          booking: {
            OR: [
              {
                status: { in: ["pending_payment", "paid", "ongoing"] },
                AND: [
                  { tanggal_mulai: { lte: new Date(tanggal_selesai) } },
                  { tanggal_selesai: { gte: new Date(tanggal_mulai) } },
                ],
              },
              {
                status: "completed",
                tanggal_kembali: { gte: new Date(tanggal_mulai) },
                AND: [{ tanggal_mulai: { lte: new Date(tanggal_selesai) } }],
              },
            ],
          },
        },
      });

      stokMap = Object.fromEntries(
        konflik.map((k) => [k.id_product, k._sum.jumlah || 0])
      );

      const conflictedProductIds = konflik.map((k) => k.id_product);

      // Filter ID produk yang stok_total-nya sudah habis dipesan di tanggal tersebut
      if (conflictedProductIds.length > 0) {
        const productsStok = await prisma.product.findMany({
          where: { id_product: { in: conflictedProductIds } },
          select: { id_product: true, stok_total: true },
        });

        const fullyBookedProductIds = productsStok
          .filter((p) => (stokMap[p.id_product] || 0) >= p.stok_total)
          .map((p) => p.id_product);

        if (fullyBookedProductIds.length > 0) {
          whereClause.id_product = { notIn: fullyBookedProductIds };
        }
      }
    }

    // Hanya ambil 10 item yang masih memiliki stok untuk direkomendasikan chatbot
    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id_product: true,
        nama: true,
        harga_per_hari: true,
        stok_total: true
      },
      take: 10
    });

    // Sesuaikan stok_total dengan sisa stok aktual di tanggal tersebut
    const finalProducts = products.map(p => ({
      id_product: p.id_product,
      nama: p.nama,
      harga_per_hari: p.harga_per_hari,
      stok_total: p.stok_total, // Kapasitas asli toko
      stok_tersedia: p.stok_total - (stokMap[p.id_product] || 0) // Sisa ketersediaan di rentang tanggal
    }));

    res.json({ data: finalProducts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
