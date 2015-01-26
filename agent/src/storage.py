import io
import time
import os,sys,boto
import humanize
from boto.gs.connection import GSConnection
from boto.s3.key import Key
from boto.gs.resumable_upload_handler import ResumableUploadHandler
from boto.s3.resumable_download_handler import ResumableDownloadHandler
from . import config

def connect():
    gconf = config.tusk().get('gstorage')
    if gconf:
        return boto.connect_gs(gconf.get('key'), gconf.get('secret'))
    else:
        return None

def upload(fd, conn, bucket, key):
    sys.stderr.write('Staring upload...');
    def progress(written, total):
        sys.stderr.write('\r\033[K{}/{}'.format(humanize.naturalsize(written), humanize.naturalsize(total)))

    dst_bucket = conn.get_bucket(bucket)
    res_upload_handler = ResumableUploadHandler()
    dst_key = dst_bucket.new_key(key)
    res_upload_handler.send_file(dst_key, fd, {}, num_cb=-1, cb=progress)
    sys.stderr.write('Upload complete!')

def download(fd, conn, bucket, key):
    src_bucket = conn.get_bucket(bucket)
    res_download_handler = ResumableDownloadHandler()
    src_key = src_bucket.get_key(key)
    res_download_handler.get_file(src_key, fd, {})
