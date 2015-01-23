import sys
import atexit
import signal
import os
import traceback
import time
import argparse
import json
import subprocess
import paramiko
import traceback
import json
import shlex
from .rpackc import RPC
from nanomsg import Socket, PAIR, PUB, NanoMsgAPIError
from . import storage, paths


def run_command(ssh, rpc, cmd, env = {}):
    rpc.send('command_enter', {"id": 0, "cmd": cmd})

    chan = rpc.ssh.get_transport().open_session()
    chan.setblocking(0)
    # chan.settimeout(10800)

    for k,v in env.items():
        cmd = 'export {}={}; {}'.format(bytes(k).decode('utf-8'), shlex.quote(bytes(v).decode('utf-8')), cmd)
    chan.exec_command(cmd)

    # flush all data.
    exit_ready = False
    stdout_done = False
    stderr_done = False
    while not (exit_ready and stdout_done and stderr_done):
        exit_ready = chan.exit_status_ready()

        # stdout and stderr may not be done after exit code is
        # returned. also .recv() returning length 0 is the only
        # way to know of a terminated stream, recv_ready and
        # recv_stderr_ready return true if there is at least
        # one byte in queue.

        try:
            if exit_ready or chan.recv_ready():
                res = chan.recv(64 * 1024)
                stdout_done = len(res) == 0
                # sys.stderr.write(res)
                if len(res):
                    rpc.send('out', res)
        except:
            pass

        try:
            if exit_ready or chan.recv_stderr_ready():
                res = chan.recv_stderr(64 * 1024)
                stderr_done = len(res) == 0
                # sys.stdout.write(res)
                # s2.send(res)
                if len(res):
                    rpc.send('err', res)
        except:
            pass

    code = chan.recv_exit_status()
    rpc.send('command_exit', {"id": 0, "cmd": cmd, "code": code})
    return code


class SSHRPC(RPC):

    def __init__(self, kind, addr, sshout):
        super().__init__(kind, addr)

        config = paramiko.SSHConfig()
        config.parse(sshout)
        self.config = config.lookup('default')

        self.cmdid = 0

    def upload(self, src, dest):
        # Copy a file out.
        result = False
        size = 0
        try:
            sftp = self.ssh.open_sftp()
            sftp.put(src, dest)
            sftp.close()

            result = True
        except Exception as e:
            print(e)
            pass

        return (result,)

    def download(self, src, dest_bucket, dest_key):
        # Copy a file out.
        result = False
        size = 0
        url = None
        try:
            sftp = self.ssh.open_sftp()
            size = sftp.stat(src).st_size
            fd = sftp.open(src, mode="rb")
            storage.upload(fd, storage.connect(), dest_bucket, dest_key)
            url = "https://storage.googleapis.com/{}/{}".format(dest_bucket, dest_key)
            fd.close()
            sftp.close()

            result = True
        except Exception as e:
            traceback.print_exc()
            pass

        return (result, size, url)


class Handler:

    @staticmethod
    def start(rpc, *args):
        # Create SSH client.
        rpc.ssh = paramiko.SSHClient()

        def ssh_cleanup():
            rpc.ssh.close()
        atexit.register(ssh_cleanup)

        # Connect SSH.
        rpc.ssh.load_host_keys("/dev/null")
        rpc.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        rpc.ssh.connect(rpc.config['hostname'],
                username = rpc.config['user'],
                port = int(rpc.config['port']) if rpc.config.get('port') else None,
                key_filename = rpc.config['identityfile'][0]
                    if isinstance(rpc.config['identityfile'], list)
                    else rpc.config['identityfile'])

        rpc.send('start')

        # Self-test
        rpc.upload(os.path.realpath(os.path.join(paths.config, 'gcloud.p12')), '/home/tim/gcloud.p12')
        rpc.upload(os.path.realpath(os.path.join(paths.config, 'vagrant.toml')), '/home/tim/vagrant.toml')
        rpc.upload(os.path.realpath(os.path.join(paths.config, 'tusk.yaml')), '/home/tim/tusk.yaml')
        rpc.upload(os.path.realpath(os.path.join(paths.config, 'github.key')), '/home/tim/github.key')

    @staticmethod
    def process_start(rpc, req):
        cmdid = rpc.cmdid
        rpc.cmdid += 1

        cmds = req.get(b'commands', [])
        env = req.get(b'env', {})

        print(cmds)
        print(env)

        code = 0
        for cmd in cmds:
            cmd = (bytes(cmd) or b'').decode('utf-8', 'ignore')
            print(cmd)

            code = run_command(rpc.ssh, rpc, cmd, env)
            if code != 0:
                break

        rpc.send('process_exit', {"id": cmdid, "code": code})

    @staticmethod
    def download(rpc, dest):
        source = bytes(dest[b'source']).decode('utf8', 'ignore')
        bucket = bytes(dest[b'bucket']).decode('utf8', 'ignore')
        key = bytes(dest[b'path']).decode('utf8', 'ignore')

        (result, size, url) = rpc.download(source, bucket, key)
        if result:
            rpc.send('download_ready', {
                "available": True,
                "size": size,
                "url": url,
            })
        else:
            rpc.send('download_ready', {
                "available": False,
            })

    @staticmethod
    def exit(rpc, *args):
        rpc.alive = False
        rpc.send('exit')
