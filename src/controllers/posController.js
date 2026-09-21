import prisma from "../config/prisma.js";
import * as cartModel from "../models/cartModel.js";
import { checkStock } from "../services/stockService.js";
import { buildImageUrl } from "../utils/fileHelper.js";
import { invalidateCache } from "../utils/cacheService.js";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const getPosSessionId = (req) => `pos-${req.admin.id_admin}`;

const buildCode = (prefix) => {
  const tgl = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: 20260916
  const hashAcak = Math.random().toString(36).substring(2, 6).toUpperCase(); // Format: 221D
  return `${prefix}-${tgl}-${hashAcak}`;
};

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

const getRentalDays = (start, end) => {
  return Math.ceil((end - start) / DAY_IN_MS) || 1;
};

const validateDateRange = (tanggal_mulai, tanggal_selesai) => {
  if (!tanggal_mulai || !tanggal_selesai) {
    badRequest("Tanggal mulai dan tanggal selesai wajib diisi");
  }

  const start = new Date(tanggal_mulai);
  const end = new Date(tanggal_selesai);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    badRequest("Format tanggal tidak valid");
  }

  if (end < start) {
    badRequest("Tanggal selesai tidak boleh sebelum tanggal mulai");
  }

  return { start, end };
};

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) {
    badRequest("Items harus berupa array");
  }

  const itemMap = new Map();

  for (const item of items) {
    const productId = Number(item.id_product);
    const qty = Number(item.jumlah);

    if (!Number.isInteger(productId) || productId <= 0) {
      badRequest("id_product item tidak valid");
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      badRequest("Jumlah item harus angka bulat lebih dari 0");
    }

    itemMap.set(productId, (itemMap.get(productId) || 0) + qty);
  }

  return Array.from(itemMap.entries()).map(([id_product, jumlah]) => ({
    id_product,
    jumlah,
  }));
};

const formatProduct = (req, product, stok_tersedia = product.stok_total) => ({
  ...product,
  stok_tersedia,
  images: (product.images || []).map((img) => ({
    ...img,
    url: buildImageUrl(req, img.url),
  })),
});

const getCartWithProducts = (session_id) => {
  return prisma.cart.findUnique({
    where: { session_id },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: true,
            },
          },
        },
      },
    },
  });
};

const formatCart = (req, cart) => {
  if (!cart) {
    return null;
  }

  const start = cart.tanggal_mulai ? new Date(cart.tanggal_mulai) : null;
  const end = cart.tanggal_selesai ? new Date(cart.tanggal_selesai) : null;
  const jumlah_hari = start && end ? getRentalDays(start, end) : 0;
  let total_harga = 0;

  const items = cart.items.map((item) => {
    const subtotal = item.product.harga_per_hari * item.jumlah * jumlah_hari;
    total_harga += subtotal;

    return {
      ...item,
      subtotal,
      product: formatProduct(req, item.product),
    };
  });

  return {
    ...cart,
    jumlah_hari,
    total_harga,
    items,
  };
};

const getStockUsageMap = async (tanggal_mulai, tanggal_selesai) => {
  const konflik = await prisma.bookingDetail.findMany({
    where: {
      booking: {
        OR: [
          {
            status: { in: ["pending_payment", "paid", "ongoing"] },
            AND: [
              { tanggal_mulai: { lte: tanggal_selesai } },
              { tanggal_selesai: { gte: tanggal_mulai } },
            ],
          },
          {
            status: "completed",
            tanggal_kembali: {
              gte: tanggal_mulai,
            },
            AND: [
              { tanggal_mulai: { lte: tanggal_selesai } },
            ],
          },
        ],
      },
    },
    select: {
      id_product: true,
      jumlah: true,
    },
  });

  const stokMap = {};
  for (const item of konflik) {
    stokMap[item.id_product] = (stokMap[item.id_product] || 0) + item.jumlah;
  }

  return stokMap;
};

const createPaidBooking = async ({
  normalizedItems,
  start,
  end,
  customer,
  paymentMethod,
  paymentNote,
  cartIdToDelete,
  tipe_diskon,
  nilai_diskon,
}) => {
  const productIds = normalizedItems.map((item) => item.id_product);
  const products = await prisma.product.findMany({
    where: { id_product: { in: productIds } },
  });

  if (products.length !== normalizedItems.length) {
    badRequest("Ada produk yang tidak ditemukan");
  }

  for (const item of normalizedItems) {
    const stock = await checkStock({
      id_product: item.id_product,
      jumlah: item.jumlah,
      tanggal_mulai: start,
      tanggal_selesai: end,
    });

    if (!stock.available) {
      badRequest(`Stok produk ID ${item.id_product} tidak mencukupi`);
    }
  }

  const productMap = new Map(products.map((product) => [product.id_product, product]));
  const diffDays = getRentalDays(start, end);
  let total_harga = 0;

  const detailsData = normalizedItems.map((item) => {
    const product = productMap.get(item.id_product);
    const harga_sewa = product.harga_per_hari;
    const subtotal = harga_sewa * item.jumlah * diffDays;
    total_harga += subtotal; // Ini subtotal sementar

    return {
      id_product: item.id_product,
      jumlah: item.jumlah,
      harga_sewa,
      subtotal,
    };
  });

  // Hitung Diskon
  let nominal_diskon = 0;
  if (tipe_diskon === "persen" && nilai_diskon > 0) {
    nominal_diskon = Math.floor((total_harga * nilai_diskon) / 100);
  } else if (tipe_diskon === "nominal" && nilai_diskon > 0) {
    nominal_diskon = nilai_diskon;
  }

  // Validasi: Diskon tidak boleh melebihi total harga
  if (nominal_diskon > total_harga) {
    nominal_diskon = total_harga;
  }

  // Kurangi total harga dengan diskon
  total_harga -= nominal_diskon;

  const kode_booking = buildCode("POS");
  const reference_id = buildCode("PAY-POS");

  return prisma.$transaction(async (tx) => {
    const newBooking = await tx.booking.create({
      data: {
        kode_booking,
        nama_customer: customer.nama_customer,
        email: customer.email || null,
        no_hp: customer.no_hp,
        alamat: customer.alamat || null,
        foto_identitas: customer.foto_identitas || null,
        tanggal_mulai: start,
        tanggal_selesai: end,
        total_harga,
        diskon: nominal_diskon,
        status: "paid",
        sumber: "offline",
        details: {
          create: detailsData,
        },
        payments: {
          create: {
            metode: paymentMethod,
            catatan: paymentNote || null,
            jumlah_bayar: total_harga,
            status: "settlement",
            reference_id,
            payment_time: new Date(),
          },
        },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
    });

    for (const item of normalizedItems) {
      await tx.stockLog.create({
        data: {
          id_product: item.id_product,
          perubahan: "OUT",
          jumlah: item.jumlah,
          keterangan: `POS offline ${kode_booking}`,
        },
      });
    }

    if (cartIdToDelete) {
      await tx.cart.delete({
        where: { id_cart: cartIdToDelete },
      });
    }

    return newBooking;
  });
};

export const getPosProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      q,
      category_id,
      tanggal_mulai,
      tanggal_selesai,
    } = req.query;

    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const where = { is_active: true };

    if (category_id) {
      where.category_id = Number(category_id);
    }

    if (q) {
      where.OR = [
        { nama: { contains: q } },
        { deskripsi: { contains: q } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { id_product: "asc" },
        include: {
          images: true,
          category: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    let stokMap = {};
    if (tanggal_mulai && tanggal_selesai) {
      const { start, end } = validateDateRange(tanggal_mulai, tanggal_selesai);
      stokMap = await getStockUsageMap(start, end);
    }

    const data = products.map((product) => {
      const dipakai = stokMap[product.id_product] || 0;
      return formatProduct(req, product, product.stok_total - dipakai);
    });

    res.json({
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
      data,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const getPosCart = async (req, res) => {
  try {
    const cart = await getCartWithProducts(getPosSessionId(req));
    res.json({ data: formatCart(req, cart) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const setPosCartDate = async (req, res) => {
  try {
    const { tanggal_mulai, tanggal_selesai } = req.body;
    validateDateRange(tanggal_mulai, tanggal_selesai);

    const posSession = getPosSessionId(req);
    await cartModel.getOrCreateCart(posSession);
    await cartModel.setCartDates(posSession, tanggal_mulai, tanggal_selesai);

    const cart = await getCartWithProducts(posSession);

    for (const item of cart.items) {
      const stock = await checkStock({
        id_product: item.id_product,
        jumlah: item.jumlah,
        tanggal_mulai,
        tanggal_selesai,
      });

      if (!stock.available) {
        await cartModel.deleteCartItem(item.id_item);
      }
    }

    const updatedCart = await getCartWithProducts(posSession);

    res.json({
      message: "Periode sewa POS berhasil diset",
      data: formatCart(req, updatedCart),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const addPosCartItem = async (req, res) => {
  try {
    const { id_product, jumlah } = req.body;
    const productId = Number(id_product);
    const qty = Number(jumlah);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: "id_product tidak valid" });
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "Jumlah harus angka bulat lebih dari 0" });
    }

    const posSession = getPosSessionId(req);
    const cart = await getCartWithProducts(posSession);
    if (!cart || !cart.tanggal_mulai || !cart.tanggal_selesai) {
      return res.status(400).json({ error: "Set periode sewa POS dulu sebelum tambah barang" });
    }

    const existingItem = cart.items.find((item) => item.id_product === productId);
    const desiredQty = (existingItem?.jumlah || 0) + qty;
    const stock = await checkStock({
      id_product: productId,
      jumlah: desiredQty,
      tanggal_mulai: cart.tanggal_mulai,
      tanggal_selesai: cart.tanggal_selesai,
    });

    if (!stock.available) {
      return res.status(400).json({
        error: "Stok tidak mencukupi untuk periode tersebut",
        data: stock,
      });
    }

    await cartModel.addToCart(posSession, productId, qty);

    const updatedCart = await getCartWithProducts(posSession);

    res.status(201).json({
      message: "Produk berhasil ditambahkan ke cart POS",
      data: formatCart(req, updatedCart),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updatePosCartItem = async (req, res) => {
  try {
    const { id_item } = req.params;
    const { jumlah } = req.body;
    const qty = Number(jumlah);

    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: "Jumlah harus angka bulat minimal 0" });
    }

    const item = await prisma.cartItem.findUnique({
      where: { id_item: Number(id_item) },
      include: { cart: true },
    });

    if (!item) {
      return res.status(404).json({ error: "Item tidak ditemukan" });
    }

    if (item.cart.session_id !== getPosSessionId(req)) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    if (qty > 0) {
      const stock = await checkStock({
        id_product: item.id_product,
        jumlah: qty,
        tanggal_mulai: item.cart.tanggal_mulai,
        tanggal_selesai: item.cart.tanggal_selesai,
      });

      if (!stock.available) {
        return res.status(400).json({
          error: "Stok tidak mencukupi untuk periode tersebut",
          data: stock,
        });
      }
    }

    await cartModel.updateCartItem(Number(id_item), qty);

    const updatedCart = await getCartWithProducts(getPosSessionId(req));

    res.json({
      message: "Item cart POS berhasil diupdate",
      data: formatCart(req, updatedCart),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deletePosCartItem = async (req, res) => {
  try {
    const { id_item } = req.params;
    const item = await prisma.cartItem.findUnique({
      where: { id_item: Number(id_item) },
      include: { cart: true },
    });

    if (!item) {
      return res.status(404).json({ error: "Item tidak ditemukan" });
    }

    if (item.cart.session_id !== getPosSessionId(req)) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    await cartModel.deleteCartItem(Number(id_item));

    const updatedCart = await getCartWithProducts(getPosSessionId(req));

    res.json({
      message: "Item cart POS berhasil dihapus",
      data: formatCart(req, updatedCart),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const clearPosCart = async (req, res) => {
  try {
    const posSession = getPosSessionId(req);
    const cart = await cartModel.getOrCreateCart(posSession);
    await cartModel.clearCart(cart.id_cart);

    const updatedCart = await getCartWithProducts(posSession);

    res.json({
      message: "Cart POS dikosongkan",
      data: formatCart(req, updatedCart),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createOfflineSale = async (req, res) => {
  try {
    const {
      nama_customer,
      email,
      no_hp,
      alamat,
      foto_identitas,
      no_ktp,
      tanggal_mulai,
      tanggal_selesai,
      metode_pembayaran,
      catatan_pembayaran,
      items,
      tipe_diskon, // 'persen' atau 'nominal'
      nilai_diskon, // angka
    } = req.body;

    if (!nama_customer || !no_hp) {
      return res.status(400).json({
        error: "Nama customer dan no HP wajib diisi",
      });
    }

    const paymentMethod = String(metode_pembayaran || "").toLowerCase();
    if (!["cash", "qris", "tf", "transfer"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Metode pembayaran harus cash, qris, tf, atau transfer" });
    }

    let normalizedItems;
    let start;
    let end;
    let cartIdToDelete = null;

    if (items) {
      const dateRange = validateDateRange(tanggal_mulai, tanggal_selesai);
      start = dateRange.start;
      end = dateRange.end;
      normalizedItems = normalizeItems(items);
    } else {
      const cart = await getCartWithProducts(getPosSessionId(req));
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ error: "Cart POS kosong" });
      }

      const dateRange = validateDateRange(cart.tanggal_mulai, cart.tanggal_selesai);
      start = dateRange.start;
      end = dateRange.end;
      normalizedItems = normalizeItems(cart.items);
      cartIdToDelete = cart.id_cart;
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "Minimal pilih 1 produk" });
    }

    const booking = await createPaidBooking({
      normalizedItems,
      start,
      end,
      customer: {
        nama_customer,
        email: email || null,
        no_hp,
        alamat,
        foto_identitas: foto_identitas || no_ktp || null,
      },
      paymentMethod,
      paymentNote: catatan_pembayaran,
      cartIdToDelete,
      tipe_diskon,
      nilai_diskon: Number(nilai_diskon) || 0,
    });

    // Hapus Cache Produk karena ada barang yang berhasil keluar via POS Offline
    await invalidateCache("products:*");

    res.status(201).json({
      message: "Transaksi POS offline berhasil dibuat dan langsung paid",
      data: booking,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
