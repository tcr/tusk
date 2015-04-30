var crypto = require('crypto');
var Map = require('es6-map');
var spawn = require('child_process').spawn;
var concat = require('concat-stream');
var _ = require('lodash');
var Promise = require('bluebird');

function sha1 (value) {
  var shasum = crypto.createHash('sha1');
  shasum.update(value);
  return shasum.digest('hex');
}

function pairify (o) {
  return Object.keys(o).sort().map(function (key) {
    return [key, o[key]];
  });
}

function collect (p, next) {
  var buf = [];
  p.stdout.on('data', function (data) {
    buf.push(data);
  })
  p.on('exit', function (code) {
    next(code, Buffer.concat(buf).toString());
  })
}

function clone (o) {
	return JSON.parse(JSON.stringify(o))
}

function combine (a, b) {
  var c = {};
  for (var k in a) {
    c[k] = a[k];
  }
  for (var k in b) {
    c[k] = b[k];
  }
  return c;
}

function refString (ref) {
  return JSON.stringify(pairify(ref));
}

function refSha (ref) {
  if (!ref || !ref.id) {
    throw new Error('Expected ref with id property.');
  }
  return sha1(refString(ref));
}

function memoize (hash, fn) {
  var memo = new Map();
  return function self (arg) {
    if (memo.has(hash(arg))) {
      return memo.get(hash(arg));
    }

    var result = fn.call(self, arg);
    memo.set(hash(arg), result);
    return result;
  }
}

function connect (A, B, end) {
  if (arguments.length < 3) {
    end = true;
  }
  A.pipe(B, { end: end }).pipe(A, { end: end });
}

function disconnect (A, B) {
  A.unpipe && A.unpipe(B);
  B.unpipe && B.unpipe(A);
}

function getRepositoryRefs (url) {
  // TODO verify url

  return new Promise(function (resolve, reject) {
    var p = spawn('git', ['ls-remote', url])
    p.stdout.pipe(concat(function (data) {
      var map = _(data)
        .trim()
        .toString()
        .split(/\n/)
        .map(function (str) {
          return str.split(/\t/).reverse();
        })
        .filter(function (str) {
          return str[0].match(/^refs\//)
        })
        .map(function (str) {
          return [str[0].replace(/^refs\//, ''), str[1]];
        });

      resolve(_.zipObject([].concat.apply([], [
        _(map).filter(function (str) {
          return str[0].match(/^tags\//) && !str[0].match(/\^\{\}/);
        }).map(function (str) {
          return [str[0].replace(/^[^\/]+\//, ''), str[1]];
        }).value(),
        _(map).filter(function (str) {
          return str[0].match(/^pull\//) && str[0].match(/\/head$/);
        }).map(function (str) {
          return [str[0].replace(/\/[^\/]+$/g, ''), str[1]];
        }).value(),
        _(map).filter(function (str) {
          return str[0].match(/^heads\//);
        }).map(function (str) {
          return [str[0].replace(/^[^\/]+\//, ''), str[1]];
        }).value(),
      ])));
    }))
  });
}

exports.connect = connect;
exports.disconnect = disconnect;
exports.sha1 = sha1;
exports.pairify = pairify;
exports.collect = collect;
exports.clone = clone;
exports.combine = combine;
exports.refString = refString;
exports.refSha = refSha;
exports.memoize = memoize;
exports.getRepositoryRefs = getRepositoryRefs;
