(() => {
  const $ = (id) => document.getElementById(id);
  const audio = new Audio();
  const playerEl = $('player');

  /* ---------- State ---------- */
  let tracks = []; // each track: { name, ext, url }
  let index = -1;
  let shuffle = false;
  let repeat = 0; // 0 = off, 1 = all, 2 = one
  let seeking = false;

  const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
  const ICON_PAUSE = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  const REPEAT_LABELS = ['Repeat off', 'Repeat all', 'Repeat one'];

  /* ---------- Helpers ---------- */
  function fmt(seconds) {
    if (!isFinite(seconds)) {
      return '0:00';
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function fill(el, percent) {
    el.style.setProperty('--fill', percent + '%');
  }

  function say(text) {
    $('msg').textContent = text;
  }

  function setVolume(value) {
    audio.volume = Math.min(1, Math.max(0, value));
    $('vol').value = audio.volume;
    fill($('vol'), audio.volume * 100);
  }

  /* ---------- Equalizer (Web Audio API) ---------- */
  const bandInputs = [...document.querySelectorAll('.band input')];
  const bandLabels = [...document.querySelectorAll('.band .db')];
  const presetSelect = $('preset');

  // Gain in dB for the 10 bands: 31Hz ... 16kHz
  const PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    treble: [0, 0, 0, 0, 0, 1, 3, 4, 5, 6],
    vocal: [-2, -2, -1, 1, 3, 3, 2, 1, 0, -1],
    rock: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
    pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
    classical: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
  };

  let audioCtx = null;
  let filters = [];

  function ensureAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (!audioCtx && AudioCtx) {
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaElementSource(audio);
      const last = bandInputs.length - 1;

      filters = bandInputs.map((input, i) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = i === 0 ? 'lowshelf' : i === last ? 'highshelf' : 'peaking';
        filter.frequency.value = Number(input.dataset.freq);
        filter.Q.value = 1.1;
        filter.gain.value = Number(input.value);
        return filter;
      });

      let node = source;
      filters.forEach((filter) => {
        node.connect(filter);
        node = filter;
      });
      node.connect(audioCtx.destination);
    }

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function setBand(i, gain) {
    bandInputs[i].value = gain;
    bandLabels[i].textContent = (gain > 0 ? '+' : '') + gain;

    if (filters[i]) {
      filters[i].gain.setTargetAtTime(gain, audioCtx.currentTime, 0.015);
    }
  }

  function applyPreset(name) {
    const values = PRESETS[name];
    if (!values) {
      return;
    }
    presetSelect.value = name;
    values.forEach((gain, i) => setBand(i, gain));
  }

  bandInputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      setBand(i, Number(input.value));
      presetSelect.value = 'custom';
    });
  });

  presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));
  $('eqReset').addEventListener('click', () => applyPreset('flat'));

  /* ---------- Adding files ---------- */
  function addFiles(fileList) {
    const audioPattern = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm|mp4|amr|3gp|aiff?|wma|ape)$/i;

    const files = [...fileList].filter((f) => {
      return (
        f.type.startsWith('audio/') ||
        f.type.startsWith('video/') ||
        audioPattern.test(f.name)
      );
    });

    if (!files.length) {
      say('No audio files found in that selection.');
      return;
    }

    const wasEmpty = tracks.length === 0;

    files.forEach((f) => {
      const dot = f.name.lastIndexOf('.');
      tracks.push({
        name: dot > 0 ? f.name.slice(0, dot) : f.name,
        ext: dot > 0 ? f.name.slice(dot + 1).toUpperCase() : 'AUDIO',
        url: URL.createObjectURL(f),
      });
    });

    say('');
    render();

    if (wasEmpty) {
      load(0, true);
    }
  }

  /* ---------- Playback ---------- */
  function load(i, autoplay) {
    if (i < 0 || i >= tracks.length) {
      return;
    }

    index = i;
    audio.src = tracks[i].url;
    $('title').textContent = tracks[i].name;
    $('sub').textContent = tracks[i].ext + ' file · ' + (i + 1) + ' of ' + tracks.length;
    document.title = tracks[i].name + ' – Spin';
    render();

    if (autoplay) {
      ensureAudio();
      audio.play().catch(() => {});
    }
  }

  function toggle() {
    if (index < 0) {
      return;
    }
    if (audio.paused) {
      ensureAudio();
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function next(auto) {
    if (!tracks.length) {
      return;
    }

    if (auto && repeat === 2) {
      audio.currentTime = 0;
      audio.play();
      return;
    }

    let n;
    if (shuffle && tracks.length > 1) {
      do {
        n = Math.floor(Math.random() * tracks.length);
      } while (n === index);
    } else {
      n = index + 1;
      if (n >= tracks.length) {
        if (auto && repeat === 0) {
          audio.pause();
          audio.currentTime = 0;
          return;
        }
        n = 0;
      }
    }
    load(n, true);
  }

  function prev() {
    if (!tracks.length) {
      return;
    }
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    load((index - 1 + tracks.length) % tracks.length, true);
  }

  function remove(i) {
    URL.revokeObjectURL(tracks[i].url);
    const wasCurrent = i === index;
    tracks.splice(i, 1);

    if (!tracks.length) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      index = -1;
      $('title').textContent = 'Nothing playing';
      $('sub').textContent = 'Add songs to start listening';
      $('cur').textContent = '0:00';
      $('dur').textContent = '0:00';
      $('seek').value = 0;
      fill($('seek'), 0);
    } else if (wasCurrent) {
      load(Math.min(i, tracks.length - 1), !audio.paused);
    } else if (i < index) {
      index--;
    }
    render();
  }

  /* ---------- Playlist UI ---------- */
  function render() {
    const ul = $('list');
    ul.innerHTML = '';
    $('count').textContent = tracks.length ? '(' + tracks.length + ')' : '';

    if (!tracks.length) {
      ul.innerHTML =
        '<div class="empty">Drop audio files here or use “Add songs”.<br>' +
        'MP3, WAV, OGG, M4A, AAC, FLAC, OPUS and more.</div>';
      return;
    }

    tracks.forEach((track, i) => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      if (i === index) {
        li.className = 'active';
      }

      li.innerHTML =
        '<span class="name"></span>' +
        '<span class="ext"></span>' +
        '<button class="rm" title="Remove" aria-label="Remove">×</button>';
      li.querySelector('.name').textContent = track.name;
      li.querySelector('.ext').textContent = track.ext;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.rm')) {
          remove(i);
        } else {
          load(i, true);
        }
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          load(i, true);
        }
      });

      ul.appendChild(li);
    });
  }

  /* ---------- Audio events ---------- */
  audio.addEventListener('play', () => {
    playerEl.classList.add('playing');
    $('playIcon').innerHTML = ICON_PAUSE;
    $('play').setAttribute('aria-label', 'Pause');
  });

  audio.addEventListener('pause', () => {
    playerEl.classList.remove('playing');
    $('playIcon').innerHTML = ICON_PLAY;
    $('play').setAttribute('aria-label', 'Play');
  });

  audio.addEventListener('ended', () => next(true));

  audio.addEventListener('loadedmetadata', () => {
    $('dur').textContent = fmt(audio.duration);
    say('');
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) {
      return;
    }
    const percent = (audio.currentTime / audio.duration) * 100;
    $('cur').textContent = fmt(audio.currentTime);
    if (!seeking) {
      $('seek').value = percent;
      fill($('seek'), percent);
    }
  });

  audio.addEventListener('error', () => {
    if (index < 0) {
      return;
    }
    say('Your browser can’t play “' + tracks[index].ext + '” files. Try converting it to MP3 or M4A.');
  });

  /* ---------- Controls ---------- */
  $('seek').addEventListener('input', (e) => {
    seeking = true;
    fill(e.target, e.target.value);
    $('cur').textContent = fmt((audio.duration * e.target.value) / 100);
  });

  $('seek').addEventListener('change', (e) => {
    if (audio.duration) {
      audio.currentTime = (audio.duration * e.target.value) / 100;
    }
    seeking = false;
  });

  $('vol').addEventListener('input', (e) => setVolume(Number(e.target.value)));
  setVolume(0.8);

  $('play').addEventListener('click', toggle);
  $('next').addEventListener('click', () => next(false));
  $('prev').addEventListener('click', prev);

  $('shuffle').addEventListener('click', (e) => {
    shuffle = !shuffle;
    e.currentTarget.classList.toggle('on', shuffle);
  });

  $('repeat').addEventListener('click', (e) => {
    repeat = (repeat + 1) % 3;
    e.currentTarget.classList.toggle('on', repeat > 0);
    e.currentTarget.title = REPEAT_LABELS[repeat];
    say(REPEAT_LABELS[repeat]);
  });

  $('file').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });

  /* ---------- Drag and drop ---------- */
  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (e) => {
      e.preventDefault();
      playerEl.classList.add('drag');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    window.addEventListener(type, (e) => {
      e.preventDefault();
      playerEl.classList.remove('drag');
    });
  });

  window.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  /* ---------- Keyboard shortcuts ---------- */
  window.addEventListener('keydown', (e) => {
    const target = e.target;

    if (target.tagName === 'SELECT') {
      return;
    }
    if (target.matches('input[type=range]') && e.key.startsWith('Arrow')) {
      return;
    }

    if (e.code === 'Space') {
      if (!target.closest('button, li, summary')) {
        e.preventDefault();
        toggle();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
        audio.currentTime += 5;
        break;
      case 'ArrowLeft':
        audio.currentTime -= 5;
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(audio.volume + 0.05);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(audio.volume - 0.05);
        break;
      case 's':
      case 'S':
        $('shuffle').click();
        break;
      case 'r':
      case 'R':
        $('repeat').click();
        break;
    }
  });

  render();
})();
