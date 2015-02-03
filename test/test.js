var expect = require('chai').expect;

describe('playbook', function () {
	it('should generate a sha from ref', function () {
		var util = require('../src/util');

		var sha = util.refSha({id: 'hi', k: 'v'});
		expect(sha).to.equal(util.sha1(JSON.stringify([['id', 'hi'], ['k', 'v']])));
	})

	it('should get all dependencies', function (done) {
		var playbook = require('../src/playbook');

		playbook.getDependencies({id: 'test-b'}, function (err, values) {
			expect(values).to.eql([ { id: 'test-b' }, { a: 'b', id: 'test-a' } ]);
			done();
		})
	})
});
