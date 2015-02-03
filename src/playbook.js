#!/usr/bin/env node

var fs = require('fs');
var crypto = require('crypto');
var yaml = require('js-yaml');
var Map = require('es6-map');
var colors = require('colors/safe');

var storage = require('./storage');
var Promise = require('bluebird');
var util = require('./util');
var config = require('./config');

function getPlan (name) {
  return yaml.safeLoad(fs.readFileSync(__dirname + '/../plan/' + name + '.yml'));
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
    return ref;
  }
}

function getImmediateDependencies (id, next) {
  return Promise.try(function () {
    return ((getPlan(id).build || {}).dependencies || []).map(dependencyRef);
  })
  .nodeify(next);
}

function getDependencies (ref, next) {
  var DepGraph = require('dependency-graph').DepGraph;
  var graph = new DepGraph();
  var refmap = new Map();

  var sha = util.refSha(ref);
  refmap.set(sha, ref);
  graph.addNode(sha);

  var hash = {};
  hash[sha] = getImmediateDependencies(ref.id);

  return (function loop (hash) {
    return Promise.props(hash)
    .then(function (results) {
      var hash2 = {};
      Object.keys(results).forEach(function (key) {
        results[key].forEach(function (dep) {
          var sha = util.refSha(dep);
          if (!graph.hasNode(sha)) {
            hash2[sha] = getImmediateDependencies(dep.id);
            refmap.set(sha, dep);
            graph.addNode(sha);
          }
          graph.addDependency(key, sha);
        });
      });
      if (Object.keys(hash2).length) {
        return loop(hash2);
      }
      return {
        root: ref,
        graph: graph,
        map: refmap,
      };
    });
  })(hash)
  .nodeify(next);
}

function yamlRef (ref) {
  if (Object.keys(ref).length < 2) {
    k = ref.id;
  } else {
    var hash = util.clone(ref);
    delete hash.id;
    k = {};
    k[ref.id] = hash;
  }
  return yaml.safeDump(k).trim();
}

function outputDependencyTree (tree, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  var start;
  if (opts.detail) {
    var hash = {};
    Object.keys(tree.graph.nodes).forEach(function (sha) {
      hash[sha] = storage.exists(tree.map.get(sha))
        .catch(function () {
          return Promise.resolve(null);
        });
    });

    start = Promise.props(hash)
      .then(function (results) {
        var cached = new Map();
        Object.keys(results).forEach(function (key) {
          cached.set(key, !!results[key]);
        });
        return cached;
      })
  } else {
    start = Promise.resolve(new Map());
  }

  return start
    .then(function (cached) {
      // Convert graph to tree
      var arch = {
        label: yamlRef(tree.root).replace(/(\n|$)/, cached.get(util.refSha(tree.root)) ? colors.green(' # cached') + '$1' : '$1'),
        nodes: (function nodes (sha) {
          return tree.graph.outgoingEdges[sha].map(function (depsha) {
            var ref = tree.map.get(depsha);
            var subnodes = nodes(depsha);
            var label = yamlRef(ref).replace(/(\n|$)/, cached.get(depsha) ? colors.green(' # cached') + '$1' : '$1');
            return subnodes.length
              ? { label: label, nodes: subnodes }
              : label;
          });
        })(util.refSha(tree.root)),
      }
      return require('archy')(arch).trim();
    })
    .nodeify(next);
}

function status (id, next) {
  Promise.map(getImmediateDependencies(id), function (ref) {
    console.log(' - checking for', ref);
    return storage.exists(ref);
  }).nodeify(next);
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

exports.status = status;
exports.generate = generate;
exports.getDependencies = getDependencies;
exports.outputDependencyTree = outputDependencyTree;
