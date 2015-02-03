var wrench = require('wrench');
var fs = require('fs');
var spawn = require('child_process').spawn;
var Promise = require('bluebird');
var Set = require('es6-set');
var Map = require('es6-map');
var path = require('path');

var playbook = require('./playbook');
var vagrant = require('./vagrant');
var util = require('./util');
var storage = require('./storage');

var root = path.join(__dirname, '/../vms');

function clean (sha) {
  var vm = path.join(root, sha);

  return Promise.promisify(fs.exists)(vm)
    .catch(function () {
      console.log('GCing', sha);
      return vagrant.destroy(vm, {
          env: { TUSK_NAME: 'tusk-' + sha },
        })
        .then(function (oh) {
          console.log('ok');
          return Promise.promisify(wrench.rmdirRecursive)(vm);
        });
    })
}

function reset (next) {
  wrench.mkdirSyncRecursive(root);
  return Promise.map(fs.readdirSync(root), clean)
    .nodeify(next);
}

var buildingState = new Map();

function isBuilding (ref) {
  return buildingState.has(util.refSha(ref))
}

// Issues a build regardless of cached status.
function build (ref, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  var sha = util.refSha(ref);
  var cwd = __dirname + '/../vms/' + sha;
  var play = playbook.generate(ref);

  if (isBuilding(ref)) {
    return buildingState.get(util.refSha(ref)).nodeify(next);
  }

  var vmname = 'tusk-' + sha;

  var promise = 
  Promise.promisify(playbook.status)(ref.id)
  .catch(function (err) {
    buildingState.delete(sha);
    return Promise.reject(new Error('Dependency for `' + ref.id + '` missing:\n' + err.message));
  })
  .then(function () {
    console.error('Starting build', sha);
    return clean(sha)
    .then(function () {
      wrench.rmdirSyncRecursive(cwd, true);
      wrench.copyDirSyncRecursive(__dirname + '/../template', cwd)
      fs.writeFileSync(cwd + '/playbook.yml', play, 'utf-8');
    })
    .then(function () {
      console.log('up');
      return vagrant.up(cwd, {
        env: { TUSK_NAME: vmname },
      });
    })
    .then(function () {
      console.log('provision')
      return vagrant.provision(cwd, {
        env: { TUSK_NAME: vmname },
      });
    })
    .then(function () {
      return storage.exists(ref);
    })
    .finally(function () {
      if (opts.preserve) {
        console.error('VM is specified to be preserved.')
        return;
      }

      console.error('destroy');
      return vagrant.destroy(cwd, {
          env: { TUSK_NAME: vmname },
        })
        .then(function () {
          wrench.rmdirSyncRecursive(cwd);
          console.log('done');
        })
        .finally(function () {
          buildingState.delete(sha);
        })
    })
  });

  buildingState.set(sha, promise);

  return promise.nodeify(next);
}

exports.build = build;
exports.clean = clean;
exports.reset = reset;
