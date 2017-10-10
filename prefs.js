const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
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

let settings;

const intervals = [ 300, 3600, 86400 ];
const interval_names = [ _("5 minutes"), _("hourly"), _("daily")];

const providerNames = ['Google Earth', 'Google Maps', 'Bing Maps', 'OpenStreetMap' , 'GNOME Maps'];

function init() {
    settings = Utils.getSettings(Me);
    Convenience.initTranslations("GoogleEarthWallpaper");
}

function buildPrefsWidget(){
    // Prepare labels and controls
    let buildable = new Gtk.Builder();
    buildable.add_from_file( Me.dir.get_path() + '/Settings.ui' );
    let box = buildable.get_object('prefs_widget');

    buildable.get_object('extension_version').set_text(' v'+Me.metadata.version.toString());
    buildable.get_object('extension_name').set_text(Me.metadata.name.toString());

    let hideSwitch = buildable.get_object('hide');
    let notifySwitch = buildable.get_object('notifications');
    let transientSwitch = buildable.get_object('transient_notifications');
    let bgSwitch = buildable.get_object('background');
    let lsSwitch = buildable.get_object('lock_screen');
    let fileChooser = buildable.get_object('download_folder');
    let deleteSwitch = buildable.get_object('delete_previous');
    let refreshSpin = buildable.get_object('refresh_combo');
    let providerSpin = buildable.get_object('map_provider_combo');
    let globeFrame = buildable.get_object('globe_frame');
    let brightnessValue = buildable.get_object('brightness_adjustment');

    if (Webkit != null) {
      let webview =  new Webkit.WebView ();
      webview.transparent = true;
      webview.margin_left = 0;
      webview.margin_right =0;
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
      wklabel.set_label(_("Please install WebKit2Gtk package to enable the map view."))
      globeFrame.add(wklabel);
    }

    // Indicator
    settings.bind('hide', hideSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Notifications
    settings.bind('notify', notifySwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('transient', transientSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);

    transientSwitch.set_sensitive(settings.get_boolean('notify'));
    settings.connect('changed::notify', function() {
        transientSwitch.set_sensitive(settings.get_boolean('notify'));
    });

    settings.bind('set-background', bgSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('set-lock-screen', lsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('brightness', brightnessValue, 'value', Gio.SettingsBindFlags.DEFAULT);

    //download folder
    fileChooser.set_filename(settings.get_string('download-folder'));
    fileChooser.add_shortcut_folder_uri("file://" + GLib.get_user_cache_dir() + "/GoogleEarthWallpaper");
    fileChooser.connect('file-set', function(widget) {
        settings.set_string('download-folder', widget.get_filename());
    });

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
    let address = imagedata[0].split('\n');
    //let bbox = (lat-5)+'%2C'+(lon-5)+'%2C'+(lat+5)+'%2C'+(lon+5);
    let bbox = '-180,80,180,-50';
    let marker = lat + '%2C' + lon;
    let webcontent = '<html style="background-color: transparent;"><div style="border: 0px; background-color: white; padding: 0px; margin: 0px;">';
    webcontent = webcontent + '<span style="margin: 0px; font-size: 0.7em; color: dark-grey;">'+address[0];
    webcontent = webcontent + '</span><iframe width="100%" height="300" ';
    webcontent = webcontent + ' src="http://www.openstreetmap.org/export/embed.html?bbox='+bbox+'&amp;layer=mapnik&amp;marker='+ marker;
    webcontent = webcontent + ' "style="border: 0px solid black; margin: 0px 0px 0px 0px; overflow: hidden; padding: 0px;"></iframe></div></html>';

    log('update_globe() -> imagedata: '+settings.get_string('image-details')+' \n bbox: '+bbox+' marker: '+marker+' html: '+webcontent);

    webview.load_html(webcontent,'');
}
