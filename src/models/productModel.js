import prisma from "../config/prisma.js";

export const getAllProducts = () => {
  return prisma.product.findMany();
};

export const getProductById = (id) => {
  return prisma.product.findUnique({
    where: { id_product: id },
  });
};

export const updateStock = async (id_product, jumlah, tipe) => {
  const product = await prisma.product.findUnique({
    where: { id_product },
  });

  let newStock =
    tipe === "OUT"
      ? product.stok_total - jumlah
      : product.stok_total + jumlah;

  await prisma.product.update({
    where: { id_product },
    data: { stok_total: newStock },
  });

  await prisma.stockLog.create({
    data: {
      id_product,
      perubahan: tipe,
      jumlah,
      keterangan: "Update dari sistem",
    },
  });
};