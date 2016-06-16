// Common db connector for tests

if (!process.env.WHERE_API_CONFIG) throw new Error('Env var WHERE_API_CONFIG is not set.')

// Require a test config file to avoid wiping non-test data
// Assume test config path is default config path but with .test before extension
// e.g. .config.test.json
var configPath = process.env.WHERE_API_CONFIG.replace(/(\.json)?$/, '.test$1')
var config
try {
  config = require(configPath)
} catch (e) {
  throw new Error('No test config found: ' + configPath)
}

module.exports.db = require('../lib/db')(config)
