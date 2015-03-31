var spawn = require('child_process').spawn;
var yaml = require('js-yaml');
var Promise = require('bluebird');
var concat = require('concat-stream');

var util = require('./util');

function getDisks () {
  return new Promise(function (resolve, reject) {
    var p = spawn("gcloud", ["compute", "disks", "list", "--format", "yaml"]);
    p.stdout.pipe(concat(function (docs) {
      var res = [];
      yaml.safeLoadAll(docs, function (data) {
        res.push(data);
      });
      resolve(res);
    }));
    p.on('error', reject);
  });
}

function getInstances () {
  return new Promise(function (resolve, reject) {
    var p = spawn("gcloud", ["compute", "instances", "list", "--format", "yaml"]);
    p.stdout.pipe(concat(function (docs) {
      var res = [];
      yaml.safeLoadAll(docs, function (data) {
        res.push(data);
      });
      resolve(res);
    }));
    p.on('error', reject);
  });
}

function destroy (group, item) {
  return new Promise(function (resolve, reject) {
    var p = spawn('gcloud', ['compute', group, 'delete', item.name, '--zone', item.zone, '-q']);
    p.stdout.pipe(process.stdout);
    p.stderr.pipe(process.stderr);
    p.on('error', reject);
    p.on('exit', resolve);
  });
}

function getSnapshots () {
  return new Promise(function (resolve, reject) {
    var p = spawn("gcloud", ["compute", "snapshots", "list", "--format", "json"]);
    p.stdout.pipe(concat(function (docs) {
      resolve(JSON.parse(docs));
    }));
    p.on('error', reject);
  });
}

function call (command) {
  if (command == 'clean') {
    console.log('Finding instances...');
    getInstances()
    .then(function (insts) {
      console.log('Found instances...');
      var result = insts.filter(function (inst) {
        return inst.name.match(/^tusk\-/);
      })
      result.forEach(function (inst) {
        console.log('INSTANCES:', inst.name);
      })
      return Promise.map(result, destroy.bind(null, 'instances'));
    })
    .then(function () {
      console.log('Finding disks...');
      return getDisks();
    })
    .then(function (disks) {
      console.log('Found disks...');
      var result = disks.filter(function (disk) {
        return disk.name.match(/^tusk\-/);
      })
      result.forEach(function (disk) {
        console.log('DISK:', disk.name);
      })
      return Promise.map(result, destroy.bind(null, 'disks'));
    })
    .then(function () {
      console.log('cleanup done.');
    })
  } else if (command == 'snapshots') {
    getSnapshots()
    .then(function (snaps) {
      console.log(snaps);
    })
  } else if (command == 'start') {
    console.log('what');
  }
}

exports.call = call;
