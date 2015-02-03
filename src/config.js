var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

function read () {
  return yaml.safeLoad(fs.readFileSync(path.join(__dirname, '/../config/tusk.yaml')));
}

exports.read = read;
