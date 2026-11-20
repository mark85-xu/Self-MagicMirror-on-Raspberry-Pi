const fs = require("node:fs");
const path = require("node:path");
const config = require("../config/config.face-local.js");

// MagicMirror loads the same config in Node and as a browser script.
fs.writeFileSync(path.join(__dirname, "../config/config.face-local.generated.js"), `let config = ${JSON.stringify(config, null, 2)};\nif (typeof module !== "undefined") { module.exports = config; }\n`);
