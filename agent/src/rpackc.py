# MessagePack + Nanomsg + RPC
# Stupid-simple RPC. Messages are either
#  - call: Invoke a receiving function with arguments
#  - stream: Append data to a stream (if it exists)
# State-machine like behavior can be produced from switching
# the set of handler functions.

import atexit
import msgpack
from nanomsg import Socket, PAIR, PUB, NanoMsgAPIError


class RPC:

    def __init__(self, kind, addr):
        self.socket = Socket(kind)
        self.socket._set_recv_timeout(5 * 5000)
        self.socket._set_send_timeout(5 * 5000)

        self.socket.bind(addr)

        def ipc_cleanup():
            self.socket.close()
        atexit.register(ipc_cleanup)

        self.alive = False

    def send(self, target, data=None):
        self.socket.send(msgpack.packb([target, data]))

    def close(self):
        self.send('exit')
        self.socket.close()

    def use(self, handler):
        self.handler = handler

    def listen_loop(self):
        self.alive = True
        success = True
        try:
            while self.alive:
                incoming = self.socket.recv()
                pkt = msgpack.unpackb(incoming)

                if isinstance(pkt, list) and len(pkt) > 0 and self.handler:
                    target = bytes(pkt[0] or '').decode('utf-8', 'ignore')
                    data = pkt[1] if len(pkt) > 1 else None
                    if getattr(self.handler, target):
                        getattr(self.handler, target)(self, data)
                else:
                    print('Invalid msgpack buffer received:', pkt, file=sys.stderr)
        except NanoMsgAPIError as e:
            # Timeout
            print('RPC error:', e)
            success = False

        return success
