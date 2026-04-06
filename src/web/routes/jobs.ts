import { Router } from "express";
import {
  createJob,
  downloadArtifact,
  getJobStatus,
  publishJobOutputs,
  renderArtifactPreview,
  renderJobProgress,
  renderJobResult,
  renderPublishReview
} from "../controllers/job-controller.js";

export const jobsRouter = Router();

jobsRouter.post("/", createJob);
jobsRouter.get("/:id", renderJobProgress);
jobsRouter.get("/:id/status", getJobStatus);
jobsRouter.get("/:id/result", renderJobResult);
jobsRouter.get("/:id/publish-review", renderPublishReview);
jobsRouter.post("/:id/publish", publishJobOutputs);
jobsRouter.get("/:id/artifacts/:kind/:fileName", renderArtifactPreview);
jobsRouter.get("/:id/artifacts/:kind/:fileName/download", downloadArtifact);
