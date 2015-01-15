// Test

var tar = require('tar');
var zlib = require('zlib');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var remote = require('./remote');

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

describe('remote', function(){
  this.timeout(5*60*1000);

  it('should run a linux server', function (done) {
    remote.requestServer('test', function (err, address) {
      if (err) { return console.error('Invalid request'); }
      remote.build(address, function (err, result) {
        console.log('exit', err);
        console.log(result);
        
        assert(result && result.available);
        parsetar(result, function (err, uname) {
          console.log(uname);

          assert.equal(err, null);
          assert(uname && uname.match(/Linux/i));
          done();
        })
      })
    });
  });
});
