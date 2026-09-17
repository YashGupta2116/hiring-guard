import multer from "multer";
import { JD_MAX_BYTES } from "../config/constants.js";

/** Memory storage: the JD file is small (10 MB cap) and services decide where it's persisted. */
export const jdUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: JD_MAX_BYTES } }).single("file");
