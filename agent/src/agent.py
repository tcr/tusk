import atexit
import shutil
import os
import time
import sys
import io
import subprocess
import traceback
import signal
import queue
from itertools import chain
import msgpack
import toml
from nanomsg import Socket, PAIR, PUB, REP
from threading import Thread, Lock
from concurrent.futures import ThreadPoolExecutor
import ssh


def handler(signum, frame):
    global alive
    print('^C shutting down python agent')
    if alive == False:
        sys.exit()
    alive = False
alive = True
signal.signal(signal.SIGTERM, handler)

path_root = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
path_vms = os.path.join(path_root, 'vms')
path_config = os.path.join(path_root, 'config')


def tusk_config():
    with open(os.path.join(path_config, "vagrant.toml")) as conffile:
        config = toml.loads(conffile.read())
    return config


def tusk_env():
    return dict(chain(dict(os.environ).items(), tusk_config().items()))


def vagrant_destroy(a):
    """
    Call vagrant destroy. Allow retry in case butchered processes aborted.
    """
    print('exec: vagrant destroy', a)
    retry = 5
    while subprocess.call(['vagrant', 'destroy', '-f'],
        cwd=os.path.join(path_vms, a),
        env=tusk_env()) and retry > 0:
        time.sleep(5)
        retry = retry - 1
    print('done: vagrant destroy')


def vagrant_up(a):
    print('exec: vagrant up', a)
    ret = subprocess.call(['vagrant', 'up', '--provider=google'],
        cwd=os.path.join(path_vms, a),
        env=tusk_env())
    print('done: vagrant up')
    return ret


def vagrant_ssh_config(name):
    cmd = "vagrant ssh-config"
    p = subprocess.Popen(cmd.split(),
                         stdout=subprocess.PIPE,
                         universal_newlines=True,
                         cwd=os.path.join(path_vms, name),
                         env=tusk_env())
    (stdout, stderr) = p.communicate()
    return stdout


def vm_exists(a):
    """Check if a VM exists."""
    return os.path.exists(os.path.join(path_vms, a, 'Vagrantfile'))


def vm_init(name):
    """Initialize a new VM."""
    os.mkdir(os.path.join(path_vms, name))
    shutil.copy(os.path.join(path_root, './Vagrantfile'),
                os.path.join(path_vms, name, 'Vagrantfile'))


def vm_clean(arg):
    """Clean a VM."""
    shutil.rmtree(os.path.join(path_vms, arg))


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
        if vagrant_up(name):
            outq.put(
                {"status": False, "error": "Could not initialize VM.", "retry": True})
        else:
            config = vagrant_ssh_config(name)
            if not config:
                outq.put(
                    {"status": False, "error": "Could not retrieve SSH config.", "retry": True})
                continue

            addr = 'tcp://0.0.0.0:44999'
            remoteaddr = 'tcp://localhost:44999'
            outq.put({"status": True, "connection": remoteaddr, "retry": True})

            print('connecting')
            rpc = None
            try:
                rpc = ssh.SSHRPC(ssh.PAIR, addr, io.StringIO(config))
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

        vagrant_destroy(name)
        vm_clean(name)

        # TO CHECK DISK IS ASLEEP
        time.sleep(10)

    print('exiting consumer thread')


def mp_clean():
    print('Cleaning up...')
    clean = [f for f in os.listdir(
        path_vms) if os.path.isdir(os.path.join(path_vms, f))]
    if len(clean):
        for vm in clean:
            vm_clean(vm)
        # with ThreadPoolExecutor(max_workers=4) as pool:
        #     print('Cleaning', clean)
        #     future = pool.map(vm_clean, clean)
    os.rmdir(path_vms)
    os.mkdir(path_vms)
    print('done cleaning.')


def mp_listener(inq):
    socket = Socket(REP)
    socket.bind('tcp://0.0.0.0:5858')

    print('Listening')
    while alive:
        print('alive?', alive)
        inq.put(msgpack.unpackb(socket.recv()))
        print('Bringing up machine')
        socket.send(msgpack.packb(outq.get()))
    print('exiting listener thread')

if __name__ == '__main__':
    try:
        os.makedirs(path_vms)
    except Exception:
        pass
    try:
        os.makedirs(path_config)
    except Exception:
        pass
    
    mp_clean()
    atexit.register(mp_clean)

    inq = queue.Queue()
    outq = queue.Queue()

    pl = Thread(target=mp_listener, args=(inq,))
    pl.daemon = True
    pc = Thread(target=mp_consumer, args=(inq, outq))
    pc.daemon = True

    pl.start()
    pc.start()

    print('joining...')
    pc.join()
    print('joined consumer...')
    # pl.join()
    # print('joined listenre...')
