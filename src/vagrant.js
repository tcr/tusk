var Promise = require('bluebird');
var spawn = require('child_process').spawn;

function up (cwd, next) {
  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['up', '--provider=google', '--no-provision'], {
      cwd: cwd,
      stdio: "inherit",
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

function provision (cwd, next) {
  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['provision'], {
      cwd: cwd,
      stdio: "inherit",
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

function destroy (cwd, next) {
  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['destroy', '-f'], {
      cwd: cwd,
      stdio: "inherit",
    });
    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error in vagrant destroy: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  // TODO remove this timeout when vagrant-google waits properly
  .delay(5000)
  .nodeify(next);
}

exports.up = up;
exports.provision = provision;
exports.destroy = destroy;
