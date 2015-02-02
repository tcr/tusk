#!/usr/bin/env node

var wrench = require('wrench');
var fs = require('fs');
var spawn = require('child_process').spawn;
var Promise = require('bluebird');
var Set = require('es6-set');
var Map = require('es6-map');
var docopt = require('docopt').docopt;
var path = require('path');

var playbook = require('./playbook');
var vagrant = require('./vagrant');
var util = require('./util');

var root = path.join(__dirname, '/../vms');

function clean (sha) {
  var vm = path.join(root, sha);

  return Promise.promisify(fs.exists)(vm)
    .catch(function () {
      console.log('GCing', sha);
      return vagrant.destroy(vm)
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

function build (ref, next) {
  var sha = util.refSha(ref);
  var cwd = __dirname + '/../vms/' + sha;
  var play = playbook.generate(ref);

  if (isBuilding(ref)) {
    return buildingState.get(util.refSha(ref)).nodeify(next);
  }

  var promise = 
  Promise.promisify(playbook.status)(ref.id)
  .catch(function (err) {
    buildingState.delete(sha);
    return Promise.reject(new Error('Dependency for `' + ref.id + '` missing:\n' + err.message));
  })
  .then(function () {
    console.error('Starting build', sha);
    return clean(sha);
  })
  .then(function () {
    wrench.rmdirSyncRecursive(cwd, true);
    wrench.copyDirSyncRecursive(__dirname + '/../template', cwd)
    fs.writeFileSync(cwd + '/playbook.yml', play, 'utf-8');
  })
  .then(function () {
    console.log('up');
    return vagrant.up(cwd);
  })
  .then(function () {
    console.log('provision')
    return vagrant.provision(cwd);
  })
  .finally(function () {
    console.log('destroy');
    return vagrant.destroy(cwd)
      .then(function () {
        wrench.rmdirSyncRecursive(cwd);
        console.log('done');
      })
      .finally(function () {
        buildingState.delete(sha);
      })
  })
  .nodeify(next);

  buildingState.set(sha, promise);

  return promise;
}

// CLI

if (require.main === module) {
  var doc = '\
Usage: generate <id> [--input=<arg>]...\n\
\n\
Options:\n\
  -i, --input=<arg>      Input variable.';

  var opts = docopt(doc);

  // Parse args into ref spec
  var ref = {};
  opts['--input'].forEach(function (def) {
    var _ = def.split("="), k = _[0] || '', v = _[1] || '';
    ref[k] = v;
  });
  ref.id = opts['<id>'];

  // Reset, build, love
  reset(function (code) {
    build(ref, function (err) {
      console.log('Build process finished.');
      if (err) {
        console.error(err.message);
        process.on('exit', function () {
          process.exit(1);
        })
      }
    })
  });
}
