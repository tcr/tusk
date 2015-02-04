var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

function read () {
  return yaml.safeLoad(fs.readFileSync(path.join(__dirname, '/../config/tusk.yaml')));
}

function getPlan (name) {
  return fs.existsSync(__dirname + '/../custom/' + name + '.yml')
    ? yaml.safeLoad(fs.readFileSync(__dirname + '/../custom/' + name + '.yml'))
    : yaml.safeLoad(fs.readFileSync(__dirname + '/../plan/' + name + '.yml'));
}

exports.read = read;
exports.getPlan = getPlan;
