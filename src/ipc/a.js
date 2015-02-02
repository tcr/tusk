var reconnect = require('reconnect-net');
var net = require('net');

reconnect(function (client) {
	client.write('a');
	console.log('connected');

	client.on('error', function (err) {
		console.log(err);
	})

	client.on('data', function (data) {
		console.log(data);
	})
}).connect("/tmp/wow.ipc");
