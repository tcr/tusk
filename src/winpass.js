var crypto = require('crypto');

function randomFloat () {
  return (crypto.randomBytes(1)[0] / 256);
}

// Dont use with max >= 255.
function randomInt (max) {
  return (randomFloat()*max)|0;
}

var chargroups = [
  "~!@#$%^&*_-+=`|(){}[]:;'<>,.?/\\\"",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
];

function generate () {
  var chars = [];
  chargroups.forEach(function (group) {
    for (var i = 0; i < 3; i++) {
      chars.push(group[randomInt(group.length)]);
    }
  })

  var pass = chars.sort(function(){
    return 0.5 - randomFloat();
  }).join('');

  return pass;
}

exports.generate = generate;
