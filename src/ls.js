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

function yamlRef (ref) {
  if (Object.keys(ref).length < 2) {
    k = ref.id;
  } else {
    var hash = util.clone(ref);
    delete hash.id;
    k = {};
    k[ref.id] = hash;
  }
  return yaml.safeDump(k, { flowLevel: 1 }).trim();
}

/* pub */ function outputDependencyTree (tree, opts, next) {
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
        label: yamlRef(tree.root) + (cached.get(util.refSha(tree.root)) ? ' ' + colors.green('(cached)') : ''),
        nodes: (function nodes (sha) {
          return tree.graph.outgoingEdges[sha].map(function (depsha) {
            var ref = tree.map.get(depsha);
            var subnodes = nodes(depsha);
            var label = yamlRef(ref) + (cached.get(depsha) ? ' ' + colors.green('(cached)') : '');
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

exports.outputDependencyTree = outputDependencyTree;
