// Earth View Wallpaper GNOME extension
// Copyright (C) 2017-2021 Michael Carroll
// This extension is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// See the GNU General Public License, version 3 or later for details.
// Based on GNOME shell extension NASA APOD by Elia Argentieri https://github.com/Elinvention/gnome-shell-extension-nasa-apod
/*global imports, log*/

imports.gi.versions.Soup = '2.4';
const {Gtk, Gio, GLib, Soup, Gdk} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const Convenience = Me.imports.convenience;
const Gettext = imports.gettext.domain('GoogleEarthWallpaper');
const _ = Gettext.gettext;
const Images = Me.imports.images;

const intervals = [ 300, 600, 1800, 3600, 4800, 86400 ];
const interval_names = [ _("5 m"), _("10 m"), _("30 m"), _("60 m"), _("90 m"), _("daily")];

const providerNames = ['Google Earth', 'Google Maps', 'Bing Maps', 'OpenStreetMap' , 'GNOME Maps'];

var PREFS_DEFAULT_WIDTH = 800;
var PREFS_DEFAULT_HEIGHT = 500;

function init() {
    ExtensionUtils.initTranslations("GoogleEarthWallpaper");
}

function buildPrefsWidget() {
    // formerly globals
    let settings;
    let desktop_settings;
    let httpSession = null;
    let provider = new Gtk.CssProvider();
    // Prepare labels and controls
    settings = ExtensionUtils.getSettings(Utils.schema);
    desktop_settings = ExtensionUtils.getSettings(Utils.DESKTOP_SCHEMA);
    let buildable = new Gtk.Builder();
    if (Gtk.get_major_version() == 4) { // GTK4 removes some properties, and builder breaks when it sees them
        buildable.add_from_file( Me.dir.get_path() + '/ui/Settings4.ui' );
        provider.load_from_path(Me.dir.get_path() + '/ui/prefs.css'); 
        Gtk.StyleContext.add_provider_for_display(
        Gdk.Display.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }
    else {
        buildable.add_from_file( Me.dir.get_path() + '/ui/Settings.ui' );
    }
    let box = buildable.get_object('prefs_widget');

    if (Convenience.currentVersionGreaterEqual('40')) {
        box.connect('realize', () => {
            let window = box.get_root();
            window.default_width = PREFS_DEFAULT_WIDTH;
            window.default_height = PREFS_DEFAULT_HEIGHT;
        });
    }

    buildable.get_object('extension_version').set_text(' v'+Me.metadata.version.toString());
    buildable.get_object('extension_name').set_text(Me.metadata.name.toString());

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
    httpSession = new Soup.SessionAsync();
    Soup.Session.prototype.add_feature.call(httpSession, new Soup.ProxyResolverDefault());

    // Indicator
    settings.bind('hide', hideSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('notify', notifySwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('set-background', bgSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    
    // adjustable indicator icons
    Utils.icon_list.forEach(function (iconname, index) { // add icons to dropdown list (aka a GtkComboText)
        iconEntry.append(iconname, iconname);
    });
    settings.bind('icon', iconEntry, 'active_id', Gio.SettingsBindFlags.DEFAULT);
    settings.connect('changed::icon', function() {
        Utils.validate_icon(settings, icon_image);
    });
    iconEntry.set_active_id(settings.get_string('icon'));
    Utils.validate_icon(settings, icon_image);
    //download folder
    
    if (Gtk.get_major_version() == 4) {
        fileChooserBtn.set_label(settings.get_string('download-folder'));
        
        fileChooserBtn.connect('clicked', function(widget) {
            let parent = widget.get_root();
            fileChooser.set_transient_for(parent);
            fileChooser.set_current_folder(Gio.File.new_for_path(settings.get_string('download-folder')).get_parent());
            fileChooser.set_action(Gtk.FileChooserAction.SELECT_FOLDER);
            fileChooser.set_transient_for(parent);
            fileChooser.set_accept_label(_('Select folder'));
            fileChooser.show();
        });

        fileChooser.connect('response', function(widget, response) {
            if (response !== Gtk.ResponseType.ACCEPT) {
                return;
            }
            let fileURI = widget.get_file().get_uri().replace('file://', '');
            log("fileChooser returned: "+fileURI);
            fileChooserBtn.set_label(fileURI);
            let oldPath = settings.get_string('download-folder');
            Utils.moveImagesToNewFolder(settings, oldPath, fileURI);
            settings.set_string('download-folder', fileURI);
        });
        
        folderButton.connect('clicked', function() { 
            ge_tryspawn(["xdg-open", settings.get_string('download-folder')]);
            log('open_background_folder '+settings.get_string('download-folder'));
        });
    }
    else {
        fileChooser.set_filename(settings.get_string('download-folder'));
        fileChooser.add_shortcut_folder_uri("file://" + GLib.get_user_cache_dir() + "/GoogleEarthWallpaper");

        fileChooser.connect('file-set', function(widget) {
            settings.set_string('download-folder', widget.get_filename());
        });
        
        folderButton.connect('button-press-event', function() { 
            ge_tryspawn(["xdg-open", settings.get_string('download-folder')]);
            log('open_background_folder '+settings.get_string('download-folder'));
        }); 
    }

    settings.bind('delete-previous', deleteSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    intervals.forEach(function (interval, index) { // add intervals to dropdown list (aka a GtkComboText)
        refreshSpin.append(interval.toString(), interval_names[index]);
    });

    //settings.bind('refresh-interval', refreshSpin, 'active_id', Gio.SettingsBindFlags.DEFAULT);
    refreshSpin.set_active_id(settings.get_int('refresh-interval').toString()); // set to current
    refreshSpin.connect('changed', function() {
        settings.set_int('refresh-interval',parseInt(refreshSpin.get_active_id(),10));
        log('Refresh interval currently set to '+refreshSpin['active_id']);
    });

    //log('Refresh interval currently set to '+refreshSpin['active_id']);
    settings.connect('changed::refresh-interval', function() {
        refreshSpin.set_active_id(settings.get_int('refresh-interval').toString());
        log('Refresh interval set to '+refreshSpin['active_id']);
    });

    providerNames.forEach(function (provider, index) { // add map providers to dropdown list (aka a GtkComboText)
        providerSpin.append(index.toString(), provider);
    });

    providerSpin.set_active_id(settings.get_enum('map-link-provider').toString()); // set to current
    providerSpin.connect('changed', function() {
        settings.set_enum('map-link-provider',parseInt(providerSpin.get_active_id(),10));
    });

    settings.connect('changed::map-link-provider', function() {
        providerSpin.set_active_id(settings.get_enum('map-link-provider').toString());
    });

    if (Convenience.currentVersionGreaterEqual("40.0")) {
        // GNOME 40+ specific code
    }
    else if (Convenience.currentVersionGreaterEqual("3.36")) {
        // GNOME 3.36 - 3.38 specific code
    }

    // background styles (e.g. zoom or span)
    Utils.backgroundStyle.forEach((style) => {
        styleEntry.append(style, style);
    });
    desktop_settings.bind('picture-options', styleEntry, 'active_id', Gio.SettingsBindFlags.DEFAULT);

    // not required in GTK4 as widgets are displayed by default
    if (Gtk.get_major_version() < 4)
        box.show_all();

    // fetch
    Utils.fetch_change_log(Me.metadata.version.toString(), change_log, httpSession);

    return box;
}

function validate_interval(settings) {
    let interval = settings.get_string('refresh-interval');
    if (interval == "" || interval.indexOf(intervals) == -1) // if not a valid interval
        settings.reset('refresh-interval');
}

function ge_tryspawn(argv) {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    }
    catch (err) {
        log("Unable to open: "+argv[0]+" error: "+err);
    }
}
