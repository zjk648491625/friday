// Modified by Friday AI Team - Rebranded from Continue
import fs from "fs";
import path from "path";

// Sets up the GLOBAL directory for testing - equivalent to ~/.friday
// IMPORTANT: the FRIDAY_GLOBAL_DIR environment variable is used in utils/paths for getting all local paths
export default async function () {
  process.env.FRIDAY_GLOBAL_DIR = path.join(__dirname, ".friday-test");
  if (fs.existsSync(process.env.FRIDAY_GLOBAL_DIR)) {
    fs.rmSync(process.env.FRIDAY_GLOBAL_DIR, {
      recursive: true,
      force: true,
    });
  }
}
