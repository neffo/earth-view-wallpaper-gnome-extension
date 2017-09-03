#!/bin/bash

glib-compile-schemas schemas/

zip -r GoogleEarthWallpaper@neffo.github.com.zip *

zip -d GoogleEarthWallpaper@neffo.github.com.zip screenshot/* screenshot buildzip.sh

