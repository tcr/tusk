#!/usr/bin/env node

var fs = require('fs');
var crypto = require('crypto');
var yaml = require('js-yaml');
var check = require('./check');
var Promise = require('bluebird');
var util = require('./util');

function getPlan (name) {
  return yaml.safeLoad(fs.readFileSync(__dirname + '/../plan/' + name + '.yml'));
}

function status (name, next) {
  var deps = (getPlan(name).build || {}).dependencies || [];
  Promise.map(deps, function (dep) {
    return Promise.promisify(check.check)(dep);
  }).nodeify(next);
}

function dependencyRef (k) {
  if (typeof k == 'string') {
    return {id: k};
  } else {
    var id = Object.keys(k).pop();
    var ref = {};
    Object.keys(k[id]).forEach(function (key) {
      ref[key] = String(k[id][key]);
    })
    ref.id = id;
    return name;
  }
}

function generate (ref) {
  var sha = util.refSha(ref);
  console.log('Generating playbook for', ref);
  console.log('sha=', sha);

  var setup = yaml.safeLoad(fs.readFileSync(__dirname + '/tusk_setup.yml'));
  var upload = yaml.safeLoad(fs.readFileSync(__dirname + '/tusk_upload.yml'));
  var openwrt = getPlan(ref.id);

  setup['hosts'] = 'all';

  return yaml.dump([
    setup,
    {
      "hosts": "all",
      "vars": util.clone(ref),
      "tasks": [].concat.apply([], (openwrt.build.dependencies || []).map(function (k) {
        var ref = dependencyRef(k);
        var sha = util.refSha(ref);

        console.error('(ref:', ref, ')');
        return [
          {
            "name": "download " + k.id,
            "get_url": {
              "url": 'https://storage.googleapis.com/tusk/' + sha + '.tar.gz',
              "dest": '/tmp/' + sha + '.tar.gz'
            },
          },
          {
            "name": "make " + ref.id + " directory",
            "file": {
              "path": "/tusk/dependencies/" + ref.id,
              "state": "directory",
            },
          },
          {
            "name": "extract " + ref.id,
            "unarchive": {
              "src": "/tmp/" + sha + ".tar.gz",
              "dest": "/tusk/dependencies/" + ref.id,
              "copy": false,
            },
          }
        ];
      }))
    },
    {
      "hosts": "all",
      "vars": util.clone(ref),
      "tasks": openwrt.build.source ? (function (repo) {
        var source = typeof repo == 'string' ? repo : repo.repo;
        var commit = typeof repo == 'string' ? repo.split('#')[1] || 'master' : repo.commit;
        return [
        {
          "name": "require git",
          "apt": "name=git",
        },
        {
          "name": "download " + source + '#' + commit,
          "git": {
            "repo": source,
            "dest": "/tusk/source",
            "recursive": false,
            version: commit,
          },
        }, {
          "name": "download " + source + '#' + commit,
          "git": {
            "repo": source,
            "dest": "/tusk/source",
            "recursive": true,
            version: commit,
          },
        }];
      })(openwrt.build.source) : []
    },
    {
      "hosts": "all",
      "vars": util.clone(ref),
      "tasks": openwrt['build'].setup || [],
    },
    {
      "hosts": "all",
      "vars": util.clone(ref),
      "tasks": openwrt['build'].tasks || [],
    },
    {
      "hosts": "all",
      "sudo": true,
      "vars": util.combine(ref, {
        "sha": sha
      }),
      "tasks": upload,
    },
  ])
}

exports.status = status;
exports.generate = generate;

// CLI

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('Usage: playbook.js name');
    process.exit(1);
  }

  var name = process.argv[2];

  // Parse args
  var input = {};
  for (var i = 0; i < process.argv.length; i++) {
    if (process.argv[i] == '-i') {
      var def = process.argv[++i];
      if (def && def.indexOf("=") > -1) {
        var _ = def.split("="), k = _[0], v = _[1];
        input[k] = v;
      }
    }
  }

  console.log(generate(name, input));
}
