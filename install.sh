#!/bin/bash

EXTENSION_NAME=GoogleEarthWallpaper@neffo.github.com
INSTALL_PATH=~/.local/share/gnome-shell/extensions
ZIP_NAME=$EXTENSION_NAME.zip

./buildzip.sh
if [ $? -ne 0 ]; then 
    echo "ERROR: build failed!"
    exit 1
fi

# this might be better to use the official installer script if it handles .zip files
unzip -o $ZIP_NAME -d $INSTALL_PATH/$EXTENSION_NAME/
