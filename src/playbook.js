var fs = require('fs');
var crypto = require('crypto');
var yaml = require('js-yaml');
var Map = require('es6-map');
var colors = require('colors/safe');
var stringify = require('json-stable-stringify');

var storage = require('./storage');
var Promise = require('bluebird');
var util = require('./util');
var config = require('./config');
var dependencies = require('./dependencies');

var bucket = 'technical-tusk';

/* pub */ function normalizeRef (ref) {
  if (ref.sha) {
    return Promise.resolve(ref);
  } else {
    return Promise.try(function () {
      var openwrt = config.getPlan(ref.id);
      var repo = openwrt.build.source;
      if (!repo) {
        return ref;
      }
      var source = typeof repo == 'string' ? repo : repo.repo;
      var commit = typeof repo == 'string' ? repo.split('#')[1] || 'master' : repo.commit;

      return util.getRepositoryRefs(source)
      .then(function (refs) {
        if (refs[commit]) {
          console.log('Matched', commit, 'to', refs[commit]);
          ref.sha = refs[commit];
        } else {
          ref.sha = commit;
        }

        return ref;
      })
    });
  }
}

/* pub */ function planSetupSha (ref) {
  var plan = config.getPlan(ref.id);
  delete plan.tasks;
  return util.sha1(stringify(plan));
}

/* pub */ function generate (ref, merge, winpass, zone, skipinit) {
  var sha = util.refSha(ref);
  console.log('Generating playbook for', ref);
  console.log('sha=', sha);

  var tusk_init = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_init.yml'));
  var setup = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_setup.yml'));
  var tusk_git = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_git.yml'));
  var upload = yaml.safeLoad(fs.readFileSync(__dirname + '/partial/tusk_upload.yml'));
  var openwrt = config.getPlan(ref.id);

  tusk_init['hosts'] = 'all';
  setup['hosts'] = 'all';

  var basevars = util.clone(ref);

  var iswindows = openwrt.build.image && openwrt.build.image.indexOf('windows') > -1;
  if (openwrt.build.image == 'localhost') {
    iswindows = true;
  }

  var skipsnapshot = true;

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

  var snaphash = planSetupSha(ref);

  if (openwrt.build.source) {
    var repo = openwrt.build.source;
    var source = typeof repo == 'string' ? repo : repo.repo;
    var commit = typeof repo == 'string' ? repo.split('#')[1] || 'master' : repo.commit;
  }

  // Override sha
  if (ref.sha) {
    commit = ref.sha;
  }

  return yaml.dump((skipinit ? [] : [
    tusk_init,
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
              "url": 'https://storage.googleapis.com/' + bucket + '/' + sha + '.tar.gz',
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
    skipsnapshot ? dummy() : {
      "hosts": "all",
      "gather_facts": false,
      "tasks": [
        {
          "name": "delete stale snapshot",
          "run": {
            "cmd": "gcloud compute snapshots delete tusk-snap-" + snaphash + " -q || true",
          }
        },
        {
          "name": "sync disk",
          "sudo": true,
          "run": {
            "cmd": "sync",
          }
        },
        {
          "name": "create snapshot",
          "run": {
            "cmd": 'gcloud compute disks snapshot tusk-' + sha + " --snapshot-name tusk-snap-" + snaphash + " --zone " + zone,
          },
        }
      ],
    },
  ]).concat([
    iswindows ? dummy() : {
      "hosts": "all",
      "gather_facts": false,
      "vars": util.clone(basevars),
      "tasks": openwrt.build.source ? [
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
        }
      ] : []
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
  ]).filter(function (group) {
    return (group.tasks && group.tasks.length) || (group.roles && group.roles.length);
  }))
}

exports.normalizeRef = normalizeRef;
exports.planSetupSha = planSetupSha;
exports.generate = generate;
