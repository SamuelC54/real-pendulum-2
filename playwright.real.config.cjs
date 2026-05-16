/** Sets `config.e2e.useRealMotor` then loads the default Playwright config. */
require("tsx/cjs");
const { config } = require("./packages/app-config/src/config.ts");
config.e2e.useRealMotor = true;
module.exports = require("./playwright.config.cjs");
