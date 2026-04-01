import path from "node:path";
import express from "express";
import { create } from "express-handlebars";
import { indexRouter } from "./routes/index.js";
import { jobsRouter } from "./routes/jobs.js";

export function createApp() {
  const app = express();
  const handlebars = create({
    extname: ".handlebars",
    helpers: {
      eq(a: unknown, b: unknown) {
        return a === b;
      },
      json(value: unknown) {
        return JSON.stringify(value, null, 2);
      }
    }
  });

  app.engine(".handlebars", handlebars.engine);
  app.set("view engine", ".handlebars");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use("/static", express.static(path.join(process.cwd(), "src", "web", "public")));

  app.use("/", indexRouter);
  app.use("/jobs", jobsRouter);

  return app;
}
