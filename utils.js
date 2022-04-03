// Earth View Wallpaper GNOME extension
// Copyright (C) 2017-2021 Michael Carroll
// This extension is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// See the GNU General Public License, version 3 or later for details.
// Based on GNOME shell extension NASA APOD by Elia Argentieri https://github.com/Elinvention/gnome-shell-extension-nasa-apod
/*global imports, log*/

const {Gio, GLib, GdkPixbuf, Soup} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain('BingWallpaper');
const _ = Gettext.gettext;

var icon_list = ['pin', 'globe','official'];
var icon_list_filename = ['pin-symbolic', 'globe-symbolic', 'official'];
var backgroundStyle = ['none', 'wallpaper', 'centered', 'scaled', 'stretched', 'zoom', 'spanned'];

var gitreleaseurl = 'https://api.github.com/repos/neffo/earth-view-wallpaper-gnome-extension/releases/tags/';
var schema = 'org.gnome.shell.extensions.googleearthwallpaper';
var DESKTOP_SCHEMA = 'org.gnome.desktop.background';

function friendly_time_diff(time, short = true) {
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

function friendly_coordinates(lat, lon) {
  return Math.abs(lat).toFixed(4)+(lat>0 ? 'N': 'S')+', '+Math.abs(lon).toFixed(4)+(lon>0 ? 'E':'W');
}

function clamp_value(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function fetch_change_log(version, label, httpSession) {
	// create an http message
	let url = gitreleaseurl + "v" + version;
	let request = Soup.Message.new('GET', url);
	httpSession.user_agent = 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:'+version+') Google Earth Wallpaper Gnome Extension';
	log("Fetching "+url);
	// queue the http request
	httpSession.queue_message(request, function (httpSession, message) {
		if (message.status_code == 200) {
			let data = message.response_body.data;
			let text = JSON.parse(data).body;
			label.set_label(text);
		} 
		else {
			log("Change log not found: " + message.status_code + "\n" + message.response_body.data);
			label.set_label(_("No change log found for this release") + ": " + message.status_code);
		}
	});
}

function validate_icon(settings, icon_image = null) {
	log('validate_icon()');
	let icon_name = settings.get_string('icon');
	if (icon_name == "" || icon_list.indexOf(icon_name) == -1) {
		settings.reset('icon');
		icon_name = settings.get_string('icon');
	}
	// if called from prefs
	if (icon_image) { 
		log('set icon to: ' + Me.dir.get_path() + '/icons/' + icon_name + '-symbolic.svg');
		let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(Me.dir.get_path() + '/icons/' + icon_list_filename[icon_list.indexOf(icon_name)] + '.svg', 32, 32);
		icon_image.set_from_pixbuf(pixbuf);
	}
}

// Utility function
function dump(object, level = 0) {
    let output = '';
    for (let property in object) {
        output += "-".repeat(level)+property + ': ' + object[property]+'\n ';
		if ( typeof property === 'object' )
			output += dump(property, level+1);
    }
	if (level == 0)
		log(output);
    return(output);
}

function moveImagesToNewFolder(settings, oldPath, newPath) {
    let dir = Gio.file_new_for_path(oldPath);
    let dirIter = dir.enumerate_children('', Gio.FileQueryInfoFlags.NONE, null );
    let newDir = Gio.file_new_for_path(newPath);
    if (!newDir.query_exists(null)) {
        newDir.make_directory_with_parents(null);
    }
    let file = null;
    while (file = dirIter.next_file(null)) {
        let filename = file.get_name(); // we only want to move files that we think we own
        if (filename.match(/.+\.jpg/i)) {
            log('file: ' + slash(oldPath) + filename + ' -> ' + slash(newPath) + filename);
            let cur = Gio.file_new_for_path(slash(oldPath) + filename);
            let dest = Gio.file_new_for_path(slash(newPath) + filename);
            cur.move(dest, Gio.FileCopyFlags.OVERWRITE, null, function () { log ('...moved'); });
        }
    }
    // correct filenames for GNOME backgrounds
    if (settings.get_boolean('set-background'))
        moveBackground(oldPath, newPath, DESKTOP_SCHEMA);
}

function dirname(path) {
    return path.match(/.*\//);
}

function slash(path) {
    if (!path.endsWith('/'))
        return path += '/';
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
