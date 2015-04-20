var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var Promise = require('bluebird');

var USER_PLANS = __dirname + '/../config/plan/';
var USER_VMS = __dirname + '/../work/vms/';
var USER_LOGS = __dirname + '/../work/logs/';
var USER_DB = __dirname + '/../work/tusk.sqlite';
var PLANS = __dirname + '/../plan/';

function read () {
  return yaml.safeLoad(fs.readFileSync(path.join(__dirname, '/../config/tusk.yaml')));
}

function getPlan (name) {
  return fs.existsSync(USER_PLANS + name + '.yml')
    ? yaml.safeLoad(fs.readFileSync(USER_PLANS + name + '.yml'))
    : yaml.safeLoad(fs.readFileSync(PLANS + name + '.yml'));
}

function listPlans (next) {
  return Promise.resolve([].concat(fs.readdirSync(USER_PLANS) || [], fs.readdirSync(PLANS)).filter(function (x) {
    return x.match(/\.ya?ml$/i);
  }).map(function (x) {
    return x.replace(/\.ya?ml$/i, '');
  }))
  .nodeify(next);
}

exports.USER_PLANS = USER_PLANS;
exports.USER_VMS = USER_VMS;
exports.USER_LOGS = USER_LOGS;
exports.USER_DB = USER_DB;
exports.PLANS = PLANS;

exports.read = read;
exports.getPlan = getPlan;
exports.listPlans = listPlans;
