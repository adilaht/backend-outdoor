import prisma from "../config/prisma.js";

export const getLaporanData = async (req, res) => {
  try {
    const { period } = req.query; // '1', '7', '30', 'all'
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'custom' && req.query.startDate && req.query.endDate) {
      dateFilter = {
        created_at: {
          gte: new Date(`${req.query.startDate}T00:00:00.000Z`),
          lte: new Date(`${req.query.endDate}T23:59:59.999Z`)
        }
      };
    } else if (period && period !== 'all') {
      const days = parseInt(period, 10);
      if (!isNaN(days)) {
        const thresholdDate = new Date(now);
        thresholdDate.setDate(thresholdDate.getDate() - days);
        dateFilter = { created_at: { gte: thresholdDate } };
      }
    }

    // 1. Laporan Keuangan (Booking yang udah lunas/ongoing/selesai)
    const keuanganRaw = await prisma.booking.findMany({
      where: {
        status: { in: ["paid", "ongoing", "completed"] },
        ...dateFilter
      },
      orderBy: { created_at: "desc" },
      select: {
        id_booking: true,
        kode_booking: true,
        tanggal_mulai: true,
        nama_customer: true,
        total_harga: true,
        nominal_denda: true,
        status: true,
        payments: {
          select: { metode: true },
          take: 1
        }
      }
    });

    let totalPendapatan = 0;
    let totalDenda = 0;
    let totalCash = 0;

    const keuangan = keuanganRaw.map(b => {
      const totalBersih = b.total_harga + (b.nominal_denda || 0);
      totalPendapatan += totalBersih;
      totalDenda += (b.nominal_denda || 0);

      // Ambil metode bayar dari payment pertama (jika ada)
      let metode = 'Midtrans'; // default untuk online yang belum terbayar tapi berstatus (jika ada)
      if (b.payments && b.payments.length > 0) {
        const rawMetode = b.payments[0].metode.toLowerCase();
        if (rawMetode === 'cash') {
          metode = 'Cash';
          totalCash += totalBersih; // Tambahkan ke perhitungan cash
        }
        else if (rawMetode === 'qris') metode = 'QRIS';
        else if (rawMetode === 'transfer' || rawMetode === 'bank_transfer') metode = 'Transfer Bank';
        else metode = b.payments[0].metode; // Fallback jika midtrans channel
      }

      return {
        id: b.kode_booking,
        tanggal: new Date(b.tanggal_mulai).toISOString().split('T')[0],
        nama: b.nama_customer,
        sewa: b.total_harga,
        denda: b.nominal_denda || 0,
        total: totalBersih,
        status: b.status,
        metode_bayar: metode
      };
    });

    const ringkasan_keuangan = {
      total_pendapatan: totalPendapatan,
      total_denda: totalDenda,
      total_transaksi: keuangan.length,
      total_cash: totalCash
    };

    // 2. Laporan Inventaris
    const produkRaw = await prisma.product.findMany({
      where: { is_active: true },
      select: {
        id_product: true,
        nama: true,
        stok_total: true
      }
    });

    // Cari barang yang sedang dipinjam SAAT INI (status ongoing) -> untuk hitung Tersedia
    const ongoingDetails = await prisma.bookingDetail.findMany({
      where: {
        booking: { status: "ongoing" }
      },
      select: {
        id_product: true,
        jumlah: true
      }
    });

    const ongoingMap = new Map();
    ongoingDetails.forEach(d => {
      ongoingMap.set(d.id_product, (ongoingMap.get(d.id_product) || 0) + d.jumlah);
    });

    // Cari histori penyewaan DALAM PERIODE TERSEBUT (untuk Frekuensi Sewa)
    const periodDetails = await prisma.bookingDetail.findMany({
      where: {
        booking: {
          ...dateFilter,
          status: { in: ["paid", "ongoing", "completed"] }
        }
      },
      select: {
        id_product: true,
        jumlah: true
      }
    });

    const periodMap = new Map();
    periodDetails.forEach(d => {
      periodMap.set(d.id_product, (periodMap.get(d.id_product) || 0) + d.jumlah);
    });

    let ringkasan_inventaris = {
      total_item_fisik: 0,
      total_disewa_periode: 0,
      tersedia: 0,
      rusak_hilang: 0
    };

    const inventaris = produkRaw.map(p => {
      const ongoing = ongoingMap.get(p.id_product) || 0;
      const disewaPeriode = periodMap.get(p.id_product) || 0;
      const rusak = 0; 
      const tersedia = p.stok_total - ongoing - rusak;

      ringkasan_inventaris.total_item_fisik += p.stok_total;
      ringkasan_inventaris.total_disewa_periode += disewaPeriode;
      ringkasan_inventaris.tersedia += tersedia;
      ringkasan_inventaris.rusak_hilang += rusak;

      return {
        id: `PRD-${p.id_product.toString().padStart(3, '0')}`,
        nama: p.nama,
        total_stok: p.stok_total,
        dipinjam: disewaPeriode, // Sekarang menyimpan frekuensi dalam periode
        tersedia,
        rusak
      };
    });

    res.json({
      data: {
        keuangan,
        ringkasan_keuangan,
        inventaris,
        ringkasan_inventaris
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
