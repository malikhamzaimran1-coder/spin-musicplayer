(() => {
  const $ = id => document.getElementById(id);
  const audio = new Audio();
  const playerEl = $('player');
  let tracks = [];       // { name, ext, url }
  let index = -1;
  let shuffle = false;
  let repeat = 0;        // 0 off, 1 all, 2 one

  const ICON_PLAY  = '<path d="M8 5v14l11-7z"/>';
  const ICON_PAUSE = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';

  const fmt = s => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };
  const fill = (el, pct) => el.style.setProperty('--fill', pct + '%');
  const say = t => { $('msg').textContent = t; };

  /* ---------- Adding files ---------- */
  function addFiles(fileList) {
    const files = [...fileList].filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/') ||
      /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm|mp4|amr|3gp|aiff?|wma|ape)$/i.test(f.name));
    if (!files.length) { say('No audio files found in that selection.'); return; }
    const wasEmpty = tracks.length === 0;
    files.forEach(f => {
      const dot = f.name.lastIndexOf('.');
      tracks.push({
        name: dot > 0 ? f.name.slice(0, dot) : f.name,
        ext: dot > 0 ? f.name.slice(dot + 1).toUpperCase() : 'AUDIO',
        url: URL.createObjectURL(f)
      });
    });
    say('');
    render();
    if (wasEmpty) load(0, true);
  }

  /* ---------- Playback ---------- */
  function load(i, autoplay) {
    if (i < 0 || i >= tracks.length) return;
    index = i;
    audio.src = tracks[i].url;
    $('title').textContent = tracks[i].name;
    $('sub').textContent = tracks[i].ext + ' file · ' + (i + 1) + ' of ' + tracks.length;
    document.title = tracks[i].name + ' – Spin';
    render();
    if (autoplay) audio.play().catch(() => {});
  }

  function toggle() {
    if (index < 0) return;
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }

  function next(auto) {
    if (!tracks.length) return;
    if (auto && repeat === 2) { audio.currentTime = 0; audio.play(); return; }
    let n;
    if (shuffle && tracks.length > 1) {
      do { n = Math.floor(Math.random() * tracks.length); } while (n === index);
    } else {
      n = index + 1;
      if (n >= tracks.length) {
        if (auto && repeat === 0) { audio.pause(); audio.currentTime = 0; return; }
        n = 0;
      }
    }
    load(n, true);
  }

  function prev() {
    if (!tracks.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    load((index - 1 + tracks.length) % tracks.length, true);
  }

  function remove(i) {
    URL.revokeObjectURL(tracks[i].url);
    const wasCurrent = i === index;
    tracks.splice(i, 1);
    if (!tracks.length) {
      audio.pause(); audio.removeAttribute('src'); audio.load(); index = -1;
      $('title').textContent = 'Nothing playing';
      $('sub').textContent = 'Add songs to start listening';
      $('cur').textContent = $('dur').textContent = '0:00';
      $('seek').value = 0; fill($('seek'), 0);
    } else if (wasCurrent) {
      load(Math.min(i, tracks.length - 1), !audio.paused);
    } else if (i < index) index--;
    render();
  }

  /* ---------- Playlist UI ---------- */
  function render() {
    const ul = $('list');
    ul.innerHTML = '';
    $('count').textContent = tracks.length ? '(' + tracks.length + ')' : '';
    if (!tracks.length) {
      ul.innerHTML = '<div class="empty">Drop audio files here or use “Add songs”.<br>MP3, WAV, OGG, M4A, AAC, FLAC, OPUS and more.</div>';
      return;
    }
    tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      if (i === index) li.className = 'active';
      li.innerHTML = '<span class="name"></span><span class="ext"></span><button class="rm" title="Remove" aria-label="Remove">×</button>';
      li.querySelector('.name').textContent = t.name;
      li.querySelector('.ext').textContent = t.ext;
      li.addEventListener('click', e => { if (e.target.closest('.rm')) remove(i); else load(i, true); });
      li.addEventListener('keydown', e => { if (e.key === 'Enter') load(i, true); });
      ul.appendChild(li);
    });
  }

  /* ---------- Events ---------- */
  audio.addEventListener('play', () => { playerEl.classList.add('playing'); $('playIcon').innerHTML = ICON_PAUSE; $('play').setAttribute('aria-label', 'Pause'); });
  audio.addEventListener('pause', () => { playerEl.classList.remove('playing'); $('playIcon').innerHTML = ICON_PLAY; $('play').setAttribute('aria-label', 'Play'); });
  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('loadedmetadata', () => { $('dur').textContent = fmt(audio.duration); say(''); });
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = audio.currentTime / audio.duration * 100;
    $('cur').textContent = fmt(audio.currentTime);
    if (!seeking) { $('seek').value = pct; fill($('seek'), pct); }
  });
  audio.addEventListener('error', () => {
    if (index < 0) return;
    say('Your browser can’t play “' + tracks[index].ext + '” files. Try converting it to MP3 or M4A.');
  });

  let seeking = false;
  $('seek').addEventListener('input', e => {
    seeking = true; fill(e.target, e.target.value);
    $('cur').textContent = fmt(audio.duration * e.target.value / 100);
  });
  $('seek').addEventListener('change', e => {
    if (audio.duration) audio.currentTime = audio.duration * e.target.value / 100;
    seeking = false;
  });

  $('vol').addEventListener('input', e => { audio.volume = +e.target.value; fill(e.target, e.target.value * 100); });
  audio.volume = 0.8; fill($('vol'), 80);

  $('play').onclick = toggle;
  $('next').onclick = () => next(false);
  $('prev').onclick = prev;
  $('shuffle').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('on', shuffle); };
  $('repeat').onclick = e => {
    repeat = (repeat + 1) % 3;
    e.currentTarget.classList.toggle('on', repeat > 0);
    e.currentTarget.title = ['Repeat off', 'Repeat all', 'Repeat one'][repeat];
    say(['Repeat off', 'Repeat all', 'Repeat one'][repeat]);
  };

  $('file').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

  // Drag and drop
  ['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); playerEl.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); playerEl.classList.remove('drag'); }));
  window.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.target.matches('input[type=range]') && e.key.startsWith('Arrow')) return;
    if (e.code === 'Space' && !e.target.closest('button, li')) { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') audio.currentTime += 5;
    else if (e.key === 'ArrowLeft') audio.currentTime -= 5;
    else if (e.key === 'ArrowUp') { e.preventDefault(); audio.volume = Math.min(1, audio.volume + .05); $('vol').value = audio.volume; fill($('vol'), audio.volume * 100); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); audio.volume = Math.max(0, audio.volume - .05); $('vol').value = audio.volume; fill($('vol'), audio.volume * 100); }
    else if (e.key.toLowerCase() === 's') $('shuffle').click();
    else if (e.key.toLowerCase() === 'r') $('repeat').click();
  });

  render();
})();
