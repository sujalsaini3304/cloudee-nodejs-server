import express from "express";
import router from "./routes.js";
import { configDotenv } from "dotenv";

const app = express();
configDotenv({
  path: ".env",
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", router);

app.listen(process.env.PORT, (req, res) => {
  console.log("Nodejs server started.");
});
