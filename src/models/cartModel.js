import prisma from "../config/prisma.js";


// ambil / bikin cart
export const getOrCreateCart = async (session_id) => {
  let cart = await prisma.cart.findUnique({
    where: { session_id },
    include: {
      items: {
        include: { product: true },
      },
    },
  });

  if (!cart) {
    try {
      cart = await prisma.cart.create({
        data: { session_id },
        include: {
          items: true,
        },
      });
    } catch (error) {
      // Tangani race condition jika request API masuk bersamaan (P2002)
      if (error.code === 'P2002') {
        cart = await prisma.cart.findUnique({
          where: { session_id },
          include: {
            items: {
              include: { product: true },
            },
          },
        });
      } else {
        throw error;
      }
    }
  }

  return cart;
};

// set / update tanggal cart
export const setCartDates = async (session_id, tanggal_mulai, tanggal_selesai) => {
  return prisma.cart.update({
    where: { session_id },
    data: {
      tanggal_mulai: new Date(tanggal_mulai),
      tanggal_selesai: new Date(tanggal_selesai),
    },
  });
};

// tambah item ke cart
export const addToCart = async (session_id, id_product, jumlah) => {
  const cart = await getOrCreateCart(session_id);

  // ⛔ wajib ada tanggal dulu
  if (!cart.tanggal_mulai || !cart.tanggal_selesai) {
    throw new Error("Tanggal sewa belum diisi");
  }

  const existingItem = await prisma.cartItem.findFirst({
    where: {
      id_cart: cart.id_cart,
      id_product,
    },
  });

  let item;

  if (existingItem) {
    item = await prisma.cartItem.update({
      where: { id_item: existingItem.id_item },
      data: { jumlah: existingItem.jumlah + jumlah },
    });
  } else {
    item = await prisma.cartItem.create({
      data: {
        id_cart: cart.id_cart,
        id_product,
        jumlah,
      },
    });
  }

  return item;
};

// ambil detail cart
export const getCartDetail = async (session_id) => {
  return prisma.cart.findUnique({
    where: { session_id },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });
};

// update jumlah item (auto delete kalau 0)
export const updateCartItem = async (id_item, jumlah) => {
  if (jumlah <= 0) {
    return prisma.cartItem.delete({
      where: { id_item },
    });
  }

  return prisma.cartItem.update({
    where: { id_item },
    data: { jumlah },
  });
};

// hapus item
export const deleteCartItem = async (id_item) => {
  return prisma.cartItem.delete({
    where: { id_item },
  });
};

// kosongin cart
export const clearCart = async (id_cart) => {
  return prisma.cartItem.deleteMany({
    where: { id_cart },
  });
};

// 🔥 hitung total harga (core logic penting)
export const calculateCartTotal = (cart) => {
  if (!cart.tanggal_mulai || !cart.tanggal_selesai) return 0;

  const start = new Date(cart.tanggal_mulai);
  const end = new Date(cart.tanggal_selesai);

  const diffDays =
    Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;

  let total = 0;

  for (const item of cart.items) {
    total += item.jumlah * item.product.harga_per_hari * diffDays;
  }

  return total;
};

// update total ke database (Dihapus karena model Cart tidak memiliki total_harga)