var fs = require('fs');
var yaml = require('js-yaml');

// Get document, or throw exception on error
function getPlan (name) {
  return yaml.safeLoad(fs.readFileSync(__dirname + '/plans/' + name + '.yaml', 'utf8'));
}

exports.getPlan = getPlan;
