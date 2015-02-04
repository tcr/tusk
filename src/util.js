var crypto = require('crypto');
var Map = require('es6-map');

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

exports.sha1 = sha1;
exports.pairify = pairify;
exports.collect = collect;
exports.clone = clone;
exports.combine = combine;
exports.refString = refString;
exports.refSha = refSha;
exports.memoize = memoize;
