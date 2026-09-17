import { Router } from "express";
import {
  signinController,
  signupController,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", signupController);
router.post("/login", signinController);

export default router;
