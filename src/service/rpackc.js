// MessagePack + RPC
// Stupid-simple RPC. Messages are [target, data] tuples.
// A handler can recevie calls by target; streams can be created
// to collect and replay data from a target. State-machine like
// behavior can emerge from switching the handler set.

var stream = require('stream');
var notepack = require('tcr-notepack');
var events = require('events');
var util = require('util');
var net = require('net');
var isStream = require('isstream')
var uuid = require('uuid');
var through = require('through');

function RPC (use) {
  stream.Duplex.call(this);

  this.decoder = notepack.createStream();

  this.decoder.on('data', function (message) {
    this.emit('message', {
      target: message[0],
      data: message[1]
    });
    this.emit('message:' + message[0], message[1]);
  }.bind(this));

  this.on('message', function (buf) {
    if (buf.target) {
      this.receive(buf.target, buf.data);
    }
  });

  this.on('message', function (buf) {
    if (buf.target == 'req') {
      if (!this.handler[buf.data.target]) {
        this.call('res', { id: buf.data.id, resolved: false, data: { message: 'No handler "' + buf.data.target + '" found.' } });
      } else {
        var prom = this.receive(buf.data.target, buf.data.data);
        prom.then(function (resolve) {
          if (isStream(resolve)) {
            var id = uuid.v1();

            function onend () {
              console.log('ended');
              resolve.unpipe(out);
            }

            this.call('res', { id: buf.data.id, resolved: true, stream: id });
            var out = through(function (data) {
              this.call('stream', { id: id, data: data });
            }.bind(this), function () {
              this.call('stream', { id: id, data: null });
              this.removeListener('end', onend);
            }.bind(this));

            resolve.pipe(out);
            this.on('end', onend);
          } else {
            this.call('res', { id: buf.data.id, resolved: true, data: resolve });
          }
        }.bind(this), function (reject) {
          this.call('res', { id: buf.data.id, resolved: false, data: reject });
        }.bind(this))
      }
    }
    if (buf.target == 'res' && this.responses) {
      var handle = this.responses[buf.data.id];
      delete this.responses[buf.data.id];
      if (handle) {
        if (buf.data.data) {
          buf.data.resolved ? handle.resolve(buf.data.data) : handle.reject(buf.data.data);
        } else if (buf.data.stream) {
          var id = buf.data.stream;
          var stream = through();
          this.on('message', function onmessage (buf) {
            if (buf.target == 'stream' && buf.data.id == id) {
              stream.queue(buf.data.data);
              if (buf.data.data == null) {
                this.removeListener('message', onmessage);
              }
            }
          })
          handle.resolve(stream);
        }
      }
    }
  });

  this.on('error', function (err) {
    console.error(err);
  })

  if (use) {
    this.use(use);
  }
}

util.inherits(RPC, stream.Duplex);

var Promise = require('bluebird');

RPC.prototype.request = function (target, data) {
  var id = '_abba';
  this.responses = this.responses || {};
  var self = this;
  var prom = new Promise(function (resolve, reject) {
    self.responses[id] = {
      resolve: resolve,
      reject: reject,
    }
  })
  this.call('req', {
    target: target,
    data: data,
    id: id,
  })
  return prom;
}

RPC.prototype._read = function () { }

RPC.prototype._write = function (chunk, encoding, next) {
  this.decoder.write(chunk, encoding);
  next();
}

RPC.prototype.call = function (target, data) {
  this.push(notepack.encode([String(target), data]));
}

RPC.prototype.use = function (/* handlers */) {
  var handler = {};
  Array.prototype.slice.apply(arguments).forEach(function (arg) {
    for (var key in arg) {
      handler[key] = arg[key];
    }
  });
  this.handler = handler;
}

RPC.prototype.receive = function (target, data) {
  if (Object.prototype.hasOwnProperty.call(this.handler || {}, target)) {
    try {
      return this.handler[target].call(this.handler, this, data);
    } catch (e) {
      console.error(e.stack);
    }
  }
}

function create (use) {
  return new RPC(use);
}

exports.RPC = RPC;
exports.create = create;
