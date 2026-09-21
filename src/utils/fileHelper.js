// utils/fileHelper.js

export const buildImageUrl = (req, filePath) => {
  if (!filePath) return null;

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${filePath}`;
};