// MessagePack + Nanomsg + RPC
// Stupid-simple RPC. Messages are either 
//  - call: Invoke a receiving function with arguments
//  - stream: Append data to a stream (if it exists)
// State-machine like behavior can be produced from switching
// the set of handler functions.

var stream = require('stream');
var nano = require('nanomsg');
var msgpack = require('msgpack');
var events = require('events');
var util = require('util');

function RPC (type, addr) {
  this.socket = nano.socket(type);
  this.socket.connect(addr);
  this.socket.on('message', function (buf) {
    try {
      this.emit('message', msgpack.unpack(buf));
    } catch (e) {
      console.error('Invalid msgpack buffer received: ' + e.toString());
    }
  }.bind(this));

  this.on('message', function (buf) {
    if (buf[0]) {
      this.call(buf[0], buf[1]);
    }
  })

  this.streams = {};
}

util.inherits(RPC, events.EventEmitter);

RPC.prototype.close = function () {
  this.socket.close();
};

RPC.prototype.send = function (target, data) {
  this.socket.send(msgpack.pack([String(target), data]));
}

RPC.prototype.getStream = function (target) {
  var streams = this.streams;
  if (!streams[target]) {
    streams[target] = new stream.Readable();
    streams[target]._read = function () { };

    this.on('message', function (buf) {
      if (buf.target == target) {
        streams[target].push(Buffer.isBuffer(buf.data) ? buf.data : String(buf.data));
      }
    })
  }
  return streams[target]
}

RPC.prototype.use = function (handler) {
  this.handler = handler;
}

RPC.prototype.call = function (target, data) {
  if (Object.prototype.hasOwnProperty.call(this.handler || {}, target)) {
    return this.handler[target].call(this.handler, this, data);
  }
}

function connect (type, address) {
  return new RPC(type, address);
}

exports.RPC = RPC;
exports.connect = connect;
