const St = imports.gi.St;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Images = Me.imports.images;

const Convenience = Me.imports.convenience;
const Gettext = imports.gettext.domain('GoogleEarthWallpaper');
const _ = Gettext.gettext;

const GEjsonURL = "https://www.gstatic.com/prettyearth/assets/data/v3/"; // previously was v2
const GEURL = "https://earth.google.com";
const IndicatorName = "GEWallpaperIndicator";
const TIMEOUT_SECONDS = 24 * 3600; // FIXME: this should use the end data from the json data
const TIMEOUT_SECONDS_ON_HTTP_ERROR = 4 * 3600; // retry in one hour if there is a http error
const ICON = "pin";

const providerNames = ['Google Earth', 'Google Maps', 'Bing Maps', 'OpenStreetMap' , 'GNOME Maps'];
let googleearthWallpaperIndicator=null;
let httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(httpSession, new Soup.ProxyResolverDefault());

// remove this when dropping support for < 3.33, see https://github.com/OttoAllmendinger/
const getActorCompat = (obj) =>
  Convenience.currentVersionGreaterEqual("3.33") ? obj : obj.actor;

function log(msg) {
    if (googleearthWallpaperIndicator==null || true || googleearthWallpaperIndicator._settings.get_boolean('debug-logging'))
        print("GEWallpaper extension: " + msg); // disable to keep the noise down in journal
}

function notifyError(msg) {
    Main.notifyError("GEWallpaper extension error", msg);
}

function doSetBackground(uri, schema) {
    let gsettings = new Gio.Settings({schema: schema});
    gsettings.set_string('picture-uri', 'file://' + uri);
    gsettings.set_string('picture-options', 'zoom');
    Gio.Settings.sync();
    gsettings.apply();
}

const GEWallpaperIndicator = new Lang.Class({
    Name: IndicatorName,
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, IndicatorName);

        this._settings = Utils.getSettings();
        let gicon = Gio.icon_new_for_string(Me.dir.get_child('icons').get_path() + "/" + this._settings.get_string('icon') + "-symbolic.svg");
        this.icon = new St.Icon({gicon: gicon, style_class: 'system-status-icon'});
        this.x_fill = true;
        this.y_fill = false;
        this.title = "";
        this.explanation = "";
        this.filename = "";
        this.copyright = "";
        this.provider_text = "";
        this._updatePending = false;
        this._timeout = null;
        this.lat = 0;
        this.lon = 0;
        this.zoom = 0;
        this.link = "https://earthview.withgoogle.com/";
        this.imageid = 0;
        this.refreshdue = 0; // UNIX timestamp when next refresh is due

        this._settings.connect('changed::hide', Lang.bind(this, function() {
            getActorCompat(this).visible = !this._settings.get_boolean('hide');
        }));
        getActorCompat(this).visible = !this._settings.get_boolean('hide');

        this._settings.connect('changed::map-link-provider', Lang.bind(this, function() {
            this._updateProviderLink();
        }));

        // this is how we handle dynamic icon brightness - this is now better handled by 'symbolic' icons which match theme
        this.bright_effect = new Clutter.BrightnessContrastEffect({});
        this.bright_effect.set_brightness(-1.0 + (Utils.clamp_value(this._settings.get_int('brightness'),0,100)/100.0));
        this.bright_effect.set_contrast(0);
        this.icon.add_effect_with_name('brightness-contrast', this.bright_effect);
        getActorCompat(this).add_child(this.icon);
        
        // watch for indicator icon settings changes
        this._settings.connect('changed::brightness', Lang.bind(this, function() {
          this.bright_effect.set_contrast(0);
          this.bright_effect.set_brightness(-1.0 + (Utils.clamp_value(this._settings.get_int('brightness'),0,100)/100.0));
        }));
        this._setIcon(this._settings.get_string('icon'));
        this._settings.connect('changed::icon', Lang.bind(this, function() {
            this._setIcon(this._settings.get_string('icon'));
        }));

        this.refreshDueItem = new PopupMenu.PopupMenuItem(_("<No refresh scheduled>"));
        this.descriptionItem = new PopupMenu.PopupMenuItem(_("Text Location"));
        this.locationItem = new PopupMenu.PopupMenuItem(_("Geo Location"));
        this.extLinkItem = new PopupMenu.PopupMenuItem(_("External Link"));
        this.copyrightItem = new PopupMenu.PopupMenuItem(_("Copyright"));
        this.dwallpaperItem = new PopupMenu.PopupMenuItem(_("Set background image now"));
        this.swallpaperItem = new PopupMenu.PopupMenuItem(_("Set lockscreen image now"));
        this.refreshItem = new PopupMenu.PopupMenuItem(_("Refresh Now"));
        this.settingsItem = new PopupMenu.PopupMenuItem(_("Extension settings"));

        // menu toggles for settings
        this.wallpaperToggle = this._newMenuSwitch(_("Set background image"), "set-background", this._settings.get_boolean('set-background'), true);
        this.lockscreenToggle = this._newMenuSwitch(_("Set lockscreen image"), "set-lock-screen", this._settings.get_boolean('set-lock-screen'), !Convenience.currentVersionGreaterEqual("3.36"));
        
        this.menu.addMenuItem(this.descriptionItem);
        this.menu.addMenuItem(this.locationItem);
        this.menu.addMenuItem(this.extLinkItem);
        this.menu.addMenuItem(this.refreshDueItem);
        this.menu.addMenuItem(this.refreshItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.dwallpaperItem);
        
        // disable until fresh is done
        this.refreshDueItem.setSensitive(false);
        this.descriptionItem.setSensitive(false);
        this.locationItem.setSensitive(false);
        
        this.extLinkItem.connect('activate', Lang.bind(this, function() {
            Util.spawn(["xdg-open", this.link]);
        }));
        this.dwallpaperItem.connect('activate', Lang.bind(this, this._setDesktopBackground));
        if (!Convenience.currentVersionGreaterEqual("3.36")) { // lockscreen and desktop wallpaper are the same in GNOME 3.36+
            this.swallpaperItem.connect('activate', Lang.bind(this, this._setLockscreenBackground));
            this.menu.addMenuItem(this.swallpaperItem);
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.refreshItem.connect('activate', Lang.bind(this, this._refresh));
        this.settingsItem.connect('activate', function() {
            Util.spawn(["gnome-shell-extension-prefs", Me.metadata.uuid]);
        });
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem(_("On refresh:"), {reactive : false} ));
        this.menu.addMenuItem(this.wallpaperToggle);
        if (!Convenience.currentVersionGreaterEqual("3.36")) { // lockscreen and desktop wallpaper are the same in GNOME 3.36+
            this.menu.addMenuItem(this.lockscreenToggle);
        }
        this.menu.addMenuItem(this.settingsItem);        

        getActorCompat(this).connect('button-press-event', Lang.bind(this, this._updateMenu));

        if (this._settings.get_int('next-refresh') > 0 ) {
            this._restorePreviousState();
        }
        else {
            log("no previous state to restore... (first run?)");
            this._restartTimeout(60); // wait 60 seconds before performing refresh
        }
    },

    _restorePreviousState () {
        log("restoring previous state...");
        this.title = _("Google Earth Wallpaper");
        let imagedata = this._settings.get_string('image-details').split('|');
        if (imagedata.length > 0 ) {
          this.explanation = imagedata[0];
          this.copyright = imagedata[1];
        }
        if (imagedata.length > 2) { // special case handle previous extension version data gaps
          this.lat = parseFloat(imagedata[2]);
          this.lon = parseFloat(imagedata[3]);
          this.zoom = parseInt(imagedata[4]);
        }
        this.filename = this._settings.get_string('image-filepath');
        let timezone = GLib.TimeZone.new_local();
        let unixtime = GLib.DateTime.new_now(timezone).to_unix();
        let seconds = this._settings.get_int('next-refresh') - unixtime;
        log(" image: "+this.filename+" explanation: "+this.explanation+"\n next refresh in: "+seconds+" seconds");
        this._updateProviderLink();
        this._setBackground();
        this._restartTimeout(seconds < 60 ? 60 : seconds); // never refresh early than 60 seconds after startup
    },

    _updateMenu: function () {
        // Grey out menu items if an update is pending
        this.refreshItem.setSensitive(!this._updatePending);
        this.dwallpaperItem.setSensitive(!this._updatePending && this.filename != "");
        this.swallpaperItem.setSensitive(!this._updatePending && this.filename != "");
        this.wallpaperToggle.setToggleState(this._settings.get_boolean('set-background'));
        this.lockscreenToggle.setToggleState(this._settings.get_boolean('set-lock-screen'));
        // update menu text
        this.refreshDueItem.label.set_text(_('Next refresh')+': '+this.refreshdue.format('%X')+' ('+Utils.friendly_time_diff(this.refreshdue)+')');
        this.locationItem.label.set_text(Utils.friendly_coordinates(this.lat, this.lon));
        this.descriptionItem.label.set_text(this.explanation);
        this.copyrightItem.label.set_text(this.copyright);
        this.extLinkItem.label.set_text(this.provider_text);
    },

    _getProviderLink: function(provider = this._settings.get_enum('map-link-provider')) {
        switch(provider) {
          case 1: // Google Maps
            return `https://www.google.com/maps/@${this.lat},${this.lon},${this.zoom}z/data=!3m1!1e3`;
            // data=!3m1!1e3 indicates we want the satellite image basemap
          case 2: // Bing Maps
            return `https://bing.com/maps/default.aspx?cp=${this.lat}~${this.lon}&lvl=${this.zoom}&style=a&dir=0`;
          case 3: // OpenStreetMap
            return `https://www.openstreetmap.org/#map=${this.zoom}/${this.lat}/${this.lon}`;
          case 4: // GNOME Maps (most likely, or whatever is default app for geo: uris)
            return `geo:${this.lat},${this.lon}`;
          case 0: // Google Earth
          default:
            return `https://g.co/ev/${this.imageid}`;
        }
    },

    _updateProviderLink: function() {
        const provider = this._settings.get_enum('map-link-provider');
        this.link = this._getProviderLink(provider)
        this.provider_text = _("View in ") + providerNames[provider];
    },

    _setBackground: function() {
        if (this.filename == "")
            return;
        if (this._settings.get_boolean('set-background')) {
            this._setDesktopBackground();
        }
        if (this._settings.get_boolean('set-lock-screen')) {
            this._setLockscreenBackground();
        }
    },

    _setDesktopBackground() {
        doSetBackground(this.filename, 'org.gnome.desktop.background');
    },

    _setLockscreenBackground() {
        doSetBackground(this.filename, 'org.gnome.desktop.screensaver');
    },

    _newMenuSwitch(string, dconf_key, initialValue, writable) {
        this._settings.connect(`changed::${dconf_key}`, Lang.bind(this, function() {
            this._updateMenu();
        }));
        let widget = new PopupMenu.PopupSwitchMenuItem(string,
            initialValue);
        if (!writable) {
            widget.actor.reactive = false;
        } else {
            widget.connect('toggled', item => {
                this._settings.set_boolean(dconf_key, item.state); // how do I get state?
            });
        }
        return widget;
    },


    _restartTimeout: function(seconds = null) {
        if (this._timeout)
            Mainloop.source_remove(this._timeout);
        if (seconds == null || seconds < 60)
            seconds = TIMEOUT_SECONDS;
        this._timeout = Mainloop.timeout_add_seconds(seconds, Lang.bind(this, this._refresh));
        let timezone = GLib.TimeZone.new_local();
        let localTime = GLib.DateTime.new_now(timezone).add_seconds(seconds);
        this.refreshdue = localTime;
        this._settings.set_int('next-refresh',localTime.to_unix());
        log('next check in '+seconds+' seconds @ local time '+localTime.format('%F %X'));
    },

    _refresh: function() {
        if (this._updatePending)
            return;
        this._updatePending = true;
        this._restartTimeout(300); // in case of a timeout
        this.refreshDueItem.label.set_text(_('Fetching...'));

        log('locations count: '+Images.imageids.length);
        // create an http message
        let imgindex = GLib.random_int_range(0,Images.imageids.length);
        let url = GEjsonURL+Images.imageids[imgindex]+'.json';
        log("fetching: " + url);
        let request = Soup.Message.new('GET', url);

        // queue the http request
        httpSession.queue_message(request, Lang.bind(this, function(httpSession, message) {
            if (message.status_code == 200) {
                log("Datatype: "+message.response_headers.get_content_type());
                let data = message.response_body.data;
                log("Recieved "+data.length+" bytes");
                this._parseData(data);
            } else if (message.status_code == 403) {
                log("Access denied: "+message.status_code);
                this._updatePending = false;
                this._restartTimeout(TIMEOUT_SECONDS_ON_HTTP_ERROR);
            } else {
                log("Network error occured: "+message.status_code);
                this._updatePending = false;
                this._restartTimeout(TIMEOUT_SECONDS_ON_HTTP_ERROR);
            }
        }));
    },

    _parseData: function(data) {
        let imagejson = JSON.parse(data);

        if (imagejson.id != '') {
            this.title = _("Google Earth Wallpaper");
            let location = "";
            if ('geocode' in imagejson) {
                //location = imagejson.geocode.administrative_area_level_1 +', '+imagejson.geocode.country;
                location = Object.values(imagejson.geocode).join(", ");
            } else {
                location = [imagejson.region,imagejson.country].filter(Boolean).join(', ');
            }
            let coordinates = Utils.friendly_coordinates(imagejson.lat,imagejson.lng);
            this.explanation = location.trim(); // + '\n'+ coordinates;
            this.copyright = imagejson.attribution;
            this.lat = imagejson.lat;
            this.lon = imagejson.lng;
            this.zoom = imagejson.zoom;
            this.imageid = imagejson.id;
            this._updateProviderLink();

            let GEWallpaperDir = this._settings.get_string('download-folder');
            let userPicturesDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES); // XDG pictures directory
            if (GEWallpaperDir == '') {
                GEWallpaperDir = userPicturesDir + "/GoogleEarthWallpaper/";
                this._settings.set_string('download-folder',GEWallpaperDir);
            }
            else if (!GEWallpaperDir.endsWith('/')) {
                GEWallpaperDir += '/';
            }

            let prevfile = this._settings.get_string('image-filepath');
            this.filename = GEWallpaperDir+(imagejson.id+'-'+location.trim()).replace(',','').replace(/[^a-z0-9]+/gi, '_').toLowerCase()+'.jpg';
            let file = Gio.file_new_for_path(this.filename);
            let file_exists = file.query_exists(null);
            let file_info = file_exists ? file.query_info ('*',Gio.FileQueryInfoFlags.NONE,null): 0;

            if (!file_exists || file_info.get_size () == 0) { // file doesn't exist or is empty (probably due to a network error)
                let dir = Gio.file_new_for_path(GEWallpaperDir);
                if (!dir.query_exists(null)) {
                    dir.make_directory_with_parents(null);
                }
                this._export_image(imagejson,file);
                this._settings.set_string('image-filepath', this.filename);
                this._delete_previous(prevfile);
            } else {
                log("Image already downloaded");
                this._setBackground();
                this._updatePending = false;
            }
            this._settings.set_string('image-details',[
                this.explanation.replace('|', ''), // just incase (see below)
                this.copyright.replace('|', '&'), // i think copyright info uses | instead of &
                this.lat.toString(),
                this.lon.toString(),
                this.zoom.toString()].join('|'));
            this._settings.set_int('image-id',imagejson.id);
        } else {
            this.title = _("No wallpaper available");
            this.explanation = _("Something went wrong...");
            this.filename = "";
            this._updatePending = false;
        }
        this._updateMenu();
        this._restartTimeout(this._settings.get_int('refresh-interval'));
    },

    _delete_previous: function (to_delete) {
        if (to_delete == '')
            return;
        let deletepictures = this._settings.get_boolean('delete-previous');
        if (deletepictures) {
            let oldfile = Gio.file_new_for_path(to_delete);
            if (oldfile.query_exists(null)) {
                oldfile.delete(null);
                log("deleted previous file: "+ to_delete);
            }
        }
    },

    _export_image: function(json, file) {
        log("Exporting to " + file.get_uri())

        // open the Gfile
        let fstream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        let decodeddata = GLib.base64_decode(json.dataUri.replace('data:image/jpeg;base64,','')); // FIXME: how do we handle failures? check for magic number/JFIF?
        fstream.write(decodeddata, null);
        fstream.close(null);
        this._updatePending = false;

        this._setBackground();
    },

    _setIcon: function(icon_name) {
        //log('Icon set to : '+icon_name)
        Utils.validate_icon(this._settings);
        let gicon = Gio.icon_new_for_string(Me.dir.get_child('icons').get_path() + "/" + Utils.icon_list_filename[Utils.icon_list.indexOf(icon_name)] + ".svg");
        this.icon = new St.Icon({gicon: gicon, style_class: 'system-status-icon'});
        if (!this.icon.get_parent() && 0) {
            log('New icon set to : '+icon_name);
            getActorCompat(this).add_child(this.icon);
        }
        else {
            log('Replace icon set to : '+icon_name);
            getActorCompat(this).remove_all_children();
            getActorCompat(this).add_child(this.icon);
        }
    },

    stop: function () {
        if (this._timeout)
            Mainloop.source_remove(this._timeout);
        this._timeout = undefined;
        this.menu.removeAll();
    }
});

function init(extensionMeta) {
    Convenience.initTranslations("GoogleEarthWallpaper");
}

function enable() {
    googleearthWallpaperIndicator = new GEWallpaperIndicator();
    Main.panel.addToStatusArea(IndicatorName, googleearthWallpaperIndicator);
}

function disable() {
    if (this._timeout)
            Mainloop.source_remove(this._timeout); // not strictly sure this is necessary, but let's clean it up anyway
    googleearthWallpaperIndicator.stop();
    googleearthWallpaperIndicator.destroy();
    googleearthWallpaperIndicator = null;
}