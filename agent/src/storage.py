import io
import time
import os,sys,boto
from boto.gs.connection import GSConnection
from boto.s3.key import Key
from boto.gs.resumable_upload_handler import ResumableUploadHandler
from boto.s3.resumable_download_handler import ResumableDownloadHandler

from agent import tusk_config

def connect():
    config = tusk_config().get('gstorage')
    if config:
        return boto.connect_gs(config.get('key'), config.get('secret'))

def upload(fd, conn, bucket, key):
    dst_bucket = conn.get_bucket(bucket)
    res_upload_handler = ResumableUploadHandler()
    dst_key = dst_bucket.new_key(key)
    res_upload_handler.send_file(dst_key, fd, {})

def download(fd, conn, bucket, key):
    src_bucket = conn.get_bucket(bucket)
    res_download_handler = ResumableDownloadHandler()
    src_key = src_bucket.get_key(key)
    res_download_handler.get_file(src_key, fd, {})