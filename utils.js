// Earth View Wallpaper GNOME extension
// Copyright (C) 2017-2021 Michael Carroll
// This extension is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// See the GNU General Public License, version 3 or later for details.
// Based on GNOME shell extension NASA APOD by Elia Argentieri https://github.com/Elinvention/gnome-shell-extension-nasa-apod
/*global log*/

import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

const gitreleaseurl = 'https://api.github.com/repos/neffo/earth-view-wallpaper-gnome-extension/releases/tags/';

export const icon_list = ['pin', 'globe','official'];
export const icon_list_filename = ['pin-symbolic', 'globe-symbolic', 'official'];
export const backgroundStyle = ['none', 'wallpaper', 'centered', 'scaled', 'stretched', 'zoom', 'spanned'];

export const DESKTOP_SCHEMA = 'org.gnome.desktop.background';
export const schema = 'org.gnome.shell.extensions.googleearthwallpaper';

export const Bytes = new TextDecoder()

export function friendly_time_diff(time, short = true) {
    const _ = globalThis.GoogleEarthWallpaperState.gettext;
    // short we want to keep ~4-5 characters
    let timezone = GLib.TimeZone.new_local();
    let now = GLib.DateTime.new_now(timezone).to_unix();
    let seconds = time.to_unix() - now;

    if (seconds <= 0) {
        return "now";
    }
    else if (seconds < 60) {
        return "< 1 "+(short?"m":_("minutes"));
    }
    else if (seconds < 3600) {
        return Math.round(seconds/60)+" "+(short?"m":_("minutes"));
    }
    else if (seconds > 86400) {
        return Math.round(seconds/86400)+" "+(short?"d":_("days"));
    }
    else {
        return Math.round(seconds/3600)+" "+(short?"h":_("hours"));
    }
}

export function friendly_coordinates(lat, lon) {
  return Math.abs(lat).toFixed(4)+(lat>0 ? 'N': 'S')+', '+Math.abs(lon).toFixed(4)+(lon>0 ? 'E':'W');
}

export function initSoup(version) {
    const PACKAGE_VERSION = globalThis.GoogleEarthWallpaperState.PACKAGE_VERSION;
    let httpSession = new Soup.Session();
    httpSession.user_agent = 'User-Agent: Mozilla/5.0 (GNOME Shell/' + PACKAGE_VERSION + '; Linux; +https://github.com/neffo/earth-view-wallpaper-gnome-extension ) Google Earth Wallpaper Gnome Extension/' + version;
    return httpSession;
}

export function fetch_change_log(version, label, httpSession) {
    // create an http message
    let url = gitreleaseurl + "v" + version;
    let request = Soup.Message.new('GET', url);

    // queue the http request
    log("Fetching "+url);

    // a try block doesn't catch async exceptions from outside the callback
    httpSession.send_and_read_async(request, GLib.PRIORITY_DEFAULT, null, (httpSession, message) => {
        try {
            let data = Bytes.decode(httpSession.send_and_read_finish(message).get_data());
            let text = JSON.parse(data).body;
            label.set_label(text);
        }
        catch (error) {
            log("Error fetching change log: " + error);
            const _ = globalThis.GoogleEarthWallpaperState.gettext;
            label.set_label(_("Error fetching change log: "+error));
        }
    });
}

export function validate_icon(settings, dir, icon_image = null) {
    log('validate_icon()');
    let icon_name = settings.get_string('icon');
    if (icon_name == "" || icon_list.indexOf(icon_name) == -1) {
        settings.reset('icon');
        icon_name = settings.get_string('icon');
    }
    // if called from prefs
    if (icon_image) {
        log('set icon to: ' + dir.get_path() + '/icons/' + icon_name + '-symbolic.svg');
        let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(dir.get_path() + '/icons/' + icon_list_filename[icon_list.indexOf(icon_name)] + '.svg', 32, 32);
        icon_image.set_from_pixbuf(pixbuf);
    }
}

export function moveImagesToNewFolder(settings, oldPath, newPath) {
    let dir = Gio.file_new_for_path(oldPath);
    let dirIter = dir.enumerate_children('', Gio.FileQueryInfoFlags.NONE, null );
    let newDir = Gio.file_new_for_path(newPath);
    if (!newDir.query_exists(null)) {
        newDir.make_directory_with_parents(null);
    }
    let file = null;
    while ((file = dirIter.next_file(null))) {
        let filename = file.get_name(); // we only want to move files that we think we own
        if (filename.match(/.+\.jpg/i)) {
            log('file: ' + slash(oldPath) + filename + ' -> ' + slash(newPath) + filename);
            let cur = Gio.file_new_for_path(slash(oldPath) + filename);
            let dest = Gio.file_new_for_path(slash(newPath) + filename);
            cur.move(dest, Gio.FileCopyFlags.OVERWRITE, null, () => {
                log ('...moved');
            });
        }
    }
    // correct filenames for GNOME backgrounds
    if (settings.get_boolean('set-background'))
        moveBackground(oldPath, newPath, DESKTOP_SCHEMA);
}


function slash(path) {
    if (!path.endsWith('/'))
        return path+'/';
    return path;
}

function moveBackground(oldPath, newPath, schema) {
    let gsettings = new Gio.Settings({schema: schema});
    let uri;
    let dark_uri;
    uri = gsettings.get_string('picture-uri');
    gsettings.set_string('picture-uri', uri.replace(oldPath, newPath));
    try {
        dark_uri = gsettings.get_string('picture-uri-dark');
        gsettings.set_string('picture-uri-dark', dark_uri.replace(oldPath, newPath));
    }
    catch (e) {
        log('no dark background gsettings key found ('+e+')');
    }

    Gio.Settings.sync();
    gsettings.apply();
}
