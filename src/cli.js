#!/usr/bin/env node

var Promise = require('bluebird');
var docopt = require('docopt').docopt;
var read = require('read');
var yaml = require('js-yaml');

var build = require('./build');
var storage = require('./storage');
var util = require('./util');
var dependencies = require('./dependencies');
var ls = require('./ls');
var config = require('./config');

if (require.main === module) {
  var doc = '\
Usage:\n\
  tusk build <id> [--input=<arg>]... [--force] [--preserve] [--merge=<repo>]\n\
  tusk cache <id> [--input=<arg>]... [--delete] [--force]\n\
  tusk shell <id> [--input=<arg>]...\n\
  tusk dependencies <id> [--detail]\n\
  tusk gc\n\
  tusk server\n\
  tusk web\n\
  tusk resources [--match=<arg>]...\n\
  tusk -h | --help\n\
\n\
Options:\n\
  -f, --force            Force action.\n\
  -i, --input=<arg>      Input variable.\n\
  -m, --match=<arg>      Match resources.';

  var opts = docopt(doc);

  // Parse args into ref spec
  var ref = {};
  (opts['--input'] || []).forEach(function (def) {
    var _ = def.split("="), k = _[0] || '', v = _[1] || '';
    ref[k] = v;
  });
  ref.id = opts['<id>'];

  if (opts.server) {
    require('./service/server.js');
  } else if (opts.web) {
    require('./service/web.js');
  } else if (opts.build) {
    cmdBuild(opts, ref);
  } else if (opts.merge) {
    cmdBuild(opts, ref);
  } else if (opts.gc) {
    cmdGc(opts);
  } else if (opts.resources) {
    cmdResources(opts);
  } else if (opts.dependencies) {
    cmdDependenies(opts);
  } else if (opts.cache) {
    cmdCache(opts, ref);
  } else if (opts.shell) {


var spawn = require('child_process').spawn;

var proc = spawn('vagrant', ['winrm'], {
  stdio: 'inherit',
  cwd: config.USER_VMS + require('./util').refSha(ref),
});
proc.on('exit', function (code) {
  process.exit(code);
});

  }
}

function cmdGc (opts) {
  build.reset({
    logger: process.stderr
  })
  .then(function () {
    console.log('All VMs cleaned up.')
  });
}

function cmdBuild (opts, ref) {
  storage.exists(ref, function (err, url) {
    if (!err && !opts['--force']) {
      console.error('Cached build exists:', url);
      console.error('');
      console.error('Run with --force to override.');
      return;
    }

    console.error('Build process started.');
    if (opts['--preserve']) {
      console.error('(--preserve specified, will retain VM after build.)')
    }

    var buildopts = {
      preserve: opts['--preserve'],
      merge: opts['--merge'] ? {
        repo: opts['--merge'].replace(/\#.*$/, '') || null,
        ref: opts['--merge'].replace(/^.*?\#/, '') || null,
      } : null,
    }

    dependencies.mapDependencies(ref, function (ref, deps) {
      console.log('Building', ref);
      console.log(deps.length ? 'Edge' : 'Leaf', ref);
      return build.build(ref, buildopts);
    })
    .then(function (url) {
      console.error('Build process finished.');
      console.log(url);
    }, function (err) {
      console.error('Build process finished with error.');
      console.error(err.stack || err);
      process.on('exit', function () {
        process.exit(1);
      });
    });
  });
}

function cmdResources (opts) {
  var quota = require('./quota');
  
  var query = {};
  (opts['--match'] || []).forEach(function (def) {
    var _ = def.split("="), k = _[0] || '', v = _[1] || '';
    query[k] = parseInt(v);
  });

  quota.query(query, function (err, quotas) {
    console.log(yaml.safeDump({
      targets: quotas
    }));
  });
}

function cmdDependenies (opts) {
  dependencies.getDependencies(ref)
  .then(function (tree) {
    ls.outputDependencyTree(tree, {
      detail: opts['--detail']
    })
    .then(function (art) {
      console.log(art);
    });
  })
}

function cmdCache (opts, ref) {
  console.error('ref:', ref);
  console.error('sha:', util.refSha(ref));
  storage.exists(ref, function (err, url) {
    if (err) {
      console.error('cache unavailable:', err.message);
      process.exit(1);
    } else {
      console.error('cache available')
      console.log(url);
      if (opts['--delete']) {
        console.error('');
        read({ prompt: 'Would you like to delete? [y/N]' }, function (err, out) {
          if (out && out.match(/^y(es)?$/i)) {
            storage.destroy(ref, function (err, result) {
              if (err) {
                console.error(err.message);
                process.exit(1);
              } else {
                console.log(result.msg);
              }
            })
          }
        });
      }
    }
  });
}
