#!/usr/bin/env python
# Adapted from Mark Mandel's implementation
# https://github.com/ansible/ansible/blob/devel/plugins/inventory/vagrant.py
import sys, atexit, signal, os, traceback, time
import argparse, json, subprocess
import paramiko, msgpack
from nanomsg import Socket, PAIR, PUB, NanoMsgAPIError

socket = Socket(PAIR)
socket.bind('tcp://*:5858')

socket._set_recv_timeout(1)
try:
	incoming = socket.recv()
except NanoMsgAPIError as e:
	print('hi')
