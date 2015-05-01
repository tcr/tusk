var Map = require('es6-map');
var Sequelize = require('sequelize');

var config = require('../config');

var sequelize = new Sequelize('tusk', null, null, {
  dialect: 'sqlite',
  storage: config.USER_DB,
});

function jsoncolumn (id, obj) {
  obj = obj || {};
  obj.type = Sequelize.TEXT;
  obj.get = function () {
    var value = this.getDataValue(id);
    return JSON.parse(value);
  };
  obj.set = function (value) {
    this.setDataValue(id, JSON.stringify(value));
  };
  obj.allowNull = true;
  obj.defaultValue = "null";
  return obj;
}

var Job = sequelize.define('job', {
  ref: jsoncolumn('ref'),
  finished: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
  error: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
  force: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
  start: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: Date.now },
  end: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
  merge: jsoncolumn('merge'),
  dependencies: jsoncolumn('dependencies'),
});

var run = Job.sync();

exports.create = function (type) {
  var args = [].slice.call(arguments, 1);
  var base = ({
    Job: Job
  })[type];
  return run
  .then(function () {
    return base.create.apply(base, args);
  });
}

exports.find = function (type) {
  var args = [].slice.call(arguments, 1);
  var base = ({
    Job: Job
  })[type];
  return run
  .then(function () {
    return base.find.apply(base, args);
  });
}

exports.destroy = function (type) {
  var args = [].slice.call(arguments, 1);
  var base = ({
    Job: Job
  })[type];
  return run
  .then(function () {
    return base.destroy.apply(base, args);
  });
}

exports.findAll = function (type) {
  var args = [].slice.call(arguments, 1);
  var base = ({
    Job: Job
  })[type];
  return run
  .then(function () {
    return base.findAll.apply(base, args);
  });
}
