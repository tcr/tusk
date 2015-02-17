var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;

var util = require('./util');

function up (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['up', '--provider=google', '--no-provision', '--color'], {
      cwd: cwd,
      env: util.combine(process.env, opts.env || {}),
    });

    if (opts.logger) {
      p.stdout.pipe(opts.logger, { end: false });
      p.stderr.pipe(opts.logger, { end: false });
    }

    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error code in vagrant up: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  .nodeify(next);
}

// var router = new EventEmitter();

// var collected = new Buffer(0);

// router.on('data', function (data) {
//   if (!Buffer.isBuffer(data)) {
//     data = new Buffer(data, 'utf-8');
//   }
//   console.log(data);
//   collected = Buffer.concat([collected, data]);
//   writer.send('id0/update', data);
// });

// var rpackc = require('./rpackc');
// var writer = rpackc.create();
// writer.listen(5566);
// writer.use({
//   'request-full': function (data) {
//     console.log('fullreq');
//     writer.send('id0/full', collected);
//   },
// });



// function Record (stream) {
//   // how to propagate stream over RPC to reconnecting element
//   remote should reconnect from starting point

//   --> starting timestamp
//   <-- request back history
//   --> event... (ignored)
//   --> back history
//   --> event...
//   --> event...
// }



function provision (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['provision', '--color'], {
      cwd: cwd,
      env: util.combine(process.env, opts.env || {}),
    });

    if (opts.logger) {
      p.stdout.pipe(opts.logger, { end: false });
      p.stderr.pipe(opts.logger, { end: false });
    }

    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error in vagrant provision: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  .nodeify(next);
}

function destroy (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return new Promise(function (resolve, reject) {
    var p = spawn('vagrant', ['destroy', '-f', '--color'], {
      cwd: cwd,
      env: util.combine(process.env, opts.env || {}),
    });

    if (opts.logger) {
      p.stdout.pipe(opts.logger, { end: false });
      p.stderr.pipe(opts.logger, { end: false });
    }

    p.on('error', reject);
    p.on('exit', function (code) {
      code == 0
        ? resolve()
        : reject(new Error('Error in vagrant destroy: ' + String(code) + '\ncwd: ' + cwd));
    });
  })
  // TODO remove this timeout when vagrant-google waits properly
  .delay(15*1000)
  .nodeify(next);
}

exports.up = up;
exports.provision = provision;
exports.destroy = destroy;
