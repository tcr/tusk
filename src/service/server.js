var multiplex = require('multiplex');
var net = require('net')
var Doc = require('crdt').Doc
var Promise = require('bluebird');
var fs = require('fs');

var util = require('../util');
var build = require('../build');
var storage = require('../storage');
var quota = require('../quota');
var dependencies = require('../dependencies');
var Record = require('./record');
var rpackc = require('./rpackc');
var table = require('./datastore').table;

var records = {};

function jobOutput (id) {
  return records[id].createStream();
}

var rpcSpec = {
  'resources': function (rpc) {
    console.log('Querying resources');
    return quota.query({});
  },

  'job-list': function (rpc) {
    return Promise.resolve(table('jobs'));
  },

  'job-output': function (rpc, id) {
    return Promise.try(function () {
      return Promise.resolve(jobOutput(id));
    });
  },

  'build': function (rpc, ref) {
    console.log('Building.');
    // Need progress for each stream.

    var row = {
      ref: ref
    };

    var id = table('jobs').add(row)

    var sha = util.refSha(ref);
    records[id] = new Record(sha);
    var log = records[id].writeStream();
    log.write('[tusk] Build #' + id + ' started.\n');
    log.write('[tusk] SHA: ' + sha + '\n');

    build.build(ref, {
      logger: log,
    })
    .then(function (url) {
      console.error('Build process finished.');
      console.log(url);
    }, function (err) {
      console.error('Build process finished with error.');
      console.error(err.stack || err);
    })
    .finally(function () {
      log.write('[tusk] Build finished.\n');
      log.end();
      table('jobs').remove(row);
    })

    return Promise.resolve({
      id: id
    });
    // return dependencies.mapDependencies(ref, function (ref, deps) {
    //   console.log('Building', ref);
    //   console.log(deps.length ? 'Edge' : 'Leaf', ref);
    //   return build.build(ref, {
    //     preserve: false
    //   });
    // })
  },

  'cache': function (rpc, ref) {
    console.log('Querying cache', ref);
    return storage.exists(ref);
  },

  'dependencies': function (rpc, ref) {
    console.log('Querying dependencies', ref);
    return dependencies.getDependencies(ref)
    .then(function (tree) {
      var map = {};
      tree.map.forEach(function (value, id) {
        map[id] = value;
      })
      tree.map = map;
      return tree;
    });
  },
  

   //  build.reset()
    // .then(function () {
    //   console.log('done')
    //   rpc.call('gc:done');
    // })

    // // pipe dat stream
    // var ps = rpc.source.createStream('FS');
    // var rs = exports.record.createStream();
    // rs.pipe(ps);
    // // maybe? 
    // ps.once('finish', function () {
    //   rs.unpipe(ps);
    // });

    // ...later on...
    // console.log('start');
    // setTimeout(function () {
    //   exports.record.write('there');
    //   exports.record.write(' Tim.\n');
    //   exports.record.end();
    // }, 3000);
};

var A = new Doc()
var B = new Doc()
 
var server = net.createServer(function (stream) {
  console.log('Client connected.');

  var rpc = rpackc.create(rpcSpec);

  var plex = multiplex();
  // util.connect(plex.createStream('A'), A.createStream());
  util.connect(plex.createStream('rpc'), rpc);
  // util.connect(plex.createStream('B'), B.createStream());
  util.connect(stream, plex);

  rpc.source = plex;

  stream.on('error', function (err) {
    console.log(err.stack);
    // ignore errors on stream.
  });
  stream.on('close', function () {
    console.log('close')
    plex.unpipe(stream);
  })

  // var fs = require('fs');
  // var a = fs.createReadStream(__dirname + '/server.js');
  // var rs = exports.record.createStream();
  // var fs = plex.createStream('FS');
  // rs.pipe(fs);
  // stream.on('close', function () {
  //   rs.unpipe(fs);
  // })
  // a.on('end', function () {
  //   var a = fs.createReadStream(__dirname + '/rpackc.js');
  //   a.pipe(plex.createStream('FS'));
  // })
  // util.connect(plex.createStream('B'), B.createStream());

  // Have to write first to trigger stream
  rpc.call('start');
})

process.on('uncaughtException', function (err) {
  console.log('Uncaught exception:', err.stack);
})

console.log('Listening on 5555')
server.listen(5555);

var r = A.add({ hello: 'hi' })
var r2 = B.add({ hey: 'there' })

// setInterval(function () {
//   A.set(r.id, { date: new Date() })
//   B.set(r2.id, { date: new Date() })
// }, 2000);

