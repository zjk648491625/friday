const { setVersionForBuild } = require("./version");

const { version } = setVersionForBuild();
console.log(`\n[version] All packages updated to: ${version}`);