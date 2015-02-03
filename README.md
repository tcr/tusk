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

## license

MIT/ASL2