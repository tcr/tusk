import os
import yaml
from . import paths

def tusk():
    path = os.path.join(paths.config, "tusk.yaml")
    if not os.path.exists(path):
        return {}
    with open(path) as conffile:
        config = yaml.load(conffile.read())
    return config
