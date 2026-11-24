// Clay configuration page, generated in PT-PT or EN.
var T = {
  pt: {
    title: 'One Minute Weather Bars',
    clock: 'Relógio', time_fmt: 'Formato da hora', auto: 'Automático (do relógio)',
    h12: '12 horas', h24: '24 horas', date_fmt: 'Data (canto inferior direito)',
    d_day: 'Só o dia (21)', d_dm: 'Dia e mês (21 Nov)', d_md: 'Mês e dia (Nov 21)',
    battery: 'Mostrar bateria (canto superior esquerdo)',
    theme: 'Tema de cores', th: ['Meteorologia colorida', 'Clássico minimalista', 'Monocromático', 'Alto contraste', 'Personalizado'],
    colors: 'Cores personalizadas',
    colors_desc: 'Se uma cor essencial ficar demasiado parecida com o fundo, o relógio troca-a automaticamente por branco ou preto para continuar legível.',
    c: { bg: 'Fundo', hour: 'Número da hora', hand: 'Ponteiro (contorno)', hand_in: 'Ponteiro (interior)',
         tick0: 'Marcação do minuto 0', tick5: 'Marcações principais (5 em 5 min)', tick1: 'Marcações secundárias',
         wday: 'Dia da semana', mdate: 'Dia do mês', wtext: 'Texto meteorológico', tmax: 'Temperaturas máximas',
         tmin: 'Temperaturas mínimas', pop: 'Barras de probabilidade de chuva', mm: 'Gota e mm (temas sem gradiente)',
         icon: 'Ícones meteorológicos' },
    weather: 'Meteorologia', loc_mode: 'Localização', loc_auto: 'Automática (GPS do telemóvel)',
    loc_manual: 'Manual', loc_name: 'Localidade (modo manual)', loc_desc: 'Ex.: "Lisboa" ou "Porto, Portugal". A pesquisa usa apenas o serviço de geocodificação da Open-Meteo.',
    units: 'Unidades', celsius: 'Celsius (°C)', fahrenheit: 'Fahrenheit (°F)',
    interval: 'Atualizar a previsão', every: 'A cada ', min: ' min', hours: ' h',
    ndays: 'Número de dias', d6: 'Hoje + 5 dias', d4: 'Hoje + 3 dias (letra maior)',
    precip: 'Chuva de hoje (mm, no topo)', p_full: 'Total previsto para o dia', p_rest: 'Ainda prevista até ao fim do dia',
    pop_desc: 'A altura da barra é a probabilidade máxima horária de chover mais de 0,1 mm nesse dia (Open-Meteo "precipitation_probability_max"). Os mm são valores previstos, não medidos.',
    language: 'Idioma', lang_auto: 'Automático (do relógio)', save: 'Guardar',
    rain: 'Cores da chuva (mm)',
    rain_desc: 'Só para a quantidade (mm de hoje e números sobre as barras), nunca para a probabilidade. Entre os valores a cor é interpolada; o relógio mostra a mais próxima das 64 cores que consegue apresentar. Usado nos temas Meteorologia colorida, Clássico minimalista e Personalizado. Sem dados aparece "--" a cinzento.',
    rain_l: ['0 mm (referência #FFFFFF, branco)', '5 mm (referência #BDEFFF, azul leitoso)',
             '10 mm (referência #38BDF8, azul intermédio)', '20 mm ou mais (referência #1762FF, azul intenso)'],
    energy: 'Poupança de energia', day_start: 'O dia começa às', night_start: 'A noite começa às',
    day_refresh: 'Atualizar o mostrador de dia', night_refresh: 'Atualizar o mostrador à noite',
    minutes: ['1 min', '2,5 min', '5 min'], nminutes: ['5 min', '15 min', '30 min'],
    energy_desc: 'Com intervalos acima de 1 minuto, a hora e o ponteiro só avançam em cada atualização: o minuto mostrado pode estar atrasado até ao intervalo escolhido (por exemplo, até 15 min à noite). Um toque no pulso, se estiver ativo, atualiza logo o mostrador. A previsão tem o seu próprio intervalo, na secção Meteorologia. A poupança real de bateria não foi medida e depende do uso.',
    show: 'Mostrar', wx_inside: 'Previsão dentro do círculo', wx_bars: 'Barras de chuva em baixo',
    bars_desc: 'Uma barra por dia, de hoje (à esquerda) até daqui a 5 dias. A altura é a probabilidade de chuva; o número por cima são os mm previstos, arredondados ao inteiro.',
    tap: 'Toque no pulso (abanar)', tap_none: 'Não faz nada', tap_toggle: 'Alterna entre com e sem meteorologia',
    tap_peek: 'Mostra toda a meteorologia durante um tempo',
    peek: 'Tempo a mostrar após o toque', peek_o: ['10 s', '30 s', '1 min', '2 min', '5 min'],
    sched_scope: 'O que esconder', scope: ['Tudo (círculo e barras)', 'Só a previsão dentro do círculo', 'Só as barras de chuva em baixo'],
    sched: 'Esconder a meteorologia num horário', sched_start: 'Das', sched_end: 'Às', sched_days: 'Nos dias',
    days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    sched_desc: 'Por exemplo, durante o horário de trabalho. Fora deste horário a meteorologia aparece como configurado acima; o toque no pulso continua a funcionar. Se a hora final for antes da inicial, o horário passa a meia-noite.',
    tap_desc: 'Um movimento rápido do pulso. "Alternar" muda para a versão alternativa e fica assim até ao próximo toque: sem meteorologia, ou com toda ela se a tiveres desligado acima.'
  },
  en: {
    title: 'One Minute Weather Bars',
    clock: 'Clock', time_fmt: 'Time format', auto: 'Automatic (watch setting)',
    h12: '12 hour', h24: '24 hour', date_fmt: 'Date (bottom right)',
    d_day: 'Day only (21)', d_dm: 'Day and month (21 Nov)', d_md: 'Month and day (Nov 21)',
    battery: 'Show battery (top left)',
    theme: 'Colour theme', th: ['Colourful weather', 'Classic minimal', 'Monochrome', 'High contrast', 'Custom'],
    colors: 'Custom colours',
    colors_desc: 'If an essential colour is too close to the background, the watch automatically swaps it for white or black so it stays readable.',
    c: { bg: 'Background', hour: 'Hour number', hand: 'Hand (outline)', hand_in: 'Hand (inside)',
         tick0: 'Minute 0 mark', tick5: 'Major marks (every 5 min)', tick1: 'Minor marks',
         wday: 'Weekday', mdate: 'Day of month', wtext: 'Weather text', tmax: 'Maximum temperatures',
         tmin: 'Minimum temperatures', pop: 'Rain probability bars', mm: 'Raindrop and mm (themes without gradient)',
         icon: 'Weather icons' },
    weather: 'Weather', loc_mode: 'Location', loc_auto: 'Automatic (phone GPS)',
    loc_manual: 'Manual', loc_name: 'Place (manual mode)', loc_desc: 'E.g. "Lisbon" or "Porto, Portugal". The search only uses the Open-Meteo geocoding service.',
    units: 'Units', celsius: 'Celsius (°C)', fahrenheit: 'Fahrenheit (°F)',
    interval: 'Refresh forecast', every: 'Every ', min: ' min', hours: ' h',
    ndays: 'Number of days', d6: 'Today + 5 days', d4: 'Today + 3 days (larger text)',
    precip: "Today's rain (mm, at the top)", p_full: 'Total forecast for the day', p_rest: 'Still expected until the end of the day',
    pop_desc: 'Bar height is the highest hourly probability of more than 0.1 mm of precipitation that day (Open-Meteo "precipitation_probability_max"). Millimetres are forecasts, not measurements.',
    language: 'Language', lang_auto: 'Automatic (watch setting)', save: 'Save',
    rain: 'Rain colours (mm)',
    rain_desc: 'Only for the amount (today\'s mm and the numbers above the bars), never for the probability. Between the values the colour is interpolated; the watch shows the nearest of its 64 colours. Used in the Colourful weather, Classic minimal and Custom themes. Missing data shows "--" in grey.',
    rain_l: ['0 mm (reference #FFFFFF, white)', '5 mm (reference #BDEFFF, milky blue)',
             '10 mm (reference #38BDF8, mid blue)', '20 mm or more (reference #1762FF, deep blue)'],
    energy: 'Power saving', day_start: 'Day starts at', night_start: 'Night starts at',
    day_refresh: 'Update the dial by day', night_refresh: 'Update the dial at night',
    minutes: ['1 min', '2.5 min', '5 min'], nminutes: ['5 min', '15 min', '30 min'],
    energy_desc: 'With intervals above 1 minute, the hour and the hand only move at each update: the minute shown can be behind by up to the chosen interval (e.g. up to 15 min at night). A wrist tap, if enabled, updates the dial at once. The forecast has its own interval, in the Weather section. Real battery savings have not been measured and depend on use.',
    show: 'Show', wx_inside: 'Forecast inside the dial', wx_bars: 'Rain bars at the bottom',
    bars_desc: 'One bar per day, from today (left) to 5 days ahead. Bar height is the rain probability; the number above is the forecast mm, rounded to whole millimetres.',
    tap: 'Wrist tap (flick)', tap_none: 'Does nothing', tap_toggle: 'Toggles weather on and off',
    tap_peek: 'Shows all weather for a while',
    peek: 'Time shown after the tap', peek_o: ['10 s', '30 s', '1 min', '2 min', '5 min'],
    sched_scope: 'What to hide', scope: ['Everything (dial and bars)', 'Only the forecast inside the dial', 'Only the rain bars at the bottom'],
    sched: 'Hide the weather during set hours', sched_start: 'From', sched_end: 'To', sched_days: 'On',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    sched_desc: 'For example during working hours. Outside these hours the weather shows as set above; the wrist tap still works. If the end is before the start, the window crosses midnight.',
    tap_desc: 'A quick flick of the wrist. "Toggle" switches to the alternative view until the next flick: without weather, or with all of it if you turned it off above.'
  }
};

var COLOR_DEFAULTS = {   // "Colourful weather" palette as the starting point for Custom
  bg: '0x000000', hour: '0xFFFFFF', hand: '0xFFAA00', hand_in: '0xFF5500', tick0: '0xFFAA00',
  tick5: '0xFFFFFF', tick1: '0xFFFFFF', wday: '0xFFFFFF', mdate: '0xFFFFFF', wtext: '0xFFFFFF',
  tmax: '0xFFAA00', tmin: '0x55AAFF', pop: '0x00AAFF', mm: '0x00AAFF', icon: '0xAAAAAA'
};

function opts(labels, values) {
  return labels.map(function (l, i) { return { label: l, value: String(values[i]) }; });
}

module.exports = function (lang) {
  var t = T[lang] || T.en;
  var colorItems = [{ type: 'heading', defaultValue: t.colors }, { type: 'text', defaultValue: t.colors_desc }];
  Object.keys(COLOR_DEFAULTS).forEach(function (k) {
    colorItems.push({ type: 'color', messageKey: 'color_' + k, defaultValue: COLOR_DEFAULTS[k],
                      label: t.c[k], sunlight: false, allowGray: true });
  });
  return [
    { type: 'heading', defaultValue: t.title },
    { type: 'section', items: [
      { type: 'heading', defaultValue: t.clock },
      { type: 'select', messageKey: 'time_fmt', label: t.time_fmt, defaultValue: '0',
        options: opts([t.auto, t.h12, t.h24], [0, 1, 2]) },
      { type: 'select', messageKey: 'theme', label: t.theme, defaultValue: '0',
        options: opts(t.th, [0, 1, 2, 3, 4]) },
      { type: 'toggle', messageKey: 'show_battery', label: t.battery, defaultValue: false }
    ] },
    { type: 'section', items: colorItems },
    { type: 'section', items: [
      { type: 'heading', defaultValue: t.weather },
      { type: 'toggle', messageKey: 'wx_inside', label: t.wx_inside, defaultValue: true },
      { type: 'toggle', messageKey: 'wx_bars', label: t.wx_bars, defaultValue: true, description: t.bars_desc },
      { type: 'select', messageKey: 'tap_mode', label: t.tap, defaultValue: '0', description: t.tap_desc,
        options: opts([t.tap_none, t.tap_toggle, t.tap_peek], [0, 1, 2]) },
      { type: 'select', messageKey: 'peek_secs', label: t.peek, defaultValue: '60',
        options: opts(t.peek_o, [10, 30, 60, 120, 300]) },
      { type: 'toggle', messageKey: 'sched_on', label: t.sched, defaultValue: false, description: t.sched_desc },
      { type: 'select', messageKey: 'sched_scope', label: t.sched_scope, defaultValue: '0',
        options: opts(t.scope, [0, 1, 2]) },
      { type: 'input', messageKey: 'sched_start', label: t.sched_start, defaultValue: '09:00', attributes: { type: 'time' } },
      { type: 'input', messageKey: 'sched_end', label: t.sched_end, defaultValue: '18:00', attributes: { type: 'time' } },
      { type: 'checkboxgroup', messageKey: 'sched_days', label: t.sched_days, options: t.days,
        defaultValue: [true, true, true, true, true, false, false] },
      { type: 'select', messageKey: 'loc_mode', label: t.loc_mode, defaultValue: 'auto',
        options: [{ label: t.loc_auto, value: 'auto' }, { label: t.loc_manual, value: 'manual' }] },
      { type: 'input', messageKey: 'loc_name', label: t.loc_name, defaultValue: '', description: t.loc_desc },
      { type: 'select', messageKey: 'units', label: t.units, defaultValue: '0',
        options: opts([t.celsius, t.fahrenheit], [0, 1]) },
      { type: 'select', messageKey: 'interval', label: t.interval, defaultValue: '60',
        options: opts([t.every + '30' + t.min, t.every + '1' + t.hours, t.every + '2' + t.hours, t.every + '3' + t.hours],
                      [30, 60, 120, 180]) },
      { type: 'select', messageKey: 'precip_mode', label: t.precip, defaultValue: '0',
        options: opts([t.p_full, t.p_rest], [0, 1]) },
      { type: 'text', defaultValue: t.pop_desc }
    ] },
    { type: 'section', items: [
      { type: 'heading', defaultValue: t.rain },
      { type: 'text', defaultValue: t.rain_desc },
      { type: 'color', messageKey: 'rain_c0', label: t.rain_l[0], defaultValue: '0xFFFFFF', sunlight: false, allowGray: true },
      { type: 'color', messageKey: 'rain_c5', label: t.rain_l[1], defaultValue: '0xBDEFFF', sunlight: false, allowGray: true },
      { type: 'color', messageKey: 'rain_c10', label: t.rain_l[2], defaultValue: '0x38BDF8', sunlight: false, allowGray: true },
      { type: 'color', messageKey: 'rain_c20', label: t.rain_l[3], defaultValue: '0x1762FF', sunlight: false, allowGray: true }
    ] },
    { type: 'section', items: [
      { type: 'heading', defaultValue: t.energy },
      { type: 'input', messageKey: 'day_start', label: t.day_start, defaultValue: '07:00', attributes: { type: 'time' } },
      { type: 'input', messageKey: 'night_start', label: t.night_start, defaultValue: '23:00', attributes: { type: 'time' } },
      { type: 'select', messageKey: 'day_refresh', label: t.day_refresh, defaultValue: '60',
        options: opts(t.minutes, [60, 150, 300]) },
      { type: 'select', messageKey: 'night_refresh', label: t.night_refresh, defaultValue: '900',
        options: opts(t.nminutes, [300, 900, 1800]) },
      { type: 'text', defaultValue: t.energy_desc }
    ] },
    { type: 'section', items: [
      { type: 'heading', defaultValue: t.language },
      { type: 'select', messageKey: 'lang', label: t.language, defaultValue: '0',
        options: [{ label: t.lang_auto, value: '0' }, { label: 'Português (Portugal)', value: '1' },
                  { label: 'English', value: '2' }] }
    ] },
    { type: 'submit', defaultValue: t.save }
  ];
};
