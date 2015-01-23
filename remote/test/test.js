// Test

var tar = require('tar');
var zlib = require('zlib');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var expect = require('chai').expect;
var request = require('request');
var crypto = require('crypto');
require('mocha-steps');

var remote = require('../src/remote');

function collect (stream, next) {
  var bufs = [];
  stream.on('data', function (data) {
    bufs.push(data);
  });
  stream.on('end', function () {
    next(null, Buffer.concat(bufs));
  })
}

function parsetar (stream, next) {
  try {
    var success = false;
    stream
      .pipe(zlib.createGunzip())
      .pipe(tar.Parse())
      .on('entry', function (entry) {
        if (entry.type == 'File' && path.basename(entry.path) == 'uname') {
          collect(entry, function (err, data) {
            success = true;
            next(null, data.toString());
          })
        }
      })
      .on('end', function () {
        if (!success) {
          next(new Error('Did not find uname in archive.'));
        }
      });
  } catch (err) {
    next(err);
  }
}

function sha1 (value) {
  var shasum = crypto.createHash('sha1');
  shasum.update(value);
  return shasum.digest('hex');
}

// Tests

describe('remote', function(){
  this.timeout(5*60*1000);

  var unameResult = null;

  step('should run uname on linux', function (done) {
    remote.requestServer('test-uname', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, 'test-uname', function (err, result) {
        expect(err).to.equal(0);
        expect(result).to.have.property('available').that.is.ok();
        expect(result).to.have.property('size').that.is.a('number');
        expect(result).to.have.property('url').that.is.a('string');

        unameResult = result.url;

        done();
      })
    });
  });

  step('should result in a sha1 hash of input', function (done) {
    expect(path.basename(unameResult, '.tar.gz')).to.equal(sha1('test-uname'));
    done();
  });

  step('should result in a public tar.gz file', function (done) {
    var req = request.get(unameResult)
    
    req.on('response', function(response) {
      expect(response.statusCode).to.equal(200);
    });

    parsetar(req, function (err, uname) {
      expect(err).to.not.be.ok();
      expect(uname).to.be.a('string').and.to.match(/Linux/i);

      done();
    });
  });

  step('should fail on linux', function (done) {
    remote.requestServer('test-fail', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, 'test-fail', function (err, result) {
        expect(err).to.equal(42);

        done();
      })
    });
  });

  step('should support env variables', function (done) {
    remote.requestServer('test-env', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, 'test-env', {
        env: { ENV_OK: "OK", ENV_NOT_OK: "DUMMY" },
      }, function (err, result) {
        expect(err).to.not.be.ok();

        done();
      });
    });
  });
});
