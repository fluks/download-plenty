js := \
	background/*.js \
	content_scripts/*.js \
	download_popup/*.js \
	options/*.js
locale_files := $(shell find _locales -type f)
common_files := \
	$(locale_files) \
	$(js) \
	manifest.json \
	data/* \
	download_popup/* \
	options/*
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

.PHONY: run firefox chromium clean change_to_firefox change_to_chromium lint doc

run:
	$(node) $(web-ext) \
		-f $(firefox-bin) \
		-u about:debugging \
		-u about:addons \
		-u https://www.turnkeyinternet.net/speed-test/ \
		-u https://eloquentjavascript.net \
		-p $(ff-profile) \
		run

firefox: change_to_firefox
	zip -r downloadthemall.xpi $(firefox_files)

chromium: change_to_chromium
	zip downloadthemall.zip $(chromium_files)

change_to_firefox:
	cp firefox/manifest.json .

change_to_chromium:
	cp chromium/manifest.json .

lint:
	# Check JSON syntax.
	$(foreach file,$(locale_files),json_xs -f json < $(file) 1>/dev/null;)
	-eslint --env es6 $(js)
	$(node) $(web-ext) lint -i doc/* node_modules/*

doc:
	jsdoc -c conf.json -d doc $(js)

clean:
	rm manifest.json
