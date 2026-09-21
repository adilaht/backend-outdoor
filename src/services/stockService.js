import prisma from "../config/prisma.js"; 

export const checkStock = async ({
  id_product,
  jumlah,
  tanggal_mulai,
  tanggal_selesai,
}) => {
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

  const [konflik, product] = await Promise.all([
    prisma.bookingDetail.findMany({
      where: {
        id_product,
        booking: {
          OR: bookingConditions,
        },
      },
    }),
    prisma.product.findUnique({
      where: { id_product },
    }),
  ]);

  if (!product) {
    throw new Error("Produk tidak ditemukan");
  }

  const totalDipakai = konflik.reduce((sum, d) => sum + d.jumlah, 0);
  const sisaStok = product.stok_total - totalDipakai;

  return {
    available: jumlah <= sisaStok,
    stok_total: product.stok_total,
    terpakai: totalDipakai,
    sisa: sisaStok,
  };
};