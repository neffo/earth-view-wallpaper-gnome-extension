#!/bin/bash

glib-compile-schemas schemas/
intltool-extract --type=gettext/glade Settings.ui
xgettext -k -k_ -kN_ -o locale/GEWallpaper.pot Settings.ui.h extension.js prefs.js --from-code=UTF-8

zip -r GoogleEarthWallpaper@neffo.github.com.zip *

zip -d GoogleEarthWallpaper@neffo.github.com.zip screenshot/* screenshot buildzip.sh
