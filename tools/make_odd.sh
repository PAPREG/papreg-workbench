#!/usr/bin/env bash
# Draft ODD by example from the TEI exports of the test side (the schema the export actually uses).
#   ./tools/make_odd.sh      -> docs/papreg_draft.odd
# Needs java and network once (Saxon-HE 9.9.1-8 from Maven Central, oddbyexample.xsl from TEIC/Stylesheets, p5subset.xml from tei-c.org); the
# downloads go to a temporary directory. The result is a DRAFT: it describes what the export uses, it does not validate it.
set -eu
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/corpus"
# the exports: the untouched side and a side with the editor's interventions (written by the TEI test)
rm -rf /tmp/wb-odd-profile
TEI_OUT="$T/corpus/tei" node tests/tei_test.mjs >/dev/null
curl -sfL -o "$T/saxon.jar" https://repo1.maven.org/maven2/net/sf/saxon/Saxon-HE/9.9.1-8/Saxon-HE-9.9.1-8.jar
curl -sfL -o "$T/oddbyexample.xsl" https://raw.githubusercontent.com/TEIC/Stylesheets/dev/tools/oddbyexample.xsl
curl -sfL -o "$T/p5subset.xml" https://tei-c.org/Vault/P5/current/xml/tei/odd/p5subset.xml
java -jar "$T/saxon.jar" -s:"$T/corpus/tei.edited.xml" -xsl:"$T/oddbyexample.xsl" corpus="$T/corpus/" defaultSource="file://$T/p5subset.xml" -o:docs/papreg_draft.odd
echo "written docs/papreg_draft.odd ($(wc -c < docs/papreg_draft.odd) bytes); draft, not validated"
