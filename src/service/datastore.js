var Map = require('es6-map');

var data = new Map();

function table (key) {
  if (!data.has(key)) {
    var row = [];
    row.remove = function (item) {
      if (this.indexOf(item) == -1) {
        throw new Error('Object not in table')
      }
      this.splice(this.indexOf(item), 1);
      return item;
    }
    row.add = function (item) {
      item.id = this.length;
      this.push(item);
      return this.length - 1;
    }
    data.set(key, row)
  }
  return data.get(key)
}

exports.table = table;

// function test () {
//   table('name').push({
//     name: 'tim'
//   })
//   table('name').push({
//     name: 'timmy'
//   })
//   table('name').forEach(function (row) {
//     console.log(row);
//   })
// }

// test()
