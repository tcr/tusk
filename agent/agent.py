import atexit, shutil, os, time, sys, io, subprocess, traceback, signal
import msgpack
from nanomsg import Socket, PAIR, PUB, REP
from multiprocessing import Process, Queue, Pool, Value
import ssh

alive = Value('d', 1)
def nop():
    pass
on_kill = nop
def handler(signum, frame):
    print('did_kill')
    alive.value = 0
    on_kill()
signal.signal(signal.SIGTERM, handler)

path_root = os.path.dirname(os.path.realpath(__file__))
path_vms = os.path.join(path_root, 'vms')

# Call vagrant destroy. Allow retry in case butchered processes aborted.
def vagrant_destroy(a):
    print('exec: vagrant destroy', a)
    retry = 5
    while subprocess.call(['vagrant', 'destroy', '-f'], cwd=os.path.join(path_vms, a)) and retry > 0:
        time.sleep(5)
        retry = retry - 1
    print('done: vagrant destroy')

def vagrant_up(a):
    print('exec: vagrant up', a)
    ret = subprocess.call(['vagrant', 'up', '--provider=google'], cwd=os.path.join(path_vms, a))
    print('done: vagrant up')
    return ret

def vagrant_ssh_config(name):
    cmd = "vagrant ssh-config"
    (stdout, stderr) = subprocess.Popen(cmd.split(), stdout=subprocess.PIPE, universal_newlines=True, cwd=os.path.join(path_vms, name)).communicate()
    return stdout

# Check if a VM exists.
def vm_exists(a):
    return os.path.exists(os.path.join(path_vms, a, 'Vagrantfile'))

# Initialize a new VM.
def vm_init(name):
    os.mkdir(os.path.join(path_vms, name))
    shutil.copy(os.path.join(path_root, './config/Vagrantfile'), os.path.join(path_vms, name, 'Vagrantfile'))
    shutil.copy(os.path.join(path_root, './config/private.p12'), os.path.join(path_vms, name, 'private.p12'))

# Clean a VM.
def vm_clean(arg):
    print('well', arg)
    shutil.rmtree(os.path.join(path_vms, arg))
    print('ok')

def mp_consumer(alive, inq, outq):
    while alive.value:
        packet = inq.get()
        if not isinstance(packet, bytes):
            outq.put({"status": False, "error": "Bad message.", "retry": False})
            continue

        name = bytes(packet).decode('utf8', 'ignore')

        if vm_exists(name):
            outq.put({"status": False, "error": "VM already exists.", "retry": True})
            continue

        vm_init(name);
        if vagrant_up(name):
            outq.put({"status": False, "error": "Could not initialize VM.", "retry": True})
        else:
            config = vagrant_ssh_config(name)
            if not config:
                outq.put({"status": False, "error": "Could not retrieve SSH config.", "retry": True})
                continue

            addr = 'tcp://127.0.0.1:44555'
            outq.put({"status": True, "connection": addr, "retry": True})

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
        print('onward')
        vm_clean(name)

    print('exiting consumer thread')

def mp_clean():
    print('Cleaning up...')
    clean = [f for f in os.listdir(path_vms) if os.path.isdir(os.path.join(path_vms, f))]
    if len(clean):
        with Pool(processes=4) as pool:
            print('Cleaning', clean)
            pool.map(vm_clean, clean)
    os.rmdir(path_vms)
    os.mkdir(path_vms)
    print('done cleaning.')

def mp_listener(alive, inq):
    socket = Socket(REP)
    socket.bind('tcp://*:5858')
    def rep_cleanup():
        socket.close();
    atexit.register(rep_cleanup);

    print('Listening')
    while alive.value:
        inq.put(msgpack.unpackb(socket.recv()))
        print('Bringing up machine')
        socket.send(msgpack.packb(outq.get()))
    print('exiting listener thread')

if __name__ == '__main__':
    mp_clean()
    atexit.register(mp_clean)

    inq = Queue()
    outq = Queue()    

    pl = Process(target=mp_listener, args=(alive, inq,))
    pc = Process(target=mp_consumer, args=(alive, inq, outq))

    pl.start()
    pc.start()

    def rep_cleanup():
        pl.terminate()
    on_kill = rep_cleanup

    print('joining...')
    pl.join()
    print('joined listenre...')
    pc.join()
    print('joined consumer...')
