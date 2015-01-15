var yaml = require('js-yaml');
var fs   = require('fs');
var cp = require('child_process');
var msgpack = require('msgpack')
var nano = require('nanomsg'), nn = nano._bindings;

var rpackc = require('./rpackc');

function requestServer (name, onallocation) {
  var socket = nano.socket('req');
  socket.setsockopt(nn.NN_REQ, nn.NN_REQ_RESEND_IVL, 5*60*1000);

  socket.on('message', function (data) {
    var result = msgpack.unpack(data);
    socket.close()

    onallocation(!result.status, result.connection);
  })

  socket.connect('tcp://localhost:5858');
  socket.send(msgpack.pack(name));
}

function build (addr, onresult) {
  // Get document, or throw exception on error
  var steps;
  try {
    steps = yaml.safeLoad(fs.readFileSync('./test.yaml', 'utf8'));
    console.log(steps);
  } catch (e) {
    console.log(e);
  }

  var rpc = rpackc.connect('pair', addr);
  rpc.getStream('out').pipe(process.stdout);
  rpc.getStream('err').pipe(process.stderr);

  var download = null, exitcode = 0;
  rpc.use({
    'start': function (rpc) {
      rpc.sendCall('process_start', steps);
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
        rpc.sendCall('exit');
      } else {
        rpc.sendCall('download', '/result/result.tar.gz');
      }
    },
    'download_ready': function (rpc, result) {
      download = result;
      rpc.sendCall('exit');
    }
  });

  rpc.sendCall('start');
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
