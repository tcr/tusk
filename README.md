# tusk

A build / test tool.

## usage

```
Usage:
  tusk build <id> [--input=<arg>]... [--force] [--preserve]
  tusk cache <id> [--input=<arg>]... [--delete] [--force]
  tusk dependencies <id> [--detail]
  tusk resources [--match=<arg>]...
  tusk -h | --help

Options:
  -i, --input=<arg>      Input variable.
  -m, --match=<arg>      Match resources.
```

## plan

Plans are YAML files with a few subsections:

**source:** The Github repository that this plan corresponds to. Is downloaded into `/tusk/source`.

**roles:** Install ansible roles when building. (Checked against a whitelist.)

**setup:** Setup for building. (TODO: cache this in build image when unmodified between builds.)

**tasks:** Tasks for building. Mostly imperative code.

## order

* pull down deps
* sources
* roles
* setup
* tasks
* upload

Upload uploads /tusk/result/.

What about incoming branch?

- Firmware build from old branch (doesn't rely on runtime, just submodules)
- Firmware new build (relies on tracking runtime/master). when master, update runtime with master.

on [master], pull in branch changes.
rsync changes and deploy them as merged master

- if branch is specified pull in changes
- if building master, if changed, tag and push master

- if branch specified, pull in changes
- [*] if on a master, update runtime with master as check
- if building master, if changed, tag and push master

- on [master], update runtime with master as check
rsync changes and dpeloy them as merged master
we're on [incoming] if we issued a thing

## setup

```
gcloud:
    project_id: "..."
    client_email: "...@developer.gserviceaccount.com"
```

See https://github.com/mitchellh/vagrant-google#google-cloud-platform-setup

## license

MIT/ASL2