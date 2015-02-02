var fs = require('fs');
var net = require('net');

var ipc = '/tmp/wow.ipc';

var agent = new (require('events').EventEmitter)();

var connections = [];

var n = net.createServer(function (conn) {
	conn.write('b');
	console.log('connected');

	connections.push(conn);
	agent.emit('connection');

	conn.on('error', function (err) {
		console.error(err);
	})

	conn.on('data', function (data) {
		console.log(data);
	})

	conn.on('close', function () {
		connections = connections.filter(function (cmp) {
			return cmp !== conn;
		});
		console.log('ended');
	})
});

fs.unlinkSync(ipc);
n.listen(ipc);

agent.on('connection', function () {
	console.log(connections);
});

