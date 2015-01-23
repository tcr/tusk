import queue
import atexit
from src import agent, vagrant, paths, config
from threading import Thread, Lock

def opt_makedirs(path):
    try:
        os.makedirs(path)
    except Exception:
        pass

opt_makedirs(paths.config) # make config path
opt_makedirs(paths.vms) # make VM path
config.tusk() # Check config format

agent.mp_clean()
atexit.register(agent.mp_clean)

inq = queue.Queue()
outq = queue.Queue()

pl = Thread(target=agent.mp_listener, args=(inq, outq))
pl.daemon = True
pc = Thread(target=agent.mp_consumer, args=(inq, outq))
pc.daemon = True

pl.start()
pc.start()

print('joining...')
pc.join()
print('joined consumer...')
# pl.join()
# print('joined listenre...')
