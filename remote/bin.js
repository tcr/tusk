#!/usr/bin/env node

var remote = require('./remote');
var plan = require('./plan');

if (!process.argv[2]) {
  console.error('Usage: runner openwrt');
  process.exit(1);
}

var name = process.argv[2];
remote.requestServer(name, function (err, address) {
  remote.build(address, plan.getPlan(name), function (err, result) {
    console.log('exit', err);
    console.log(result);
  })
});
