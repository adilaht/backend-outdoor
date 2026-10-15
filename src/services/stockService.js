import prisma from "../config/prisma.js"; 

export const getBookingConflictConditions = (tanggal_mulai, tanggal_selesai) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reqStart = new Date(tanggal_mulai);
  reqStart.setHours(0, 0, 0, 0);

  const bookingConditions = [
    // Case 1: Booking aktif (Berdasarkan jadwal yang bentrok)
    {
      status: { in: ["pending_payment", "paid", "ongoing"] },
      AND: [
        { tanggal_mulai: { lte: new Date(tanggal_selesai) } },
        { tanggal_selesai: { gte: new Date(tanggal_mulai) } },
      ],
    },
    // Case 2: Booking completed dengan buffer H+1 dari tanggal_kembali
    {
      status: "completed",
      tanggal_kembali: {
        gte: new Date(tanggal_mulai), // stok ditahan sampai ganti hari (bukan 24 jam)
      },
      AND: [
        { tanggal_mulai: { lte: new Date(tanggal_selesai) } },
      ],
    },
  ];

  // 🌟 SMART LOCKING (OVERDUE LOGIC)
  // Jika customer nyari sewa mulai HARI INI (atau sebelumnya),
  // maka barang yang BELUM DIBALIKIN (overdue) ikut diblokir.
  if (reqStart <= today) {
    bookingConditions.push({
      status: { in: ["paid", "ongoing"] },
      tanggal_selesai: { lt: today }
    });
  }

  return bookingConditions;
};

export const checkStockBatch = async ({
  items,
  tanggal_mulai,
  tanggal_selesai,
  prismaClient = prisma,
}) => {
  if (!items || items.length === 0) {
    return {
      is_all_available: true,
      results: [],
      conflictMap: {},
      productMap: {},
    };
  }

  const productIds = [...new Set(items.map((i) => Number(i.id_product)))];
  const bookingConditions = getBookingConflictConditions(tanggal_mulai, tanggal_selesai);

  // 1. Eksekusi 2 query batch secara paralel (1 untuk total konflik booking, 1 untuk info produk)
  const [konflik, products] = await Promise.all([
    prismaClient.bookingDetail.groupBy({
      by: ["id_product"],
      _sum: { jumlah: true },
      where: {
        id_product: { in: productIds },
        booking: {
          OR: bookingConditions,
        },
      },
    }),
    prismaClient.product.findMany({
      where: { id_product: { in: productIds } },
      select: {
        id_product: true,
        nama: true,
        stok_total: true,
      },
    }),
  ]);

  const conflictMap = Object.fromEntries(
    konflik.map((k) => [k.id_product, k._sum.jumlah || 0])
  );
  const productMap = Object.fromEntries(
    products.map((p) => [p.id_product, p])
  );

  // 2. Evaluasi ketersediaan stok setiap item di memori (O(N) tanpa roundtrip ke DB)
  const results = items.map((item) => {
    const prod = productMap[item.id_product];
    const totalStok = item.product?.stok_total ?? (prod?.stok_total || 0);
    const nama = item.product?.nama ?? (prod?.nama || `Produk #${item.id_product}`);
    const terpakai = conflictMap[item.id_product] || 0;
    const sisa = Math.max(0, totalStok - terpakai);
    const available = item.jumlah <= sisa;

    return {
      ...item,
      nama,
      stok_total: totalStok,
      terpakai,
      stok_tersedia: sisa,
      is_available: available,
    };
  });

  const is_all_available = results.every((r) => r.is_available);

  return {
    is_all_available,
    results,
    conflictMap,
    productMap,
  };
};

export const checkStock = async ({
  id_product,
  jumlah,
  tanggal_mulai,
  tanggal_selesai,
}) => {
  const { results, productMap } = await checkStockBatch({
    items: [{ id_product, jumlah }],
    tanggal_mulai,
    tanggal_selesai,
  });

  if (!productMap[id_product]) {
    throw new Error("Produk tidak ditemukan");
  }

  const res = results[0];
  return {
    available: res.is_available,
    stok_total: res.stok_total,
    terpakai: res.terpakai,
    sisa: res.stok_tersedia,
  };
};