var path = require('path');
var yaml = require('js-yaml');
var fs   = require('fs');
var cp = require('child_process');
var msgpack = require('msgpack')
var nano = require('nanomsg');
var myip = require('my-ip');
var docopt = require('docopt');
var crypto = require('crypto');
var shellescape = require('shell-escape');

var rpackc = require('./rpackc');

function setResendInterval (socket, timeout) {
  var nn = nano._bindings;
  socket.setsockopt(nn.NN_REQ, nn.NN_REQ_RESEND_IVL, timeout);
}

function requestServer (name, onallocation) {
  var socket = nano.socket('req');
  setResendInterval(socket, 5*60*1000);

  socket.once('message', function (data) {
    var result = msgpack.unpack(data);
    socket.close()

    onallocation(!result.status, result.connection);
  })

  socket.connect('tcp://' + myip(null, false) + ':5858');
  socket.send(msgpack.pack(name));
}

function readPlan (plan) {
  return yaml.safeLoad(fs.readFileSync(path.join('./plan', plan + '.yaml'), 'utf8')) || {};
}

function sha1 (value) {
  var shasum = crypto.createHash('sha1');
  shasum.update(value);
  return shasum.digest('hex');
}

function build (addr, plan, opts, onresult) {
  if (!onresult) {
    onresult = opts;
    opts = {};
  }

  var env = opts.env || {};
  var prompt = opts.prompt;

  if (!addr) {
    throw new Error('Expected connection address, received ' + String(addr));
  }

  // Get document, or throw exception on error
  var planyaml = readPlan(plan);
  var steps = planyaml.build || [];

  console.log(arguments)

  var rpc = rpackc.connect('pair', addr.replace('localhost', myip(null, false)));
  rpc.getStream('out').pipe(process.stdout);
  rpc.getStream('err').pipe(process.stderr);

  rpc.keepalive(3000);

  var input = planyaml.input || {};
  var inputcmds = Object.keys(input).map(function (key) {
    return shellescape(['echo', input[key]]) + ' | ' + shellescape(['tee', '/tusk/input/' + key]);
  });

  var deps = planyaml.dependencies || {};
  var depcmds = Object.keys(deps).map(function (key) {
    return shellescape(['echo', 'https://storage.googleapis.com/tusk/' + sha1(key) + '.tar.gz']) +
      ' | ' +
      shellescape(['tee', '/tusk/dependencies/' + key]);
  });

  var download = null, exitcode = 0;

  var exitState = {
    'exit': function (rpc, result) {
      console.log('exit');
      rpc.close();
      onresult(exitcode, download);
    },
  };

  var initialState = {
    'start': function (rpc) {
      rpc.send('process_start', {
        commands: [
          'sudo mkdir -p /tusk && sudo chown -R $USER /tusk',
          'mkdir -p /tusk/input',
          'mkdir -p /tusk/result',
          'mkdir -p /tusk/dependencies',
        ].concat(inputcmds, depcmds),
        env: {}
      });
    },
    'process_exit': function (rpc, ret) {
      rpc.use(planState, exitState);

      if (ret.code) {
        rpc.send('exit');
      } else {
        rpc.send('process_start', {
          commands: steps,
          env: env
        });
      }
    },
  };

  var planState = {
    'command_enter': function (rpc, ret) {
      console.log('$', ret.cmd);
    },
    'command_exit': function (rpc, ret) {
      console.log('% (exit code %s)', ret.code);
    },
    'process_exit': function (rpc, ret) {
      exitcode = ret.code;
      if (prompt) {
        process.stdin.resume();
        process.stdin.once('data', function () {
          console.error('Continuing...');
          process.stdin.pause();
          next();
        });
        process.stderr.write('Hit [RETURN] to terminate (exited with ' + ret.code + ')...');
      } else {
        next();
      }

      function next () {
        if (ret.code) {
          rpc.send('exit');
        } else {
          rpc.send('download', {
            source: '/tusk/result/result.tar.gz',
            bucket: 'tusk',
            path: sha1(plan) + '.tar.gz',
          });
        }
      }
    },
    'download_ready': function (rpc, result) {
      download = result;
      rpc.send('exit');
    }
  };

  rpc.use(initialState, exitState);
  rpc.send('start');
}

exports.requestServer = requestServer;
exports.build = build;
