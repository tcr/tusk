var spawn = require('child_process').spawn;
var util = require('./util');
var config = require('./config');

// Check if a ref is already compiled.
function check (ref, next) {
  var conf = config.read();

  var p = spawn("ansible", ["all",
    "-i", "localhost,",
    "-c", "local",
    "-m", "gc_storage",
    "-a",
      "bucket=tusk " +
      // "object=9b934cf284d9b196f48b43876d3e01912797242c.tar.gz " +
      "object=" + util.refSha(ref) + ".tar.gz " +
      "mode=get_url " +
      "gs_access_key=" + conf.gstorage.key + " " +
      "gs_secret_key=" + conf.gstorage.secret + " "]);
  util.collect(p, function (err, data) {
    var result, err = null;
    try {
      result = JSON.parse(String(data).replace(/^.*>>\s*/g, ''));
      if (result.url) {
        return next(null, result.url);
      }
    } catch (e) {
      err = e;
    }
    return next(err || (result ? new Error('JSON: ' + JSON.stringify(k) +'\nsha=' + util.sha1(dependencyKey(k)) + '\n' + result.msg) : new Error("Unknown error")));
  })
}

exports.check = check;
