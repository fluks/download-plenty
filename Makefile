js := \
	background/*.js \
	content_scripts/*.js \
	download_popup/*.js \
	options/*.js \
	common/common.js
locale_files := $(shell find _locales -type f)
common_files := \
	$(locale_files) \
	$(js) \
	manifest.json \
	data/* \
	download_popup/* \
	options/* \
	l10n/* \
	common/* \
	LICENSE* \
	README.md \
	CHANGELOG
firefox_files := \
	$(common_files)
chromium_files := \
	$(common_files)

# My node version is old, this adds Array.includes support.
node := ~/Downloads/node-v9.4.0-linux-x86/bin/node
# Needed if you want to pass options for node.
web-ext := node_modules/web-ext/bin/web-ext
firefox-bin := ~/Downloads/firefox-dev/firefox
ff-profile := dev-edition-default

.PHONY: run firefox chromium clean change_to_firefox change_to_chromium lint \
	doc min_version compare_install_and_source

run:
	$(node) $(web-ext) \
		-f $(firefox-bin) \
		--pref intl.locale.requested=en \
		-u about:debugging \
		-u about:addons \
		-u https://www.turnkeyinternet.net/speed-test/ \
		-u https://eloquentjavascript.net \
		-p $(ff-profile) \
		run

version = $(shell sed -n 's/ *"version": "\(.*\)",/\1/ p' manifest.json)

firefox: change_to_firefox
	zip -r downloadplenty_$(version).xpi $(firefox_files)

chromium: change_to_chromium
	zip downloadplenty_$(version).zip $(chromium_files)

change_to_firefox:
	cp firefox/manifest.json .

change_to_chromium:
	cp chromium/manifest.json .

lint:
	# Check JSON syntax.
	$(foreach file,$(locale_files),json_xs -f json < $(file) 1>/dev/null;)
	-eslint --env es6 $(js)
	$(node) $(web-ext) lint -i doc/* node_modules/* common/purify.js l10n/l10n.js

doc:
	jsdoc -c conf.json -d doc $(js)

clean:
	rm manifest.json

# Set VERBOSITY and BROWSER environment variables, e.g. make min_version
# VERBOSITY=-vv.
VERBOSITY :=
BROWSER := firefox
min_version:
	min_ext_ver.pl $(VERBOSITY) -b $(BROWSER) $(js)

# usage: make compare_install_and_source install=PATH1 source=PATH2
# where PATH1 is path to the installed addon in
# ~/.mozilla/firefox/PROFILE/extensions/redirectlink@fluks.xpi and PATH2 is
# path to the generated xpi you can create with make firefox.
tmp_install := /tmp/_install
tmp_source := /tmp/_source
compare_install_and_source:
	@mkdir $(tmp_install)
	@unzip -qqd $(tmp_install) $(install)
	@rm -rf $(tmp_install)/META-INF
	@mkdir $(tmp_source)
	@unzip -qqd $(tmp_source) $(source)
	diff -r $(tmp_install) $(tmp_source)
	@rm -rf $(tmp_install) $(tmp_source)
