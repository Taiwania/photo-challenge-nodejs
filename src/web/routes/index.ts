import { Router } from "express";
import { clearSavedCredentialAction, renderHomePage } from "../controllers/home-controller.js";

export const indexRouter = Router();

indexRouter.get("/", renderHomePage);
indexRouter.post("/credentials/clear", clearSavedCredentialAction);
