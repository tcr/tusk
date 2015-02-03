var Promise = require('bluebird');
var spawn = require('child_process').spawn;

var util = require('./util');

function up (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['up', '--provider=google', '--no-provision'], {
      cwd: cwd,
      stdio: "inherit",
      env: util.combine(process.env, opts.env || {}),
    });
    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error in vagrant up: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  .nodeify(next);
}

function provision (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['provision'], {
      cwd: cwd,
      stdio: "inherit",
      env: util.combine(process.env, opts.env || {}),
    });
    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error in vagrant provision: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  .nodeify(next);
}

function destroy (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['destroy', '-f'], {
      cwd: cwd,
      stdio: "inherit",
      env: util.combine(process.env, opts.env || {}),
    });
    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error in vagrant destroy: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  // TODO remove this timeout when vagrant-google waits properly
  .delay(15*1000)
  .nodeify(next);
}

exports.up = up;
exports.provision = provision;
exports.destroy = destroy;
