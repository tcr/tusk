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


def env():
    overlay = {}
    config = tusk()
    if config.get('gcloud'):
        overlay['GCLOUD_PROJECT_ID'] = config['gcloud'].get('project_id')
        overlay['GCLOUD_CLIENT_EMAIL'] = config['gcloud'].get('client_email')
        overlay['GCLOUD_PRIVILEGED'] = "1" if config['gcloud'].get('privileged') else "0"
    return overlay
