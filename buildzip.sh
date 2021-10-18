#!/bin/bash

glib-compile-schemas schemas/
intltool-extract --type=gettext/glade Settings.ui 
intltool-extract --type=gettext/glade Settings4.ui
xgettext -k -k_ -kN_ -o locale/GoogleEarthWallpaper.pot Settings.ui.h Settings4.ui.h extension.js prefs.js utils.js --from-code=UTF-8

for D in locale/*; do
    if [ -d "${D}" ]; then
        msgfmt --statistics --template=locale/GoogleEarthWallpaper.pot --verbose -o "${D}/LC_MESSAGES/GoogleEarthWallpaper.mo" "${D}/LC_MESSAGES/GoogleEarthWallpaper.po" 2>> translations.txt  # compile translations
    fi
done

rm GoogleEarthWallpaper@neffo.github.com.zip

zip -r GoogleEarthWallpaper@neffo.github.com.zip *

zip -d GoogleEarthWallpaper@neffo.github.com.zip screenshot/* screenshot buildzip.sh Settings.ui.h *.py *~ *.sh .* translations.txt *.h package.json *.po *.pot
