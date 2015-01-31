var spawn = require('child_process').spawn;
var yaml = require('js-yaml');
var Promise = require('bluebird');

function collect (p, next) {
  var buf = [];
  p.stdout.on('data', function (data) {
    buf.push(data);
  })
  p.on('exit', function (code) {
    next(code, Buffer.concat(buf).toString());
  })
}

function getZones (next) {
  var p = spawn("gcloud", ["compute", "zones", "list", "--format", "yaml"]);
  collect(p, next);
}

function getQuota (region, next) {
  var p = spawn("gcloud", ["compute", "regions", "describe", region, "--format", "yaml"]);
  collect(p, function (err, result) {
    try {
      var q = yaml.safeLoad(result).quotas.filter(function (q) {
        return q.metric == 'CPUS'
      })[0];
      next(null, {
        region: region,
        limit: q.limit,
        usage: q.usage,
        available: q.limit - q.usage,
      })
    } catch (e) {
      next(null, {
        region: region,
        limit: 0,
        usage: 0,
        available: 0,
      })
    }
  });
}

function getZoneQuotas (next) {
  getZones(function (err, zones) {
    var res = [];
    yaml.safeLoadAll(zones, function (data) {
      res.push(data);
    });

    var zones = res.map(function (r) {
      return r.region;
    }).filter(function (value, index, self) {
          return self.indexOf(value) === index;
    });;

    var current = Promise.resolve();
    Promise.map(zones, function (region) {
      return Promise.promisify(getQuota)(region);
    }).nodeify(next);
  })
}

getZoneQuotas(function (err, result) {
  console.log(err, result);
})
