var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;
var psTree = require('ps-tree');

var util = require('./util');

function killGroup (pid, int) {
  return new Promise(function (resolve, reject) {
    psTree(pid, function (err, children) {
      var p = spawn('kill', ['-' + int].concat(children.map(function (p) {
        return p.PID
      })));
      p.on('error', reject);
      p.on('exit', resolve);
    });
  });
}

function run (args, name, cwd, opts) {
  var p = spawn(args[0], args.slice(1), {
    cwd: cwd,
    env: util.combine(process.env, opts.env || {}),
  });

  var alive = true;
  var killing = false;

  return new Promise(function (resolve, reject) {
    if (args[1] == 'up' || args[1] == 'destroy') {
      p.stdout.pipe(process.stdout, {end:false})
      p.stderr.pipe(process.stderr, {end:false})
    }
    if (opts.logger) {
      p.stdout.pipe(opts.logger, { end: false });
      p.stderr.pipe(opts.logger, { end: false });
    }

    p.on('error', function (err) {
      console.log('error');
      if (!killing) {
        console.log(error);
        reject(err);
      }
    });
    p.on('exit', function (code) {
      if (!killing) {
        alive = false;
        code == 0
          ? resolve()
          : reject(new Error('Error in ' + name + ': ' + String(code) + '\ncwd: ' + cwd));
      }
    });
  })
  .cancellable()
  .catch(Promise.CancellationError, function (err) {
    console.log('Do cancel?', alive, name);
    killing = true;
    if (alive) {
      var promise = new Promise(function (reject, resolve) {
        console.log('killing', name);
        try {
          p.once('exit', function () {
            console.log('killed!', name)
            reject('fine')
          });
          killGroup(p.pid, 'SIGINT');
        } catch (e) {
          console.error('WHAT THE FACK', e);
        }
      });
      return promise;
    } else {
      return Promise.reject(err);
    }
  })
}

/* pub */ function up (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return run(['vagrant', 'up', '--provider=' + opts.provider, '--no-provision', '--color'], 'vagrant up', cwd, opts)
  .nodeify(next);
}

/* pub */ function provision (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};

  return run(['vagrant', 'provision', '--color'], 'vagrant provision', cwd, opts)
  .nodeify(next);
}

/* pub */ function destroy (cwd, opts, next) {
  if (typeof opts == 'function') {
    next = opts;
    opts = {};
  }
  opts = opts || {};
  
  return run(['vagrant', 'destroy', '-f', '--color'], 'vagrant destroy', cwd, opts)
  // TODO remove this timeout when vagrant-google waits properly
  .delay(15*1000)
  .nodeify(next);
}

exports.up = up;
exports.provision = provision;
exports.destroy = destroy;
