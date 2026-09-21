import prisma from "../config/prisma.js";

export const getStockLogs = () => {
  return prisma.stockLog.findMany({
    include: { product: true },
  });
};