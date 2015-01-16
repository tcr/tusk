// MessagePack + Nanomsg + RPC
// Stupid-simple RPC. Messages are either 
//  - call: Invoke a receiving function with arguments
//  - stream: Append data to a stream (if it exists)
// State-machine like behavior can be produced from switching
// the set of handler functions.

var stream = require('stream');
var nano = require('nanomsg');
var msgpack = require('msgpack');

function RPC (type, addr) {
  this.socket = nano.socket(type);
  this.socket.connect(addr);
  this.socket.on('message', this.onMessage.bind(this));

  this.streams = {};
}

RPC.prototype.onMessage = function (buf) {
  try {
      var buf = msgpack.unpack(buf);
      if (buf) {
      switch (buf['type']) {
        case 'stream': {
          this.getStream(buf['target']).push(buf.data);
        }; break;
        case 'call': {
          this.call(buf['target'], buf['data']);
        } break;
      }
    }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
};

RPC.prototype.close = function () {
  this.socket.close();
};

RPC.prototype.sendCall = function (target, data) {
  this.socket.send(msgpack.pack({
    'type': 'call',
    'target': String(target),
    'data': data,
  }))
}

RPC.prototype.sendStream = function (target, data) {
  this.socket.send(msgpack.pack({
    'type': 'stream',
    'target': String(target),
    'data': data,
  }))
}

RPC.prototype.getStream = function (target) {
  var streams = this.streams;
  if (!streams[target]) {
    streams[target] = new stream.Readable();
    streams[target]._read = function () { };
  }
  return streams[target]
}

RPC.prototype.use = function (handler) {
  this.handler = handler;
}

RPC.prototype.call = function (target, data) {
  this.handler && this.handler[target] && this.handler[target].call(this.handler, this, data);
}

function connect (type, address) {
  return new RPC(type, address);
}

exports.RPC = RPC;
exports.connect = connect;
