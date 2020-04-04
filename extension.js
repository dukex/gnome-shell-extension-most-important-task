const St = imports.gi.St;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Me = imports.misc.extensionUtils.getCurrentExtension();

let settings;

class Account {
  get_token() {
    return settings.get_string('todoist-api-token');
  }
}

let button, label, account, _timeout, _httpSession;

const request = (method, path, params) => {
  const message = Soup.form_request_new_from_hash(method, `https://api.todoist.com/rest/v1/${path}`, params);
  message.request_headers.append("Authorization", `Bearer ${account.get_token()}`);

  return new Promise((resolve, reject) => {
    _httpSession.queue_message(message, (_httpSession, message) => {
        if (message.status_code !== 200) {
          return reject();
        }

        let json = JSON.parse(message.response_body.data);

        resolve(json);
      }
    );
  });
}

const fetchTask = (query) => {
  return new Promise((resolve, reject) => {
    request("GET", "tasks", { filter: query })
    .then((tasks) => {
      const task = tasks.sort((a,b) => new Date(a.due.date) - new Date(b.due.date))[0];
      if(task) {
        resolve(task);
      } else {
        reject();
      }
    }, reject);
  });
}


var setText = task => {
  if(task) {
    label.set_text(task.content);
    return true;
  } else {
    throw false;
  }
}


function assignTask() {
  fetchTask("@mit & (today | overdue)")
    .then(setText, () => {
      return fetchTask("7 days")
    })
    .then(setText, (f) => {
      return fetchTask("assigned to: me")
    })
    .then(setText, () => {
      setText({ content: "=)" });
    });
}

function refresh() {
  log("refresh");

  if (_timeout) {
    Mainloop.source_remove(_timeout);
    _timeout = null;
  }

  assignTask()

  _timeout = Mainloop.timeout_add_seconds(60, refresh);
}

function init() {
  let gschema = Gio.SettingsSchemaSource.new_from_directory(
    Me.dir.get_child('schemas').get_path(),
    Gio.SettingsSchemaSource.get_default(),
    false
  );

  settings = new Gio.Settings({
    settings_schema: gschema.lookup('org.gnome.shell.extensions.mit', true)
  });

  account = new Account();

  _httpSession = new Soup.Session();

  button = new St.Bin({ style_class: 'panel-button',
    reactive: true,
    can_focus: true,
    x_fill: true,
    y_fill: false,
    track_hover: true
  });

  label = new St.Label({ text: "Loading..." });
  button.set_child(label);
  button.connect('button-press-event', function() {
    if(task) {
      let file = imports.gi.Gio.File.new_for_uri(task.url);
      file.query_exists(null);
      file.query_default_handler(null).launch([file], null);
    }
  });
}

function enable() {
  Main.panel._centerBox.insert_child_at_index(button, 0);
  log("enable");
  refresh();
}

function disable() {
  Main.panel._centerBox.remove_child(button);
  if (_timeout) {
    Mainloop.source_remove(_timeout);
    _timeout = null;
  }
}
