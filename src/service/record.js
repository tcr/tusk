// Record

var seq = require('sequence-stream');
var Readable = require('stream').Readable;
var fs = require('fs');
var path = require('path');

var config = require('../config');

function Record (name) {
  this.active = false;
  this.path = path.join(config.USER_LOGS, name + '.log');
}

Record.prototype.writeStream = function () {
  if (this.active) {
    throw new Error('Another stream is actively writing to this stream.');
  }

  this.active = true;
  this.written = 0;
  this.output = new Readable();
  this.output._read = function () { }
  this.output.resume();

  this.writeStream

  var stream = fs.createWriteStream(this.path);
  var _write = stream._write;
  stream._write = function (chunk, encoding) {
    _write.apply(stream, arguments);
    this.output.push(chunk, encoding);
    this.written += chunk.length;
  }.bind(this);
  stream.on('finish', function () {
    this.output.push(null);
    this.active = false;
  }.bind(this))
  return stream;
}

Record.prototype.createStream = function () {
  if (!this.active) {
    return fs.createReadStream(this.path);
  }
  var fstream = fs.createReadStream(this.path, {
    start: 0, end: this.written,
  })
  return seq([fstream, this.output]);
}

module.exports = Record;

/*
var a = new Record(true);
a.write('hello ');
a.createStream().pipe(process.stdout);
a.write('there');
a.write(' Tim.\n');
a.end();

var a = new Record(false);
a.createStream().pipe(process.stdout);
*/

/*
targets a file

held in a weakmap id:record

record can be in "recording" state

record will write new data to file with .write method which will re-emit data as stream

record.createStream() will create read stream from beginning to instantaneous current pos
then unbuffer and flush subsequent write methods

(on frozen, just createReadStream is fine)

piping over RPC:

-> stream-push!
id + data

handler on RPC side for attaching streams with an ID

<- record request with ID
first inbound

sets are requested and changed, or unprompted and changed.

then crdts.
so not RPC, but just stream multiplexing with reconnect. ok


<- RPC (req res)
-> streams
<- CRDT objects
*/
