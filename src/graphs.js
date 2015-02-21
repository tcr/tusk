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

function dfs (graph, root, hash) {
  var chain = {};
  var visited = {};
  var resulthash = [];
  var results = [];
  return (function DFS (root) {
    var name = hash(root);
    visited[name] = true;
    chain[name] = true;
    var children = [];
    graph.edges.filter(function (edge) {
      return name == hash(edge[0])
    }).forEach(function (edge) {
      var edgeName = hash(edge[1]);
      if (!visited[edgeName]) {
        DFS(edge[1]);
      } else if (chain[edgeName]) {
        throw new Error('Cycle found: ' + JSON.stringify(edge[0]) + ' -> ' + JSON.stringify(edge[1]));
      }
      children.push(edge[1]);
    });
    chain[name] = false;
    if (resulthash.indexOf(name) === -1) {
      resulthash.push(name);
      results.push({
        ref: root,
        dependencies: children
      });
    }
    return results;
  })(root);
}

function hasCycles (graph, root, hash) {
  return Promise.try(function () {
    dfs(graph, root, hash);
  });
}

function findConnections (graph, ref, hash) {
  return graph.edges.filter(function (edge) {
    return hash(edge[0]) == hash(ref);
  }).map(function (edge) {
    return edge[1];
  });
}

function descendents (graph, ref, hash) {
  return dfs(graph, ref, hash);
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

exports.chartGraph = chartGraph;
exports.hasCycles = hasCycles;
exports.findConnections = findConnections;
exports.descendents = descendents;
exports.filterGraph = filterGraph;
