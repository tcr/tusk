// Test

var tar = require('tar');
var zlib = require('zlib');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var expect = require('chai').expect;

var remote = require('../remote');
var plan = require('../plan');

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

describe('local', function () {
  it('should retrieve a test', function () {
    expect(plan.getPlan('uname')).to.be.ok();
  });

  it('should serialize messages', function (done) {
    done()
  });
});

describe('integration', function () {
  this.timeout(5*60*1000);

  it('should run a linux server', function (done) {
    var test = plan.getPlan('uname');
    expect(plan.getPlan('uname')).to.be.ok();

    remote.requestServer('test', function (err, address) {
      expect(err).to.not.be.ok();

      remote.build(address, test, function (err, result) {
        expect(err).to.not.be.ok();

        console.log('exit', err);
        console.log(result);
        
        assert(result && result.available);
        parsetar(result, function (err, uname) {
          expect(err).to.not.be.ok();

          console.log(uname);
          expect(uname).to.be.a.string();
          expect(uname).to.match(/Linux/i);
          done();
        })
      })
    });
  });
});
