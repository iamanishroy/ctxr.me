import { Hono } from "hono";
import { rateLimiter } from "./rate-limit";
import readRoutes from "./core/routes";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", rateLimiter());

app.get("/ok", (c) => {
  return c.text("Hello Hono!");
});

app.route("/", readRoutes);

export default app;
