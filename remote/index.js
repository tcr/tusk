#!/usr/bin/env node

var remote = require('./src/remote');
var docopt = require('docopt');

var doc = "\
Usage: remote <plan_name> [-e ENV]... [options]\n\
\n\
Options:\n\
  -e, --env KEY=VALUE  Environment variable\n\
  --prompt             Prompt to terminate VM.\n\
  -h, --help           Show this screen.\
";

var argv = docopt.docopt(doc);

var name = argv['<plan_name>'];
var env = {};
argv['--env'].forEach(function (e) {
  var split = e.split(/=(.+)?/, 2);
  env[split[0]] = split[1] || "";
});

console.log('Running:', name, env);

remote.requestServer(name, function (err, address) {
  remote.build(address, name, {
    env: env,
    prompt: !!argv['--prompt'],
  }, function (err, result) {
    console.log('exit', err);
    console.log(result);
    process.on('exit', function () {
      process.exit(err);
    })
  })
});