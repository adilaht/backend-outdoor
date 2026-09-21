import { v4 as uuidv4 } from "uuid";

export const sessionMiddleware = (req, res, next) => {
  let session_id = req.headers["x-session-id"];

  if (!session_id) {
    session_id = uuidv4();
    res.setHeader("x-session-id", session_id);
  }

  req.session_id = session_id;
  next();
};