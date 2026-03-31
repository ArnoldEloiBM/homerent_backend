import app from "./app";
import { env } from "./config/env";
import { checkDbConnection } from "./config/db";

app.listen(env.port, () => {
  console.log(`HomeRent backend running on http://localhost:${env.port}`);
  console.log(`Swagger docs: http://localhost:${env.port}/docs`);

  checkDbConnection()
    .then(() => {
      console.log("[HomeRent] Database connected");
    })
    .catch((error: unknown) => {
      console.error("[HomeRent] Database connection failed:", error);
    });
});
