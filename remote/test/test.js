// Test

var tar = require('tar');
var zlib = require('zlib');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var expect = require('chai').expect;
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

function parsetar (result, next) {
  try {
    var success = false;
    fs.createReadStream(result.path)
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

// Tests

describe('remote', function(){
  this.timeout(5*60*1000);

  step('should run uname on linux', function (done) {
    remote.requestServer('test', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, 'test', {}, function (err, result) {
        expect(err).to.equal(0);
        expect(result).to.have.property('available').that.is.ok();
        expect(result).to.have.property('size').that.is.a('number');
        expect(result).to.have.property('url').that.is.a('string');
        done();
      })
    });
  });

  step('should fail on linux', function (done) {
    remote.requestServer('test-fail', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, 'test-fail', {}, function (err, result) {
        expect(err).to.equal(42);

        done();
      })
    });
  });

  step('should support env variables', function (done) {
    remote.requestServer('test-env', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, 'test-env', {
        INPUT: "OK"
      }, function (err, result) {
        expect(err).to.not.be.ok();

        remote.requestServer('test-env', function (err, address) {
          expect(err).to.not.be.ok();

          remote.build(address, 'test-env', {
            INPUT: "NOT OK"
          }, function (err, result) {
            expect(err).to.be.ok();

            done();
          });
        });
      });
    });
  });
});
