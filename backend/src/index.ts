import "dotenv/config";
import express from "express";
import authRouter from "./routes/auth.routes.js";

const app = express();

app.use("/auth", authRouter);

app.listen(9000, async () => {
  console.log("Server started on port: ", process.env.PORT);
});
