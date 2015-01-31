#!/usr/bin/env node

var fs = require('fs');
var crypto = require('crypto');
var yaml = require('js-yaml');

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('Usage: playbook.js name');
    process.exit(1);
  }

  var name = process.argv[2];
  console.log(generate(name));
}

function sha1 (value) {
  var shasum = crypto.createHash('sha1');
  shasum.update(value);
  return shasum.digest('hex');
}

function generate (name) {
  var sha = sha1(name);

  var setup = yaml.safeLoad(fs.readFileSync(__dirname + '/tusk_setup.yml'));
  var upload = yaml.safeLoad(fs.readFileSync(__dirname + '/tusk_upload.yml'));
  var openwrt = yaml.safeLoad(fs.readFileSync(__dirname + '/../plan/' + name + '.yml'));

  setup['hosts'] = 'all';

  return yaml.dump([
    setup,
    {
      "hosts": "all",
      "tasks": [].concat.apply([], (openwrt.build.dependencies || []).map(function (k) {
        k = String(k);
        return [
          {
            "name": "download " + k,
            "get_url": {
              "url": 'https://storage.googleapis.com/tusk/' + sha1(k) + '.tar.gz',
              "dest": '/tmp/' + k + '.tar.gz'
            },
          },
          {
            "name": "make " + k + " directory",
            "file": {
              "path": "/tusk/dependencies/" + k,
              "state": "directory",
            },
          },
          {
            "name": "extract " + k,
            "unarchive": {
              "src": "/tmp/" + k + ".tar.gz",
              "dest": "/tusk/dependencies/" + k,
              "copy": false,
            },
          }
        ];
      }))
    },
    {
      "hosts": "all",
      "tasks": openwrt.build.source ? (function (repo) {
        return [{
          "name": "download " + repo,
          "git": {
            "repo": repo.split("#")[0] || '',
            "dest": "/tusk/source",
            "recursive": false,
            version: repo.split('#')[1] || 'master',
          },
        }, {
          "name": "download " + repo,
          "git": {
            "repo": repo.split("#")[0] || '',
            "dest": "/tusk/source",
            "recursive": true,
            version: repo.split('#')[1] || 'master',
          },
        }];
      })(openwrt.build.source) : []
    },
    {
      "hosts": "all",
      "tasks": openwrt['build'].setup || [],
    },
    {
      "hosts": "all",
      "tasks": openwrt['build'].tasks || [],
    },
    {
      "hosts": "all",
      "sudo": true,
      "vars": {
        "sha": sha
      },
      "tasks": upload,
    },
  ])
}

exports.generate = generate;
