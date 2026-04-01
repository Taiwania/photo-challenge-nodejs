import { createApp } from "./web/app.js";
import { config } from "./infra/config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Photo Challenge web app listening on http://localhost:${config.port}`);
});
