var path = require('path');
var yaml = require('js-yaml');
var fs   = require('fs');
var cp = require('child_process');
var msgpack = require('msgpack')
var nano = require('nanomsg');
var myip = require('my-ip');
var docopt = require('docopt');
var crypto = require('crypto');

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
  return yaml.safeLoad(fs.readFileSync(path.join('./plan', plan + '.yaml'), 'utf8')).build || [];
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
  var steps = readPlan(plan);

  console.log(arguments)

  var rpc = rpackc.connect('pair', addr.replace('localhost', myip(null, false)));
  rpc.getStream('out').pipe(process.stdout);
  rpc.getStream('err').pipe(process.stderr);

  rpc.keepalive(3000);

  var download = null, exitcode = 0;
  rpc.use({
    'start': function (rpc) {
      rpc.send('process_start', {
        commands: steps,
        env: env
      });
    },
    'exit': function (rpc, result) {
      console.log('exit');
      rpc.close();
      onresult(exitcode, download);
    },
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
            source: '/result/result.tar.gz',
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
  });

  rpc.send('start');
}

exports.requestServer = requestServer;
exports.build = build;

if (require.main == module) {
  var doc = "\
Usage: remote <plan_name> [-e ENV]... [options]\n\
\n\
Options:\n\
  -e, --env KEY=VALUE  Environment variable\n\
  --prompt             Prompt to terminate VM.\n\
  -h, --help           Show this screen.\
";

  var argv = require('docopt').docopt(doc);

  var name = argv['<plan_name>'];
  var env = {};
  argv['--env'].forEach(function (e) {
    var split = e.split(/=(.+)?/, 2);
    env[split[0]] = split[1] || "";
  });

  console.log('Running:', name, env);

  requestServer(name, function (err, address) {
    build(address, name, {
      env: env,
      prompt: !!argv['--prompt'],
    }, function (err, result) {
      console.log('exit', err);
      console.log(result);
      process.on('exit', function () {
        process.exit(err);
      })
    })
  });
}
