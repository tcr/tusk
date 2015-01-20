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
import msgpack
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


def vagrant_destroy(a):
    """
    Call vagrant destroy. Allow retry in case butchered processes aborted.
    """
    print('exec: vagrant destroy', a)
    retry = 5
    while subprocess.call(['vagrant', 'destroy', '-f'], cwd=os.path.join(path_vms, a)) and retry > 0:
        time.sleep(5)
        retry = retry - 1
    print('done: vagrant destroy')


def vagrant_up(a):
    print('exec: vagrant up', a)
    ret = subprocess.call(
        ['vagrant', 'up', '--provider=google'], cwd=os.path.join(path_vms, a))
    print('done: vagrant up')
    return ret


def vagrant_ssh_config(name):
    cmd = "vagrant ssh-config"
    p = subprocess.Popen(cmd.split(),
                         stdout=subprocess.PIPE,
                         universal_newlines=True,
                         cwd=os.path.join(path_vms, name))
    (stdout, stderr) = p.communicate()
    return stdout


def vm_exists(a):
    """Check if a VM exists."""
    return os.path.exists(os.path.join(path_vms, a, 'Vagrantfile'))


def vm_init(name):
    """Initialize a new VM."""
    os.mkdir(os.path.join(path_vms, name))
    shutil.copy(os.path.join(path_root, './config/Vagrantfile'),
                os.path.join(path_vms, name, 'Vagrantfile'))
    shutil.copy(os.path.join(path_root, './config/private.p12'),
                os.path.join(path_vms, name, 'private.p12'))


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

        print('!!!STOPPED THREAD')
        vagrant_destroy(name)
        print('!!!VESTROYED IT')
        vm_clean(name)
        print('!!!CLEANED IT')

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
