// MessagePack + Nanomsg + RPC
// Stupid-simple RPC. Messages are [target, data] tuples.
// A handler can recevie calls by target; streams can be created
// to collect and replay data from a target. State-machine like
// behavior can emerge from switching the handler set.

var stream = require('stream');
var nano = require('nanomsg');
var msgpack = require('msgpack');
var events = require('events');
var util = require('util');

function RPC (type, addr) {
  this.socket = nano.socket(type);
  this.socket.connect(addr);
  this.socket.on('message', function (buf) {
    var message;
    try {
      message = msgpack.unpack(buf);
    } catch (e) {
      return console.error('Invalid msgpack client buffer received: ' + e.toString());
    }
    this.emit('message', {
      target: message[0],
      data: message[1]
    })
  }.bind(this));

  this.on('message', function (buf) {
    if (buf.target) {
      this.call(buf.target, buf.data);
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
  if (!this.streams[target]) {
    this.streams[target] = new stream.Readable();
    this.streams[target]._read = function () { };

    this.on('message', function (buf) {
      if (buf.target == target) {
        this.streams[target].push(Buffer.isBuffer(buf.data) ? buf.data : String(buf.data));
      }
    })
  }
  return this.streams[target]
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
