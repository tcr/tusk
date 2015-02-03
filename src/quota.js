var spawn = require('child_process').spawn;
var yaml = require('js-yaml');
var Promise = require('bluebird');

var util = require('./util');

// hardcoded reference from https://cloud.google.com/compute/docs/zones
// TODO infer zones in another way
var preferZones = {
  "us-central1": "f",
  "europe-west1": "c",
  "asia-east1": "a",
};

var preferRegions = [
  'us-central1',
  'europe-west1',
  'asia-east1',
];

function getZones (next) {
  var p = spawn("gcloud", ["compute", "zones", "list", "--format", "yaml"]);
  util.collect(p, next);
}

function getQuota (region, next) {
  var p = spawn("gcloud", ["compute", "regions", "describe", region, "--format", "yaml"]);
  util.collect(p, function (err, result) {
    try {
      var q = yaml.safeLoad(result).quotas.filter(function (q) {
        return q.metric == 'CPUS'
      })[0];
      next(null, {
        id: 'gcloud-' + region,
        gcloud: {
          region: region,
          zone: preferZones[region],
        },
        cores: {
          limit: q.limit,
          usage: q.usage,
          available: q.limit - q.usage,
        }
      })
    } catch (e) {
      next(null, {
        id: 'gcloud-' + region,
        gcloud: {
          region: region,
          zone: preferZones[region],
        },
        cores: {
          limit: 0,
          usage: 0,
          available: 0,
        }
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
    }).sort(function (a, b) {
      return preferRegions.indexOf(a) < preferRegions.indexOf(b)
        ? -1
        : preferRegions.indexOf(a) > preferRegions.indexOf(b)
        ? 1
        : 0;
    });

    var current = Promise.resolve();
    Promise.map(zones, function (region) {
      return Promise.promisify(getQuota)(region);
    }).nodeify(next);
  })
}

function query (query, next) {
  getZoneQuotas(function (err, quotas) {
    if (!err && query.cores) {
      quotas = quotas.filter(function (target) {
        return target.cores.available >= parseInt(query.cores);
      });
    }

    next(err, quotas);
  })
}

exports.getZones = getZones;
exports.getQuota = getQuota;
exports.getZoneQuotas = getZoneQuotas;
exports.query = query;
