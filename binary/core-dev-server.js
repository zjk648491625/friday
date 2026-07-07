// Modified by Friday AI Team - Rebranded from Continue
const path = require("path");
process.env.FRIDAY_DEVELOPMENT = true;

process.env.FRIDAY_GLOBAL_DIR = path.join(
  process.env.PROJECT_DIR,
  "extensions",
  ".friday-debug",
);

require("./out/index.js");
