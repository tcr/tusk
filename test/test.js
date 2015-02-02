var expect = require('chai').expect;

describe('playbook', function () {
	it('should generate a sha from ref', function () {
		var playbook = require('../src/playbook');
		var util = require('../src/util');

		var sha = playbook.getSha({id: 'hi', k: 'v'});
		expect(sha).to.equal(util.sha1(JSON.stringify([['id', 'hi'], ['k', 'v']])));
	})
});
