/** CI Playwright: sets `config.e2e.continuousIntegration` then loads the default config. */
require("tsx/cjs");
const { config } = require("./packages/app-config/src/config.ts");
config.e2e.continuousIntegration = true;
module.exports = require("./playwright.config.cjs");
