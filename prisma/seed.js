import "dotenv/config";
import prisma from "../src/config/prisma.js";
import bcrypt from "bcrypt";

async function main() {
  console.log("🌱 Seeding data...");

  // reset data
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.bookingDetail.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.stockLog.deleteMany();
  await prisma.product.deleteMany();

  // insert kategori
  const categories = await prisma.category.createMany({
    data: [
      { nama: "Tenda", slug: "tenda" },
      { nama: "Carrier", slug: "carrier" },
      { nama: "Sleeping Bag", slug: "sleeping-bag" },
      { nama: "Kompor", slug: "kompor" },
      { nama: "Sepatu", slug: "sepatu" },
    ],
  });

  // ambil kategori untuk mapping
  const catList = await prisma.category.findMany();

  const catMap = Object.fromEntries(catList.map(c => [c.slug, c.id_category]));

  // insert produk
  await prisma.product.createMany({
    data: [
      {
        nama: "Tenda Camping 2 Orang",
        slug: "tenda-2p",
        deskripsi: "Tenda ringan waterproof",
        harga_per_hari: 40000,
        stok_total: 10,
        category_id: catMap["tenda"],
      },
      {
        nama: "Tenda Camping 4 Orang",
        slug: "tenda-4p",
        deskripsi: "Tenda ringan waterproof",
        harga_per_hari: 50000,
        stok_total: 10,
        category_id: catMap["tenda"],
      },
      {
        nama: "Tenda Camping 6 Orang",
        slug: "tenda-6p",
        deskripsi: "Tenda ringan waterproof",
        harga_per_hari: 70000,
        stok_total: 10,
        category_id: catMap["tenda"],
      },
      {
        nama: "Carrier 60L",
        slug: "carier-60l",
        deskripsi: "Tas gunung besar",
        harga_per_hari: 30000,
        stok_total: 7,
        category_id: catMap["carrier"],
      },
      {
        nama: "Carrier 40L-50L",
        slug: "carier-40l",
        deskripsi: "Tas gunung sedang",
        harga_per_hari: 25000,
        stok_total: 6,
        category_id: catMap["carrier"],
      },
      {
        nama: "Sleeping Bag Bogaboo",
        slug: "sleeping-bag1",
        deskripsi: "Hangat untuk malam dingin",
        harga_per_hari: 10000,
        stok_total: 10,
        category_id: catMap["sleeping-bag"],
      },
      {
        nama: "Sleeping Bag Tendaki",
        slug: "sleeping-bag2",
        deskripsi: "Hangat untuk malam dingin",
        harga_per_hari: 10000,
        stok_total: 10,
        category_id: catMap["sleeping-bag"],
      },
      {
        nama: "Sleeping Bag Aimpro",
        slug: "sleeping-bag3",
        deskripsi: "Hangat untuk malam dingin",
        harga_per_hari: 10000,
        stok_total: 5,
        category_id: catMap["sleeping-bag"],
      },
      {
        nama: "Kompor Portable Kotak",
        slug: "kompor-1",
        deskripsi: "Kompor gas kecil kotak",
        harga_per_hari: 10000,
        stok_total: 10,
        category_id: catMap["kompor"],
      },
      {
        nama: "Kompor Portable Bunga",
        slug: "kompor-2",
        deskripsi: "Kompor gas kecil anti angin",
        harga_per_hari: 15000,
        stok_total: 10,
        category_id: catMap["kompor"],
      },
      {
        nama: "Kompor Portable Koper",
        slug: "kompor-3",
        deskripsi: "Kompor gas besar dengan koper",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["kompor"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 38",
        slug: "sepatu-38",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 39",
        slug: "sepatu-39",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 40",
        slug: "sepatu-40",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 41",
        slug: "sepatu-41",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 42",
        slug: "sepatu-42",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 43",
        slug: "sepatu-43",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
      {
        nama: "Sepatu Tracking Safety Rionz 44",
        slug: "sepatu-44",
        deskripsi: "Sepatu tracking dengan grip kuat dan safety",
        harga_per_hari: 20000,
        stok_total: 10,
        category_id: catMap["sepatu"],
      },
    ],
  });

  const products = await prisma.product.findMany();

  for (const p of products) {
    await prisma.stockLog.create({
      data: {
        id_product: p.id_product,
        perubahan: "IN",
        jumlah: p.stok_total,
        keterangan: "Stok awal",
      },
    });
  }



  const hashedPassword = await bcrypt.hash("123456", 10);

  await prisma.admin.create({
    data: {
      email: "admin@gmail.com",
      password: hashedPassword,
      nama: "Admin",
    },
  });

  console.log("✅ Seed berhasil");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });