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

    def send_stream(self, target, data=None):
        self.socket.send(
            msgpack.packb({'type': 'stream', 'target': target, 'data': data}))

    def send_call(self, target, data=None):
        self.socket.send(
            msgpack.packb({'type': 'call', 'target': target, 'data': data}))

    def close(self):
        self.send_call('exit')
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

                if pkt.get(b'type') == b'call' and self.handler and pkt.get(b'target'):
                    if getattr(self.handler, pkt.get(b'target').decode('utf-8', 'ignore')):
                        getattr(self.handler, pkt.get(b'target').decode(
                            'utf-8', 'ignore'))(self, pkt.get(b'data', None))
                else:
                    print('Could not handle packet:', pkt)
        except NanoMsgAPIError as e:
            # Timeout
            print('Build aborted:', e)
            success = False

        return success
