"""
Simple local Vagrant controller.
"""

import time
import os
import subprocess
from itertools import chain
from . import paths

def overlay_env(overlay):
    return dict(chain(dict(os.environ).items(), overlay.items()))


def destroy(a, env={}, retry=5):
    """
    Call vagrant destroy. Allow retry in case butchered processes aborted.
    """
    print('exec: vagrant destroy', a)
    while subprocess.call(['vagrant', 'destroy', '-f'],
        cwd=os.path.join(paths.vms, a),
        env=overlay_env(env)) and retry > 0:
        time.sleep(5)
        retry = retry - 1
    print('done: vagrant destroy')


def up(a, env={}, provider="google"):
    print('exec: vagrant up', a)
    ret = subprocess.call(['vagrant', 'up', '--provider=' + str(provider)],
        cwd=os.path.join(paths.vms, a),
        env=overlay_env(env))
    print('done: vagrant up')
    return ret


def ssh_config(name, env={}):
    cmd = "vagrant ssh-config"
    p = subprocess.Popen(cmd.split(),
                         stdout=subprocess.PIPE,
                         universal_newlines=True,
                         cwd=os.path.join(paths.vms, name),
                         env=overlay_env(env))
    (stdout, stderr) = p.communicate()
    return stdout
