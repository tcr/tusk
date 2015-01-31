#!/usr/bin/env node

var wrench = require('wrench');
var fs = require('fs');
var playbook = require('./playbook');
var spawn = require('child_process').spawn;

function vagrantup (cwd, next) {
  var p = spawn('vagrant', ['up', '--provider=google', '--no-provision'], {
    cwd: cwd,
    stdio: "inherit",
  });
  p.on('error', next);
  p.on('exit', next);
}

function vagrantprovision (cwd, next) {
  var p = spawn('vagrant', ['provision'], {
    cwd: cwd,
    stdio: "inherit",
  });
  p.on('error', next);
  p.on('exit', next);
}

function vagrantdestroy (cwd, next) {
  var p = spawn('vagrant', ['destroy', '-f'], {
    cwd: cwd,
    stdio: "inherit",
  });
  p.on('error', next);
  p.on('exit', next);
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('Usage: playbook.js name');
    process.exit(1);
  }

  var name = process.argv[2];

  var cwd = __dirname + '/../vm';
  vagrantdestroy(cwd, function (code) {
    wrench.rmdirSyncRecursive(__dirname + '/../vm', true);
    wrench.copyDirSyncRecursive(__dirname + '/../template', __dirname + '/../vm')

    fs.writeFileSync(__dirname + '/../vm/playbook.yml', playbook.generate(name), 'utf-8');

    vagrantup(cwd, function (code) {
      console.log('up:', code);
      if (code) { process.exit(code) }

      vagrantprovision(cwd, function (code) {
        console.log('provision:', code)
        if (code) { process.exit(code) }

        vagrantdestroy(cwd, function (code) {
          console.log('destroy:', code)
          if (code) { process.exit(code) }

          wrench.rmdirSyncRecursive(cwd);
          console.log('done');
        });
      })
    })
  });
}
