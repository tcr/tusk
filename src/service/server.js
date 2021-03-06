var multiplex = require('multiplex');
var net = require('net')
var Doc = require('crdt').Doc
var Promise = require('bluebird');
var fs = require('fs');
var humanizeDuration = require("humanize-duration")

var util = require('../util');
var build = require('../build');
var storage = require('../storage');
var config = require('../config');
var quota = require('../quota');
var dependencies = require('../dependencies');
var playbook = require('../playbook');
var Record = require('./record');
var rpackc = require('./rpackc');
var store = require('./datastore');

var currentjobs = {};

function jobOutput (id) {
  return currentjobs[id].record.createStream();
}


var currentAllocator = Promise.resolve();
function allocator (ref, opts) {
  return currentAllocator = currentAllocator
  .then(function () {
    return build.allocate(ref, opts)
  });
}

// var joblock = false;
// setInterval(function () {
//   if (joblock) {
//     return;
//   }
//   var row = table('jobs').filter(function (item) {
//     return item.finished == false;
//   })[0];
//   var id = table('jobs').indexOf(row);
//   if (!row) {
//     return;
//   }

//   joblock = true;
//   jobhandle(row, id)
//   .finally(function () {
//     joblock = false;
//   })
// }, 1000);

// function buildjob (ref) {
//   return dependencies.listDependencies(ref)
//   // .then(function (graph) {
//   //  return deps.filterCached(graph);
//   // })
//   .then(function (graph) {
//     console.log('adding', graph)

//     var id;
//     dependencies.order(graph).forEach(function (entry) {
//       console.log(entry);
//       id = table('jobs').add({
//         ref: entry.ref,
//         dependencies: entry.dependencies,
//         finished: false,
//       })
//     })

//     return Promise.resolve({
//       id: id
//     });
//   })
// }

function addjob (ref, merge, force) {
  return store.create('Job', {
    ref: ref,
    finished: false,
    error: false,
    force: force || false,
    start: Date.now(),
    end: null,
    merge: merge,
    dependencies: [],
  });
}

function jobhandle (id) {
  return store.find('Job', id)
  .then(function (row) {
    console.log('Consuming job #' + id, row.get());

    var sha = util.refSha(row.ref);
    var record = new Record(sha);
    var log = record.writeStream();

    log.write('[tusk] Build #' + id + ' started.\n');
    log.write('[tusk] Build sha: ' + sha + '\n');
    log.write('[tusk] Build ref: ' + JSON.stringify(row.ref) + '\n');

    console.log('1.');

    currentjobs[id] = {
      record: record,
      log: log,
      promise: promise,
    }

    var promise = Promise.resolve()
    .cancellable()
    .then(function () {
      console.log('2.');
      console.log('Check cache.');
      // Check cache
      return storage.isCached(row.ref)
    })
    .then(function (cache) {
      console.log('Got dat cache', cache);
      if (cache.cached && !row.force) {
        log.write('[tusk] Build cached and complete.\n');
        log.end();
        row.finished = true;
        return;
      }

      console.log('finding deps');
      log.write('[tusk] Finding dependencies...\n');
      return dependencies.getImmediateDependencies(row.ref.id)
      .then(function (deps) {
        // Adds dependencies
        console.log('Checking deps:', deps);
        log.write('[tusk] Awaiting and adding dependencies...\n');
        deps.forEach(function (dep) {
          log.write('[tusk] - ' + JSON.stringify(dep) + '\n');
        })

        return Promise.map(deps, function (dep) {
          addjob(dep, null)
          .then(function (job) {
            row.dependencies.push(job.id);
            return jobhandle(job.id);
          })
        })
      })
      .then(function (deps) {
        console.log('Deps completed for', row.ref, '.');
        if (deps.length) {
          log.write('[tusk] Dependencies forked.\n');
        } else {
          log.write('[tusk] No dependencies required.\n');
        }

        return allocator(row.ref, {
          logger: log,
          merge: row.merge,
        })
      })
      .then(function () {
        return build.execute(row.ref, {
          logger: log,
          preserve: true,
        });
      })
      .catch(Promise.CancellationError, function (err) {
        console.log('Build cancelled!')
        throw err;
      })
      .then(function (url) {
        console.error('Build process finished.');
        console.log(url);
      }, function (err) {
        console.error('Build process finished with error.');
        console.error(err.stack || err);
        row.error = err.stack;
        return row.save();
      })
      .finally(function () {
        row.end = Date.now();
        row.finished = true;

        console.log('Build finished.');
        log.write('[tusk] Build finished.\n');
        log.write('[tusk] Elapsed time: ' + humanizeDuration(row.end - row.start) + '\n');
        log.end();
        
        // table('jobs').remove(row);
        return row.save();
      });
    })
    .catch(function (err) {
      console.error('ERROR', err);
    })
  });
}

var rpcSpec = {
  'resources': function (rpc) {
    console.log('Querying resources');
    return quota.query({});
  },

  'job-cancel': function (rpc, job) {
    try {
      if (currentjobs[job.id]) {
        console.log('Cancelling', job.id);
        currentjobs[job.id].log.write('\n\n[tusk] Job cancelled!\n');
        currentjobs[job.id].promise.cancel();
      }
    } catch (err) {
      console.error(err);
    }
    return Promise.resolve('cool');
  },

  'job-delete': function (rpc, job) {
    return store.destroy('Job', {
      where: {
        id: job.id
      }
    });
  },

  'job-artifact': function (rpc, id) {
    return store.find('Job', id)
    .then(function (row) {
      return storage.isCached(row.ref);
    }, function () {
      return Promise.reject(new Error('Job not found.'));
    });
  },

  'job-list': function (rpc) {
    return store.findAll('Job')
    .then(function (jobs) {
      var out = {};
      jobs.forEach(function (job) {
        out[job.id] = job.toJSON();
      });
      return out;
    });
  },

  'job-output': function (rpc, id) {
    return Promise.try(function () {
      return Promise.resolve(jobOutput(id));
    });
  },

  'build': function (rpc, opts) {
    console.log('Building.');
    // Need progress for each stream.

    if (!opts.ref) {
      return Promise.reject(new Error('No ref specified.'));
    }

    return playbook.normalizeRef(opts.ref)
    .then(function (ref) {
      return addjob(ref, opts.merge, true)
      .then(function (row) {
        setImmediate(jobhandle, row.id);
        return Promise.resolve({
          id: row.id,
        });
      });
    });

    // var id = table('jobs').add({
    //   ref: ref,
    //   dependencies: [],
    //   finished: false,
    // });
    
    // return dependencies.mapDependencies(ref, function (ref, deps) {
    //   console.log('Building', ref);
    //   console.log(deps.length ? 'Edge' : 'Leaf', ref);
    //   return build.build(ref, {
    //     preserve: false
    //   });
    // })
  },

  'target-plan': function (rpc, ref) {
    return Promise.try(function () {
      return config.getPlan(ref.id);
    });
  },

  'cache': function (rpc, ref) {
    console.log('Querying cache', ref);
    return Promise.try(function () {
      return storage.isCached(ref);
    });
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

  'die': function (rpc, ref) {
    console.log('DEATH REQUESTED');
    setTimeout(function () {
      console.log('DYING');
      process.exit(1);
    }, 5000);
    return Promise.resolve({});
  },

  'clean': function (rpc, ref) {
    console.log('Resetting all');
    return build.reset({
      logger: process.stderr
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

