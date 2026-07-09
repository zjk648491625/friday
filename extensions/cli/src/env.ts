import * as os from "os";
import * as path from "path";

import dotenv from "dotenv";

dotenv.config();

export const env = {
  apiBase: process.env.FRIDAY_API_BASE ?? "https://api.friday.dev/",
  fridayHome:
    process.env.FRIDAY_GLOBAL_DIR || path.join(os.homedir(), ".friday"),
};
