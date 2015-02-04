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

if (require.main === module) {
  var doc = '\
Usage:\n\
  tusk build <id> [--input=<arg>]... [--force] [--preserve]\n\
  tusk cache <id> [--input=<arg>]... [--delete] [--force]\n\
  tusk dependencies <id> [--detail]\n\
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

  if (opts.build) {
    cmdBuild(opts, ref);
  } else if (opts.resources) {
    cmdResources(opts);
  } else if (opts.dependencies) {
    cmdDependenies(opts);
  } else if (opts.cache) {
    cmdCache(opts, ref);
  }
}

function cmdBuild (opts, ref) {
  storage.exists(ref, function (err, message) {
    if (!err && !opts['--force']) {
      console.error('Cached build exists.');
      console.error('Run with --force to override.');
      return;
    }
    build.reset(function (code) {
      console.error('Build process started.');
      if (opts['--preserve']) {
        console.error('(--preserve specified, will retain VM after build.)')
      }

      dependencies.mapDependencies(ref, function (ref, deps) {
        console.log('Building', ref);
        console.log(deps.length ? 'Edge' : 'Leaf', ref);

        return build.build(ref, {
          preserve: opts['--preserve']
        });
      })
      .then(function (url) {
        console.error('Build process finished.');
        console.log(url);
      }, function (err) {
        console.error('Build process finished with error.');
        console.error(err);
        process.on('exit', function () {
          process.exit(1);
        });
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
