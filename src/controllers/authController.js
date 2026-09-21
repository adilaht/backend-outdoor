import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
    }

    const isValid = await bcrypt.compare(password, admin.password);

    if (!isValid) {
      return res.status(401).json({ error: "Password salah" });
    }

    const token = jwt.sign(
      { id_admin: admin.id_admin, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Set token ke dalam HTTP-Only Cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Pakai HTTPS kalau di production
      sameSite: "lax", // atau 'strict', sesuaikan dengan CORS Next.js
      maxAge: 24 * 60 * 60 * 1000, // 1 Hari (sejalan dengan token expiry)
    });

    res.json({
      message: "Login berhasil",
      token, // Tetap dibalikin buat backup kalo frontend butuh untuk header (meskipun udah ada cookie)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAdminProfile = async (req, res) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id_admin: req.admin.id_admin },
      select: {
        id_admin: true,
        email: true,
        nama: true,
        created_at: true,
      },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
    }

    res.json({ data: admin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminLogout = (req, res) => {
  // Hapus cookie token
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  
  res.json({ message: "Logout berhasil" });
};