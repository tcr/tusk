var fs = require('fs');
var crypto = require('crypto');
var yaml = require('js-yaml');
var Map = require('es6-map');
var colors = require('colors/safe');
var DepGraph = require('dependency-graph').DepGraph;

var storage = require('./storage');
var Promise = require('bluebird');
var util = require('./util');
var config = require('./config');
var graphs = require('./graphs');

/* pub */ function dependencyRef (k) {
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

/* pub */ function getImmediateDependencies (id, next) {
  return Promise.try(function () {
    return ((config.getPlan(id).build || {}).dependencies || []).map(dependencyRef);
  })
  .nodeify(next);
}

function getCachedStatus (graph, hash) {
  return Promise.map(graph.nodes, function (ref) {
    return storage.isCached(ref)
  })
  .then(function (results) {
    return new Map(results.map(function (result, i) {
      return [hash(graph.nodes[i]), result]
    }));
  });
}

/* pub */ function listDependencies (ref, next) {
  var hash = util.refSha;
  return graphs.chartGraph(ref, hash, getImmediateDependencies)
  .then(function (graph) {
    return graphs.hasCycles(graph, ref, hash)
    .then(function () {
      return graph;
    })
  })
  .nodeify(next);
}

/* pub */ function filterCached (graph, next) {
  var hash = util.refSha;
  return getCachedStatus(graph, hash)
  .then(function (cache) {
    return graphs.filterGraph(graph, hash, function (node) {
      return cache.get(hash(node)).cached != true;
    })
  })
  .nodeify(next);
}

/* pub */ function order (graph) {
  return graphs.descendents(graph, graph.nodes[0], util.refSha)
}

/* pub */ function mapDependencies (ref, build, next) {
  var hash = util.refSha;
  return listDependencies(ref)
  .then(function (graph) {
    return filterCache(graph)
  })
  .then(function (graph) {
    // Create promises network.
    return util.memoize(hash, function (ref) {
      var connections = graphs.findConnections(pruned, ref, util.refSha);
      return Promise.all(connections.map(this)).then(function () {
        return build(ref, connections);
      });
    })(ref);
  })
  .nodeify(next);
}

/* pub */ function getDependencies (ref, next) {
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

exports.dependencyRef = dependencyRef;
exports.getImmediateDependencies = getImmediateDependencies;
exports.listDependencies = listDependencies;
exports.filterCached = filterCached;
exports.order = order;

// deprecated
exports.getDependencies = getDependencies;
exports.mapDependencies = mapDependencies;
