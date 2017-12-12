# GNOME Shell extension - Google Earth Wallpaper

Lightweight GNOME shell extension to set your wallpaper to a random Google Earth photo from a selection of curated locations (around 1500). It will
also show a notification containing the location of the image.

*Disclaimer*: this extension is unofficial and not affiliated with Google in any way. Images are protected by copyright, and are licensed only
for use as wallpapers.

This extension is derived from my [Bing Wallpaper](https://github.com/neffo/bing-wallpaper-gnome-extension) GNOME extension, which was based extensively on the NASA APOD extension by [Elinvention](https://github.com/Elinvention). Curated locations and images come from Google's [Earth View](https://earthview.withgoogle.com/) website and the [associated Chrome extension](https://chrome.google.com/webstore/detail/earth-view-from-google-ea/bhloflhklmhfpedakmangadcdofhnnoh?hl=en).

## Features

* Fetches a random Google Earth wallpaper and sets as both lock screen and desktop wallpaper
* User selectable refresh intervals (default is once per day)
* Optional: keep images or clean up after (later is default)
* View location on Google Maps, Bing Maps, Gnome Maps, OpenStreetMaps
* Place pin on a map in settings
* Adjustable indicator brightness (to match themes better)

## TODO

* Migrate to Champlain for Map View (in prefs)
* Location relative to user
* Pixel scale

## Requirements

Gnome 3.18+ (Ubuntu Gnome 16.04+, Fedora 23+)

## Install

[Install from extensions.gnome.org](https://extensions.gnome.org/extension/1295/google-earth-wallpaper/)

or install directly to your GNOME extensions directory (if you want to hack on it)

`git clone https://github.com/neffo/earth-view-wallpaper-gnome-extension.git $HOME/.local/share/gnome-shell/extensions/GoogleEarthWallpaper@neffo.github.com`

Or, here is a suitable [zip file](https://neffo.github.io/GoogleEarthWallpaper@neffo.github.com.zip) I prepared earlier.

## Screenshots

![Screenshot](/screenshot/notification.jpg)

![Settings](/screenshot/settings.png)

![About Page](/screenshot/map.png)
