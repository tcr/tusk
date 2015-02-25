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

/* pub */ function generate (ref, merge, winpass) {
  var sha = util.refSha(ref);
  console.log('Generating playbook for', ref);
  console.log('sha=', sha);

  var setup = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_setup.yml'));
  var tusk_git = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_git.yml'));
  var upload = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_upload.yml'));
  var openwrt = config.getPlan(ref.id);

  setup['hosts'] = 'all';

  var basevars = util.clone(ref);

  var iswindows = openwrt.build.image && openwrt.build.image.indexOf('windows') > -1;

  if (openwrt.build.image == 'localhost') {
    iswindows = true;
  }

  // TODO remove this
  function dummy () {
    return {
      'hosts': 'all',
      'tasks': [],
      "gather_facts": false,
    };
  }

  tusk_git['hosts'] = 'all';
  if (merge) {
    var merge_repo = merge && (merge.repo || openwrt.build.source);
    var merge_ref = merge && (merge.ref || 'master');

    console.error('Merging:', merge_repo, 'ref=' + merge_ref);

    tusk_git.vars = util.combine(basevars, {
      git_merge: {
        repo: merge_repo,
        ref: merge_ref,
      },
    });
  } else {
    console.error('No merging.');
  }

  return yaml.dump([
    iswindows ? dummy() : setup,
    iswindows ? dummy() : {
      "hosts": "all",
      "gather_facts": false,
      "vars": util.clone(basevars),
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
    iswindows ? dummy() : {
      "hosts": "all",
      "gather_facts": false,
      "vars": util.clone(basevars),
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
    iswindows ? dummy() : tusk_git,
    // TODO screen roles
    {
      "hosts": "all",
      "gather_facts": false,
      "vars": util.clone(basevars),
      "sudo": true,
      "roles": openwrt['build'].roles || [],
    },
    {
      "hosts": "all",
      "vars": util.clone(basevars),
      "tasks": openwrt['build'].setup || [],
    },
    {
      "hosts": "all",
      "vars": util.clone(basevars),
      "tasks": openwrt['build'].tasks || [],
    },
    {
      "hosts": "all",
      "sudo": !iswindows,
      "vars": util.combine(util.combine(basevars, {
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
