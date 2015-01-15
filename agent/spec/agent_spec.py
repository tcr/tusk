from expects import *

import sys
sys.path.append('.')
import agent

with description('agent'):
	with it('can create and destroy a vm'):
		agent.mp_clean()
		expect(agent.vm_exists('dummy')).to(be(False))
		agent.vm_init('dummy')
		expect(agent.vm_exists('dummy')).to(be(True))
		agent.vm_clean('dummy')
		expect(agent.vm_exists('dummy')).to(be(False))
