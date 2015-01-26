import atexit
import shutil
import os
import time
import sys
import io
import traceback
import signal
import queue
import msgpack
import yaml
import hashlib
from nanomsg import Socket, PAIR, PUB, REP
from threading import Thread, Lock
from concurrent.futures import ThreadPoolExecutor
from . import vagrant, paths, ssh, config


def handler(signum, frame):
    global alive
    print('^C shutting down python agent')
    if alive == False:
        sys.exit()
    alive = False
alive = True
signal.signal(signal.SIGTERM, handler)


def vagrant_env(name=None):
    overlay = {}
    config = tusk()
    if config.get('gcloud'):
        overlay['GCLOUD_PROJECT_ID'] = config['gcloud'].get('project_id')
        overlay['GCLOUD_CLIENT_EMAIL'] = config['gcloud'].get('client_email')
        overlay['GCLOUD_PRIVILEGED'] = "1" if config['gcloud'].get('privileged') else "0"
    if name != None:
        overlay['GCLOUD_INSTANCE_NAME'] = 'tusk-{}'.format(hashlib.sha1(name).hexdigest())
    return overlay


def vm_exists(a):
    """Check if a VM exists."""
    return os.path.exists(os.path.join(paths.vms, a, 'Vagrantfile'))


def vm_init(name):
    """Initialize a new VM."""
    os.mkdir(os.path.join(paths.vms, name))
    shutil.copy(os.path.join(paths.root, './Vagrantfile'),
                os.path.join(paths.vms, name, 'Vagrantfile'))


def vm_clean(arg):
    """Clean a VM."""
    shutil.rmtree(os.path.join(paths.vms, arg))


def mp_consumer(inq, outq):
    while alive:
        packet = inq.get()
        if not isinstance(packet, bytes):
            outq.put(
                {"status": False, "error": "Bad message.", "retry": False})
            continue

        name = bytes(packet).decode('utf8', 'ignore')

        if vm_exists(name):
            outq.put(
                {"status": False, "error": "VM already exists.", "retry": True})
            continue

        vm_init(name)
        if vagrant.up(name, vagrant_env(name)):
            outq.put(
                {"status": False, "error": "Could not initialize VM.", "retry": True})
        else:
            ssh_config = vagrant.ssh_config(name, vagrant_env(name))
            if not ssh_config:
                outq.put(
                    {"status": False, "error": "Could not retrieve SSH config.", "retry": True})
                continue

            addr = 'tcp://0.0.0.0:44999'
            remoteaddr = 'tcp://localhost:44999'
            outq.put({"status": True, "connection": remoteaddr, "retry": True})

            print('connecting')
            rpc = None
            try:
                rpc = ssh.SSHRPC(ssh.PAIR, addr, io.StringIO(ssh_config))
                rpc.use(ssh.Handler)
                rpc.listen_loop()
            except Exception as e:
                traceback.print_exc()
            finally:
                try:
                    if rpc:
                        rpc.close()
                except:
                    traceback.print_exc()

        vagrant.destroy(name, vagrant_env(name))
        vm_clean(name)

        # TO CHECK DISK IS ASLEEP
        time.sleep(10)

    print('exiting consumer thread')


def mp_clean():
    print('Cleaning up...')
    clean = [f for f in os.listdir(
        paths.vms) if os.path.isdir(os.path.join(paths.vms, f))]
    print(clean)
    if len(clean):
        for vm in clean:
            vagrant.destroy(vm, vagrant_env(name))
            vm_clean(vm)
        # with ThreadPoolExecutor(max_workers=4) as pool:
        #     print('Cleaning', clean)
        #     future = pool.map(vm_clean, clean)
    os.rmdir(paths.vms)
    os.mkdir(paths.vms)
    print('done cleaning.')


def mp_listener(inq, outq):
    socket = Socket(REP)
    socket.bind('tcp://0.0.0.0:5858')

    print('Listening')
    while alive:
        print('alive?', alive)
        inq.put(msgpack.unpackb(socket.recv()))
        print('Bringing up machine')
        socket.send(msgpack.packb(outq.get()))
    print('exiting listener thread')
