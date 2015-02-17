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
var config = require('./config');
var storage = require('./storage');
var quota = require('./quota');
var dependencies = require('./dependencies');


var root = path.join(__dirname, '/../vms');

function vagrantenv (sha, zone) {
  var conf = config.read();
  return [
    'TUSK_NAME=tusk-' + sha,
    'TUSK_PROJECT_ID=' + conf.gcloud.project_id,
    'TUSK_CLIENT_EMAIL=' + conf.gcloud.client_email,
    'TUSK_ZONE=' + zone,
  ].join('\n');
}

/* pub */ function clean (sha, opts) {
  opts = opts || {};

  var vm = path.join(root, sha);

  return Promise.promisify(fs.exists)(vm)
  .catch(function () {
    console.log('GCing', sha);
    return vagrant.destroy(vm, opts)
    .then(function (oh) {
      console.log('ok');
      return Promise.promisify(wrench.rmdirRecursive)(vm);
    });
  })
}

/* pub */ function reset (opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }

  wrench.mkdirSyncRecursive(root);
  return Promise.map(fs.readdirSync(root), function (sha) {
    return clean(sha, opts);
  })
  .nodeify(next);
}

var buildingState = new Map();


function isBuilding (ref) {
  return buildingState.has(util.refSha(ref))
}

// Allocation locks around a promise so resource
// allocation can happen without conflict.

function buildStatus (id, next) {
  return Promise.map(dependencies.getImmediateDependencies(id), function (ref) {
    console.log(' - checking for', ref);
    return storage.exists(ref);
  })
  .nodeify(next);
}

function allocate (ref, opts) {
  var sha = util.refSha(ref);
  var cwd = __dirname + '/../vms/' + sha;
  var play = playbook.generate(ref, opts.merge);

  return Promise.resolve()
  .cancellable()
  .then(function () {
    return buildStatus(ref.id)
  })
  .catch(function (err) {
    buildingState.delete(sha);
    return Promise.reject(new Error('Dependency for `' + ref.id + '` missing:\n' + err.message));
  })
  .then(function () {
    console.error('Starting build', sha);

    return clean(sha)
    .cancellable()
    .then(function () {
      wrench.rmdirSyncRecursive(cwd, true);
      wrench.copyDirSyncRecursive(__dirname + '/../template', cwd)
      fs.writeFileSync(cwd + '/playbook.yml', play, 'utf-8');
    })
    .then(function () {
      console.error('Seeking resources...');
      return Promise.promisify(quota.query)({ cores: 16 })
    })
    .then(function (targets) {
      if (targets.length == 0) {
        return Promise.reject(new Error('No target found to run build.'));
      }

      var target = targets[0];
      var zone = target.gcloud.region + '-' + target.gcloud.zone;
      console.log('targeting', zone);
      fs.writeFileSync(cwd + '/.env', vagrantenv(sha, zone), 'utf-8');
    })
    .then(function () {
      console.log('up');
      return vagrant.up(cwd, opts);
    })
  });
}

/* pub */ function build (ref, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  var sha = util.refSha(ref);
  var cwd = __dirname + '/../vms/' + sha;

  var promise = allocate(ref, opts)
  .then(function () {
    console.log('provision')
    return vagrant.provision(cwd, opts);
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
    return vagrant.destroy(cwd, opts)
    .then(function () {
      wrench.rmdirSyncRecursive(cwd);
      console.log('done');
    })
    .finally(function () {
      buildingState.delete(sha);
    })
  });

  buildingState.set(sha, promise);

  return promise.nodeify(next);
}

exports.build = build;
exports.clean = clean;
exports.reset = reset;
