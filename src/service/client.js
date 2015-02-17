var reconnect = require('reconnect-net');
var multiplex = require('multiplex');
var net = require('net')
var Doc = require('crdt').Doc
var Promise = require('bluebird');
var Map = require('es6-map')

var Record = require('./record');
var rpackc = require('./rpackc');
var util = require('../util');
var ls = require('../ls');
 
// var A = new Doc();
// A.on('row_update', function (row) {
//   console.log('A', row.toJSON());
// });

// var B = new Doc();
// B.on('row_update', function (row) {
//   console.log('B', row.toJSON());
// });

function connect () {
  var rpc = rpackc.create({
    'hello': function () {
      console.log('hello');
    },
    'gc:done': function () {
      console.log('GC terminated.');
    },
  });

  var plex = multiplex();
  util.connect(plex.remoteStream('rpc'), rpc);

  var client = reconnect(function (stream) {
    util.connect(stream, plex, false);

    console.log('Connected to server.');
  }).connect(5555);

  // client.on('disconnect', function () {
  //   console.log('Waiting for server...');
  // })

  return {
    rpc: rpc,
    plex: plex,
  }
}

// rpc.request('build', { id: 'openwrt' })
// .then(function (tree) {
//   var map = new Map();
//   for (var name in tree.map) {
//     map.set(name, tree.map[name]);
//   }
//   tree.map = map;

//   ls.outputDependencyTree(tree, {
//     detail: false
//   })
//   .then(function (art) {
//     console.log(art);
//   });
// })
// .catch(function (err) {
//   console.log('ERROR', err);
// })

// var out = connect()
// out.rpc.request('read')
// .then(function (stream) {
//   stream.pipe(process.stdout);
// })

function build (rpc) {
  rpc.request('build', { id: 'openwrt' })
  .then(function (stream) {
    console.error('Build process started.', stream);
    plex.remoteStream(stream).pipe(process.stderr);
  }, function (err) {
    console.error('Build process finished with error.');
    console.error(err);
  })
  .then(function () {
    // client.disconnect();
  })
}

// setInterval(function () {
//   A.set('hello', { date: new Date() })
//   rpc.call('hello', 'hey');
// }, 2000);

exports.connect = connect;
