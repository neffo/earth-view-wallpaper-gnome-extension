const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
var Util; // on some distributions (e.g. UBUNTU) this doesn't appear to work, some issue with GNOME introspection files
try {
    Util = imports.misc.util;
} catch (e) {
    Util = null; // we'll ignore and try handle this gracefully later on
    log("Unable to load imports.misc.util");
}
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;


var Webkit;
try {
  Webkit = imports.gi.WebKit2;
} catch (e) {
  Webkit = null;
  log("unable to load webkit : "+e);
}

const Convenience = Me.imports.convenience;
const Gettext = imports.gettext.domain('GoogleEarthWallpaper');
const _ = Gettext.gettext;
const Images = Me.imports.images;

let settings;

const intervals = [ 300, 600, 1800, 3600, 4800, 86400 ];
const interval_names = [ _("5 m"), _("10 m"), _("30 m"), _("60 m"), _("90 m"), _("daily")];

const providerNames = ['Google Earth', 'Google Maps', 'Bing Maps', 'OpenStreetMap' , 'GNOME Maps'];

function init() {
    settings = Utils.getSettings(Me);
    Convenience.initTranslations("GoogleEarthWallpaper");
}

function buildPrefsWidget(){
    // Prepare labels and controls
    let buildable = new Gtk.Builder();
    if (Gtk.get_major_version() == 4) { // GTK4 removes some properties, and builder breaks when it sees them
        buildable.add_from_file( Me.dir.get_path() + '/Settings4.ui' );
    }
    else {
        buildable.add_from_file( Me.dir.get_path() + '/Settings.ui' );
    }
    let box = buildable.get_object('prefs_widget');

    buildable.get_object('extension_version').set_text(' v'+Me.metadata.version.toString());
    buildable.get_object('extension_name').set_text(Me.metadata.name.toString());

    let hideSwitch = buildable.get_object('hide');
    let iconEntry = buildable.get_object('icon');
    let bgSwitch = buildable.get_object('background');
    let lsSwitch = buildable.get_object('lock_screen');
    let ldSwitch = buildable.get_object('lock_dialog');
    let fileChooser = buildable.get_object('download_folder');
    let fileChooserBtn = buildable.get_object('download_folder_btn');
    let deleteSwitch = buildable.get_object('delete_previous');
    let refreshSpin = buildable.get_object('refresh_combo');
    let providerSpin = buildable.get_object('map_provider_combo');
    let globeFrame = buildable.get_object('globe_frame');
    let brightnessValue = buildable.get_object('brightness_adjustment');
    let folderButton = buildable.get_object('button_open_download_folder');
    let icon_image = buildable.get_object('icon_image');

    if (Webkit != null) {
      let webview =  new Webkit.WebView ();
      webview.transparent = true;
      webview.margin_left = 0; // FIXME: depreciated in GTK4
      webview.margin_right =0; // FIXME: as above
      webview.margin_top = 0;
      webview.margin_bottom = 0;
      webview.vexpand = true;
      globeFrame.add(webview);
      update_globe(webview, buildable);

      settings.connect('changed::image-details', function() {
          update_globe(webview, buildable);
      });
    } else {
      let wklabel = new Gtk.Label();
      wklabel.set_label(_("Please install WebKit2Gtk package to enable the map view."));
      /* globeFrame.add(wklabel); */
    }

    // Indicator
    settings.bind('hide', hideSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

    settings.bind('set-background', bgSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('set-lock-screen', lsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('set-lock-screen-dialog', ldSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('brightness', brightnessValue, 'value', Gio.SettingsBindFlags.DEFAULT);
    
    // adjustable indicator icons
    Utils.icon_list.forEach(function (iconname, index) { // add icons to dropdown list (aka a GtkComboText)
        iconEntry.append(iconname, iconname);
    });
    settings.bind('icon', iconEntry, 'active_id', Gio.SettingsBindFlags.DEFAULT);
    settings.connect('changed::icon', function() {
        Utils.validate_icon(settings, icon_image);
    });
    iconEntry.set_active_id(settings.get_string('icon'));
    //download folder
    if (Gtk.get_major_version() == 4) {
        fileChooserBtn.connect('clicked', function(widget) {
            let parent = widget.get_root();
            fileChooser.set_transient_for(parent);
            /* fileChooser.set_filename(Gio.File.new_for_path(settings.get_string('download-folder')));*/ //FIXME: unsure why this doesn't work
            fileChooser.show();
        });
        fileChooser.connect('response', function(widget, response) {
            if (response !== Gtk.ResponseType.ACCEPT) {
                return;
            }
            let fileURI = widget.get_file();
            log("fileChooser returned: "+fileURI);
            fileChooserBtn.set_label(fileURI);
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
        // GNOME 40 specific code
        lsSwitch.set_sensitive(false);
        ldSwitch.set_sensitive(false);
    }
    else if (Convenience.currentVersionGreaterEqual("3.36")) {
        // GNOME 3.36 - 3.38 specific code
        lsSwitch.set_sensitive(false);
        ldSwitch.set_sensitive(false);
    }
    else {
        // legacy GNOME versions less than 3.36
    }

    // not required in GTK4 as widgets are displayed by default
    if (Gtk.get_major_version() < 4)
        box.show_all();
    return box;
}

function validate_interval() {
    let interval = settings.get_string('refresh-interval');
    if (interval == "" || interval.indexOf(intervals) == -1) // if not a valid interval
        settings.reset('refresh-interval');
}

function update_globe(webview, buildable) {
    let imagedata = settings.get_string('image-details').split('|');
    let lat = parseFloat(imagedata[2]);
    let lon = parseFloat(imagedata[3]);
    let address = imagedata[0] + '<br>' + Utils.friendly_coordinates(lat, lon);
    //let bbox = (lat-5)+'%2C'+(lon-5)+'%2C'+(lat+5)+'%2C'+(lon+5);
    let bbox = '-180,80,180,-50';
    let marker = lat + '%2C' + lon;
    let webcontent = '<html style="background-color: transparent;"><div style="border: 0px; background-color: white; padding: 0px; margin: 0px;">';
    webcontent = webcontent + '<span style="margin: 0px; font-size: 0.7em; color: dark-grey;">'+address;
    webcontent = webcontent + '</span><iframe width="100%" height="300" ';
    webcontent = webcontent + ' src="http://www.openstreetmap.org/export/embed.html?bbox='+bbox+'&amp;layer=mapnik&amp;marker='+ marker;
    webcontent = webcontent + ' "style="border: 0px solid black; margin: 0px 0px 0px 0px; overflow: hidden; padding: 0px;"></iframe></div></html>';

    log('update_globe() -> imagedata: '+settings.get_string('image-details')+' \n bbox: '+bbox+' marker: '+marker+' html: '+webcontent);

    webview.load_html(webcontent,'');
}

function ge_tryspawn(argv) {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    } catch (err) {
        log("Unable to open: "+argv[0]+" error: "+err);
    }
}
