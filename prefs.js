// Earth View Wallpaper GNOME extension
// Copyright (C) 2017-2021 Michael Carroll
// This extension is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// See the GNU General Public License, version 3 or later for details.
// Based on GNOME shell extension NASA APOD by Elia Argentieri https://github.com/Elinvention/gnome-shell-extension-nasa-apod
/*global log*/

import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';

import { PACKAGE_VERSION } from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js'
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Utils from './utils.js';


const providerNames = ['Google Earth', 'Google Maps', 'Bing Maps', 'OpenStreetMap' , 'GNOME Maps'];

const PREFS_DEFAULT_WIDTH = 800;
const PREFS_DEFAULT_HEIGHT = 500;

export default class GoogleEarthWallpaperPrefs extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
        this._name = metadata.name;
        this._version = metadata.version;
        if (!globalThis.GoogleEarthWallpaperState) globalThis.GoogleEarthWallpaperState = {
                gettext : _,
                PACKAGE_VERSION
        };
    }

    getPreferencesWidget() {
        // formerly globals
        let settings;
        let desktop_settings;
        let httpSession = null;
        let provider = new Gtk.CssProvider();
        // Prepare labels and controls
        settings = this.getSettings(Utils.schema);
        desktop_settings = this.getSettings(Utils.DESKTOP_SCHEMA);
        let buildable = new Gtk.Builder();
        if (Gtk.get_major_version() == 4) { // GTK4 removes some properties, and builder breaks when it sees them
            buildable.add_from_file(this.dir.get_path() + '/ui/Settings4.ui');
            provider.load_from_path(this.dir.get_path() + '/ui/prefs.css'); 
            Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        else {
            buildable.add_from_file(this.dir.get_path() + '/ui/Settings.ui');
        }
        let box = buildable.get_object('prefs_widget');

        box.connect('realize', () => {
            let window = box.get_root();
            window.default_width = PREFS_DEFAULT_WIDTH;
            window.default_height = PREFS_DEFAULT_HEIGHT;
        });

        buildable.get_object('extension_version').set_text(' v'+this._version.toString());
        buildable.get_object('extension_name').set_text(this._name.toString());

        let hideSwitch = buildable.get_object('hide');
        let iconEntry = buildable.get_object('icon');
        let bgSwitch = buildable.get_object('background');
        let styleEntry = buildable.get_object('background_style');
        let fileChooser = buildable.get_object('download_folder');
        let fileChooserBtn = buildable.get_object('download_folder_btn');
        let deleteSwitch = buildable.get_object('delete_previous');
        let refreshSpin = buildable.get_object('refresh_combo');
        let providerSpin = buildable.get_object('map_provider_combo');
        let folderButton = buildable.get_object('button_open_download_folder');
        let icon_image = buildable.get_object('icon_image');
        let change_log = buildable.get_object('change_log');
        let notifySwitch = buildable.get_object('notify');
        
        // enable change log access
        httpSession = Utils.initSoup(this._version);

        // Indicator
        settings.bind('hide', hideSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('notify', notifySwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('set-background', bgSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        
        // adjustable indicator icons
        Utils.icon_list.forEach(iconname => { // add icons to dropdown list (aka a GtkComboText)
            iconEntry.append(iconname, iconname); // ID(string), TEXT
        });
        settings.bind('icon', iconEntry, 'active_id', Gio.SettingsBindFlags.DEFAULT);
        settings.connect('changed::icon', () => {
            Utils.validate_icon(settings, this.dir, icon_image);
        });
        iconEntry.set_active_id(settings.get_string('icon'));
        Utils.validate_icon(settings, this.dir, icon_image);
        //download folder
        
        if (Gtk.get_major_version() == 4) {
            fileChooserBtn.set_label(settings.get_string('download-folder'));
            
            fileChooserBtn.connect('clicked', widget => {
                let parent = widget.get_root();
                fileChooser.set_transient_for(parent);
                fileChooser.set_current_folder(Gio.File.new_for_path(settings.get_string('download-folder')).get_parent());
                fileChooser.set_action(Gtk.FileChooserAction.SELECT_FOLDER);
                fileChooser.set_transient_for(parent);
                fileChooser.set_accept_label(_('Select folder'));
                fileChooser.show();
            });

            fileChooser.connect('response', (widget, response) => {
                if (response !== Gtk.ResponseType.ACCEPT) {
                    return;
                }
                let fileURI = widget.get_file().get_uri().replace('file://', '');
                log("fileChooser returned: " + fileURI);
                fileChooserBtn.set_label(fileURI);
                let oldPath = settings.get_string('download-folder');
                Utils.moveImagesToNewFolder(settings, oldPath, fileURI);
                settings.set_string('download-folder', fileURI);
            });
            
            folderButton.connect('clicked', () => {
                ge_tryspawn(["xdg-open", settings.get_string('download-folder')]);
                log('open_background_folder ' + settings.get_string('download-folder'));
            });
        } else { // GTK != 4
            fileChooser.set_filename(settings.get_string('download-folder'));
            fileChooser.add_shortcut_folder_uri("file://" + GLib.get_user_cache_dir() + "/GoogleEarthWallpaper");

            fileChooser.connect('file-set', widget => {
                settings.set_string('download-folder', widget.get_filename());
            });
            
            folderButton.connect('button-press-event', () => {
                ge_tryspawn(["xdg-open", settings.get_string('download-folder')]);
                log('open_background_folder ' + settings.get_string('download-folder'));
            }); 
        }

        settings.bind('delete-previous', deleteSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

        const intervals = [ 300, 600, 1800, 3600, 4800, 86400 ];
        const interval_names = [_("5 m"), _("10 m"), _("30 m"), _("60 m"), _("90 m"), _("daily")];

        intervals.forEach((interval, index) => { // add intervals to dropdown list (aka a GtkComboText)
            refreshSpin.append(interval.toString(), interval_names[index]);
        });

        refreshSpin.set_active_id(settings.get_int('refresh-interval').toString()); // set to current
        refreshSpin.connect('changed', () => {
            settings.set_int('refresh-interval', parseInt(refreshSpin.get_active_id(), 10));
            log('Refresh interval currently set to ' + refreshSpin['active_id']);
        });

        settings.connect('changed::refresh-interval', () => {
            refreshSpin.set_active_id(settings.get_int('refresh-interval').toString());
            log('Refresh interval set to ' + refreshSpin['active_id']);
        });

        providerNames.forEach((provider, index) => { // add map providers to dropdown list (aka a GtkComboText)
            providerSpin.append(index.toString(), provider);
        });

        providerSpin.set_active_id(settings.get_enum('map-link-provider').toString()); // set to current
        providerSpin.connect('changed', () => {
            settings.set_enum('map-link-provider', parseInt(providerSpin.get_active_id(), 10));
        });

        settings.connect('changed::map-link-provider', () => {
            providerSpin.set_active_id(settings.get_enum('map-link-provider').toString());
        });

        // background styles (e.g. zoom or span)
        Utils.backgroundStyle.forEach(style => {
            styleEntry.append(style, style);
        });
        desktop_settings.bind('picture-options', styleEntry, 'active_id', Gio.SettingsBindFlags.DEFAULT);

        // not required in GTK4 as widgets are displayed by default
        if (Gtk.get_major_version() < 4)
            box.show_all();

        // fetch
        Utils.fetch_change_log(this._version.toString(), change_log, httpSession);

        return box;
    }
}


function ge_tryspawn(argv) {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    }
    catch (err) {
        log("Unable to open: "+argv[0]+" error: "+err);
    }
}
