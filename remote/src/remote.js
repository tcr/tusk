var path = require('path');
var yaml = require('js-yaml');
var fs   = require('fs');
var cp = require('child_process');
var msgpack = require('msgpack')
var nano = require('nanomsg');

var rpackc = require('./rpackc');

function setResendInterval (socket, timeout) {
  var nn = nano._bindings;
  socket.setsockopt(nn.NN_REQ, nn.NN_REQ_RESEND_IVL, timeout);
}

function requestServer (name, onallocation) {
  var socket = nano.socket('req');
  setResendInterval(socket, 5*60*1000);

  socket.on('message', function (data) {
    var result = msgpack.unpack(data);
    socket.close()

    onallocation(!result.status, result.connection);
  })

  socket.connect('tcp://localhost:5858');
  socket.send(msgpack.pack(name));
}

function readPlan (plan) {
  return yaml.safeLoad(fs.readFileSync(path.join('./plan/', plan + '.yaml'), 'utf8'));
}

function build (addr, plan, onresult) {
  // Get document, or throw exception on error
  var steps = readPlan(plan);

  var rpc = rpackc.connect('pair', addr);
  rpc.getStream('out').pipe(process.stdout);
  rpc.getStream('err').pipe(process.stderr);

  var download = null, exitcode = 0;
  rpc.use({
    'start': function (rpc) {
      rpc.send('process_start', steps);
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
      if (ret.code) {
        rpc.send('exit');
      } else {
        rpc.send('download', '/result/result.tar.gz');
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
  if (!process.argv[2]) {
    console.error('Usage: runner openwrt');
    process.exit(1);
  }

  requestServer(process.argv[2], function (err, address) {
    build(address, function (err, result) {
      console.log('exit', err);
      console.log(result);
    })
  });
}
