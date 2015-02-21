var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var Promise = require('bluebird');

function read () {
  return yaml.safeLoad(fs.readFileSync(path.join(__dirname, '/../config/tusk.yaml')));
}

var CUSTOM_PLANS = __dirname + '/../custom/';
var PLANS = __dirname + '/../plan/';

function getPlan (name) {
  return fs.existsSync(CUSTOM_PLANS + name + '.yml')
    ? yaml.safeLoad(fs.readFileSync(CUSTOM_PLANS + name + '.yml'))
    : yaml.safeLoad(fs.readFileSync(PLANS + name + '.yml'));
}

function listPlans (next) {
  return Promise.resolve([].concat(fs.readdirSync(CUSTOM_PLANS), fs.readdirSync(PLANS)).filter(function (x) {
    return x.match(/\.ya?ml$/i);
  }).map(function (x) {
    return x.replace(/\.ya?ml$/i, '');
  }))
  .nodeify(next);
}

exports.read = read;
exports.getPlan = getPlan;
exports.listPlans = listPlans;
