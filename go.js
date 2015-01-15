var cp = require('child_process');
var msgpack = require('msgpack')

var nano = require('nanomsg');
var socket = nano.socket('req');
socket.connect('tcp://localhost:5858');

var nn = nano._bindings;
socket.setsockopt(nn.NN_REQ, nn.NN_REQ_RESEND_IVL, 5*60*1000);

socket.on('message', function (data) {
	console.log(msgpack.unpack(data))
	socket.close()
})

socket.send(msgpack.pack(process.argv[2]))
