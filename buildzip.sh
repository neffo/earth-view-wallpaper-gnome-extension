#!/bin/bash

EXTENSION_NAME=GoogleEarthWallpaper@neffo.github.com
ZIP_NAME=$EXTENSION_NAME.zip

# stop build if this doesn't work
npm --version && (npm test; if [ $? -ne 0 ]; then exit 1; fi)

glib-compile-schemas schemas/
intltool-extract --type=gettext/glade ui/Settings.ui 
intltool-extract --type=gettext/glade ui/Settings4.ui
xgettext -k -k_ -kN_ -o locale/GoogleEarthWallpaper.pot ui/Settings.ui.h ui/Settings4.ui.h extension.js prefs.js utils.js --from-code=UTF-8

for D in locale/*; do
    if [ -d "${D}" ]; then
        msgfmt --statistics --template=locale/GoogleEarthWallpaper.pot --verbose -o "${D}/LC_MESSAGES/GoogleEarthWallpaper.mo" "${D}/LC_MESSAGES/GoogleEarthWallpaper.po" 2> translations.txt  # compile translations
    fi
done

rm $ZIP_NAME

zip -r $ZIP_NAME *

zip -d $ZIP_NAME screenshot/* screenshot buildzip.sh Settings.ui.h *.py *~ *.sh .* translations.txt *.h package.json *.yaml *.po *.pot
