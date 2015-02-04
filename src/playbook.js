var fs = require('fs');
var crypto = require('crypto');
var yaml = require('js-yaml');
var Map = require('es6-map');
var colors = require('colors/safe');

var storage = require('./storage');
var Promise = require('bluebird');
var util = require('./util');
var config = require('./config');
var dependencies = require('./dependencies');

/* pub */ function generate (ref) {
  var sha = util.refSha(ref);
  console.log('Generating playbook for', ref);
  console.log('sha=', sha);

  var setup = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_setup.yml'));
  var upload = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_upload.yml'));
  var openwrt = config.getPlan(ref.id);

  setup['hosts'] = 'all';

  return yaml.dump([
    setup,
    {
      "hosts": "all",
      "vars": util.clone(ref),
      "tasks": [].concat.apply([], (openwrt.build.dependencies || []).map(function (k) {
        var ref = dependencies.dependencyRef(k);
        var sha = util.refSha(ref);

        console.error('(ref:', ref, ')');
        return [
          {
            "name": "download " + ref.id,
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
          "sudo": true,
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
    // TODO screen roles
    {
      "hosts": "all",
      "vars": util.clone(ref),
      "sudo": true,
      "roles": openwrt['build'].roles || [],
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
      "vars": util.combine(util.combine(ref, {
        "sha": sha
      }), {
        gs_access_key: config.read().gstorage.key,
        gs_secret_key: config.read().gstorage.secret,
      }),
      "tasks": upload,
    },
  ])
}

exports.generate = generate;
