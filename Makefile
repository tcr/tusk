.PHONY: noop-actions

ANSIBLE_PATH:=$(shell greadlink -f $(shell which ansible))
ANSIBLE_PKG:=$(shell dirname $(ANSIBLE_PATH))/../libexec/lib/python2.7/site-packages/ansible
ANSIBLE_ACTION_PLUGINS:=$(ANSIBLE_PKG)/runner/action_plugins

gcloud:
	gcloud compute disks list
	gcloud compute instances list

action/%.py:
	cp action/noop.py $@

noop-actions: $(addprefix action/, $(notdir $(wildcard $(ANSIBLE_ACTION_PLUGINS)/*.py)))