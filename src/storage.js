var spawn = require('child_process').spawn;
var Promise = require('bluebird');

var util = require('./util');
var config = require('./config');

function gc_storage (object, mode, next) {
  var conf = config.read();

  return new Promise(function (resolve, reject) {
    var p = spawn("ansible", ["all",
      "-i", "localhost,",
      "-c", "local",
      "-m", "gc_storage",
      "-a",
        "bucket=tusk " +
        // "object=9b934cf284d9b196f48b43876d3e01912797242c.tar.gz " +
        "object=" + object + " " +
        "mode=" + mode + " " +
        "gs_access_key=" + conf.gstorage.key + " " +
        "gs_secret_key=" + conf.gstorage.secret + " "]);

    util.collect(p, function (err, data) {
      var result;
      try {
        result = JSON.parse(String(data).replace(/^.*>>\s*/g, ''));
        if (!result.failed) {
          return resolve(result);
        }
      } catch (err) {
        return reject(err);
      }
      if (result) {
        reject(new Error(result.msg));
      } else {
        reject(new Error("Unknown error"));
      }
    })
  })
  .nodeify(next);
}

// Check if a ref is already compiled.
function exists (ref, next) {
  return gc_storage(util.refSha(ref) + ".tar.gz", "get_url")
    .then(function (result) {
      return result.url;
    })
    .nodeify(next);
}

function destroy (ref, next) {
  return gc_storage(util.refSha(ref) + ".tar.gz", "delete")
    .nodeify(next);
}

exports.exists = exists;
exports.destroy = destroy;
