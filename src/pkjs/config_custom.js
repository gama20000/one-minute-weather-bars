// Runs inside the Clay configuration page (serialised by Clay: must be self-contained).
// - Every section (Relógio, Cores, Meteorologia, Idioma) collapses; tap its title to open.
// - The custom-colour section only exists while the theme "Personalizado" (4) is selected.
module.exports = function () {
  var clayConfig = this;
  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function () {
    var css = document.createElement('style');
    css.textContent =
      '.section.omw-closed > .component:not(.omw-head){display:none !important}' +
      '.omw-head{cursor:pointer;position:relative;-webkit-user-select:none;user-select:none}' +
      '.omw-arrow{float:right;opacity:.75;font-size:1.1em;line-height:1}';
    document.head.appendChild(css);

    var sections = document.querySelectorAll('.section');
    for (var i = 0; i < sections.length; i++) {
      (function (sec) {
        var head = sec.querySelector('.component-heading');
        if (!head) return;
        head.className += ' omw-head';
        sec.className += ' omw-closed';
        var arrow = document.createElement('span');
        arrow.className = 'omw-arrow';
        arrow.textContent = '\u25B8';
        (head.querySelector('h1,h2,h3,h4,h5,h6') || head).appendChild(arrow);
        head.addEventListener('click', function () {
          var closed = /\bomw-closed\b/.test(sec.className);
          if (closed) sec.className = sec.className.replace(/\s*omw-closed/g, '');
          else sec.className += ' omw-closed';
          arrow.textContent = closed ? '\u25BE' : '\u25B8';
        });
      })(sections[i]);
    }

    var theme = clayConfig.getItemByMessageKey('theme');
    var first = clayConfig.getItemByMessageKey('color_bg');
    var colorSection = first ? first.$element[0].parentNode : null;
    function sync(opening) {
      if (!colorSection || !theme) return;
      var custom = String(theme.get()) === '4';
      colorSection.style.display = custom ? '' : 'none';
      if (custom && opening && /\bomw-closed\b/.test(colorSection.className)) {
        colorSection.querySelector('.omw-head').click();
      }
    }
    if (theme) theme.on('change', function () { sync(true); });
    sync(false);

    // Time window fields only while "hide the weather during set hours" is on.
    var sched = clayConfig.getItemByMessageKey('sched_on');
    var schedItems = ['sched_scope', 'sched_start', 'sched_end', 'sched_days'].map(function (k) {
      return clayConfig.getItemByMessageKey(k);
    }).filter(function (i) { return i; });
    function syncSched() {
      var on = sched && sched.get();
      schedItems.forEach(function (i) { i.$element[0].style.display = on ? '' : 'none'; });
    }
    if (sched) sched.on('change', syncSched);
    syncSched();

    // Location fields only for the Open-Meteo source (the Pebble app has its own place).
    var src = clayConfig.getItemByMessageKey('wx_source');
    var locItems = ['loc_mode', 'loc_name'].map(function (k) {
      return clayConfig.getItemByMessageKey(k);
    }).filter(function (i) { return i; });
    function syncSource() {
      var om = src && String(src.get()) === '1';
      locItems.forEach(function (i) { i.$element[0].style.display = om ? '' : 'none'; });
    }
    if (src) src.on('change', syncSource);
    syncSource();

    // Peek duration only for "show all weather for a while" (tap mode 2).
    var tap = clayConfig.getItemByMessageKey('tap_mode');
    var peek = clayConfig.getItemByMessageKey('peek_secs');
    function syncPeek() {
      if (peek && tap) peek.$element[0].style.display = String(tap.get()) === '2' ? '' : 'none';
    }
    if (tap) tap.on('change', syncPeek);
    syncPeek();
  });
};
