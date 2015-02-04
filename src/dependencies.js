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

function chartGraph (ref, hash, findDeps) {
  var done = new Map();
  done.set(hash(ref), ref);

  var connections = [];

  return (function loop (refs) {
    return Promise.map(refs, function (ref) {
        return findDeps(ref.id);
      })
      .then(function (results) {
        var remaining = [];
        results.forEach(function (result, i) {
          result.forEach(function (item) {
            connections.push([refs[i], item]);

            if (!done.has(hash(item))) {
              remaining.push(item);
              done.set(hash(item), item);
            }
          });
        });

        if (remaining.length) {
          return loop(remaining);
        }

        var nodes = [];
        done.forEach(function (item) {
          nodes.push(item);
        })

        return {
          nodes: nodes,
          edges: connections
        };
      });
    })([ref]);
}

function hasCycles (graph, root, hash) {
  return Promise.try(function () {
    var chain = {};
    var visited = {};
    (function DFS (root) {
      var name = hash(root);
      visited[name] = true;
      chain[name] = true;
      graph.edges.filter(function (edge) {
        return name == hash(edge[0])
      }).forEach(function (edge) {
        var edgeName = hash(edge[1]);
        if (!visited[edgeName]) {
          DFS(edge[1]);
        } else if (chain[edgeName]) {
          throw new Error('Cycle found: ' + JSON.stringify(edge[0]) + ' -> ' + JSON.stringify(edge[1]));
        }
      });
      chain[name] = false;
    })(root);
  });
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

function findConnections (graph, ref, hash) {
  return graph.edges.filter(function (edge) {
    return hash(edge[0]) == hash(ref);
  }).map(function (edge) {
    return edge[1];
  });
}

function filterGraph (graph, hash, filter) {
  var graphp = util.clone(graph);
  graph.nodes.forEach(function (node) {
    if (!filter(node)) {
      var remove = [node];
      while (remove.length) {
        node = remove.shift();
        graphp.nodes = graphp.nodes.filter(function (n2) {
          return hash(n2) != hash(node);
        });
        graphp.edges = graphp.edges.filter(function (edge) {
          if (hash(edge[0]) == hash(node)) {
            remove.push(edge[1]);
          } else if (hash(edge[1]) != hash(node)) {
            return true;
          }
          return false;
        });
      }
    }
  });
  return graphp;
}

function memoize (hash, fn) {
  var memo = new Map();
  return function self (arg) {
    if (memo.has(hash(arg))) {
      return memo.get(hash(arg));
    }

    var result = fn.call(self, arg);
    memo.set(hash(arg), result);
    return result;
  }
}




/* pub */ function mapDependencies (ref, build, next) {
  var hash = util.refSha;
  return chartGraph(ref, util.refSha, getImmediateDependencies)
  .then(function (graph) {
    return hasCycles(graph, ref, hash)
    .then(function () {
      return getCachedStatus(graph, hash)
    })
    .then(function (cache) {
      var pruned = filterGraph(graph, hash, function (node) {
        return cache.get(hash(node)).cached != true;
      })

      console.log(pruned.nodes);
      console.log(pruned.edges);

      // Create promises network.
      return memoize(hash, function (ref) {
        var connections = findConnections(pruned, ref, util.refSha);
        return Promise.all(connections.map(this)).then(function () {
          return build(ref, connections);
        });
      })(ref);
    })
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
exports.getDependencies = getDependencies;
exports.mapDependencies = mapDependencies;
