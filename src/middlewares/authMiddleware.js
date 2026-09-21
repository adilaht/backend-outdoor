import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  // 1. Coba ambil token dari HTTP-Only Cookie
  let token = req.cookies?.token;

  // 2. Jika tidak ada di cookie, fallback ke Authorization Header (Bearer token)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: Token tidak ditemukan" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.admin = decoded; // isinya { id_admin }

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};