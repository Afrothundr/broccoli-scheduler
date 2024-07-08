import dotenv from "dotenv";
import pino from "pino";
let logger = require("pino")();
dotenv.config();

if (process.env.ENVIRONMENT === "local") {
  logger = pino({
    transport: {
      target: "pino-pretty",
    },
  });
}

export default logger;
