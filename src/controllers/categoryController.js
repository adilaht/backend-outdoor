import prisma from "../config/prisma.js";
import slugify from "slugify";
import { getCache, setCache, invalidateCache } from "../utils/cacheService.js";
import { buildImageUrl } from "../utils/fileHelper.js";

// GET ALL CATEGORIES

export const getCategories = async (req, res) => {
  try {
    const cacheKey = "categories:list";

    // 1. cek cache dulu
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ data: cached });
    }

    // 2. query DB
    const categories = await prisma.category.findMany({
      orderBy: { id_category: "asc" },
      include: {
        _count: {
          select: {
            products: {
              where: { is_active: true },
            },
          },
        },
      },
    });

    // 3. simpan hasil ke cache (TTL 600 detik = 10 menit)
    await setCache(cacheKey, categories, 600);

    res.json({ data: categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET SINGLE CATEGORY
export const getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const cacheKey = `category:${id}:page=${page}:limit=${limit}`;

    // 1. cek cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // 2. query kategori + produk dengan pagination
    const category = await prisma.category.findUnique({
      where: { id_category: Number(id) },
      include: {
        products: {
          where: { is_active: true },
          skip,
          take,
          include: { images: true },
          orderBy: { id_product: "asc" },
        },
        _count: {
          select: {
            products: { where: { is_active: true } },
          },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }

    // 3. map hasil produk
    const mappedProducts = category.products.map((p) => ({
      ...p,
      category: {
        id_category: category.id_category,
        nama: category.nama,
      },
      images: p.images.map((img) => ({
        ...img,
        url: buildImageUrl(req, img.url),
      })),
    }));

    const result = {
      id_category: category.id_category,
      nama: category.nama,
      slug: category.slug,
      page: Number(page),
      limit: take,
      total: category._count.products,
      totalPages: Math.ceil(category._count.products / take),
      products: mappedProducts,
    };

    // 4. simpan cache TTL 60 detik
    await setCache(cacheKey, result, 60);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// CREATE CATEGORY
export const createCategory = async (req, res) => {
  try {
    const { nama } = req.body;

    if (!nama) {
      return res.status(400).json({ error: "Nama kategori harus diisi" });
    }

    const slug = slugify(nama, { lower: true });

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({ error: "Kategori dengan slug ini sudah ada" });
    }

    const category = await prisma.category.create({
      data: {
        nama,
        slug
      }
    });

    // invalidate cache setelah data berubah
    await invalidateCache("categories:*");

    res.status(201).json({
      message: "Kategori berhasil dibuat",
      data: category
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE CATEGORY
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama } = req.body;

    if (!nama) {
      return res.status(400).json({ error: "Nama kategori harus diisi" });
    }

    const slug = slugify(nama, { lower: true });

    const existing = await prisma.category.findFirst({
      where: {
        slug,
        id_category: { not: Number(id) }
      }
    });

    if (existing) {
      return res.status(400).json({ error: "Nama kategori/slug sudah digunakan" });
    }

    const category = await prisma.category.update({
      where: { id_category: Number(id) },
      data: {
        nama,
        slug
      }
    });

    // invalidate cache untuk kategori ini + list kategori
    await invalidateCache(`category:${id}`);
    await invalidateCache("categories:*");

    res.json({
      message: "Kategori berhasil diperbarui",
      data: category
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE CATEGORY
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Cek apakah ada produk yang terhubung ke kategori ini
    const productCount = await prisma.product.count({
      where: { category_id: Number(id) }
    });

    if (productCount > 0) {
      return res.status(400).json({
        error: "Kategori tidak bisa dihapus karena masih memiliki produk terhubung"
      });
    }

    await prisma.category.delete({
      where: { id_category: Number(id) }
    });

    // invalidate cache untuk kategori ini + list kategori
    await invalidateCache(`category:${id}`);
    await invalidateCache("categories:*");

    res.json({
      message: "Kategori berhasil dihapus"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
