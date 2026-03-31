"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const db_1 = require("./config/db");
app_1.default.listen(env_1.env.port, () => {
    console.log(`HomeRent backend running on http://localhost:${env_1.env.port}`);
    console.log(`Swagger docs: http://localhost:${env_1.env.port}/docs`);
    (0, db_1.checkDbConnection)()
        .then(() => {
        console.log("[HomeRent] Database connected");
    })
        .catch((error) => {
        console.error("[HomeRent] Database connection failed:", error);
    });
});
