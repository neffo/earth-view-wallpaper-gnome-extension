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

var gitreleaseurl = 'https://api.github.com/repos/neffo/earth-view-wallpaper-gnome-extension/releases/tags/';

function getSettings() {
	let extension = ExtensionUtils.getCurrentExtension();
	let schema = 'org.gnome.shell.extensions.googleearthwallpaper';

	const GioSSS = Gio.SettingsSchemaSource;

	// check if this extension was built with "make zip-file", and thus
	// has the schema files in a subfolder
	// otherwise assume that extension has been installed in the
	// same prefix as gnome-shell (and therefore schemas are available
	// in the standard folders)
	let schemaDir = extension.dir.get_child('schemas');
	let schemaSource;
	if (schemaDir.query_exists(null)) {
		schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
				GioSSS.get_default(),
				false);
	} else {
		schemaSource = GioSSS.get_default();
	}

	let schemaObj = schemaSource.lookup(schema, true);
	if (!schemaObj) {
		throw new Error('Schema ' + schema + ' could not be found for extension ' +
				extension.metadata.uuid + '. Please check your installation.');
	}

	return new Gio.Settings({settings_schema: schemaObj});
}

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
function dump(object) {
    let output = '';
    for (let property in object) {
        output += property + ': ' + object[property]+'; ';
    }
    log(output);
}
