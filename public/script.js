document.getElementById('bug-form').addEventListener('submit', async e => {
  e.preventDefault();

  const fd = new FormData(e.target);
  // also set email same as team if you want to keep that behavior
  const team = document.getElementById('team-email').value.trim();
  fd.append('email', team);

  // rudimentary check
  if (!fd.get('team') || !fd.get('url') || !fd.get('description')) {
    return alert('Please fill in team, URL, and description.');
  }

  try {
    const res = await fetch('/api/bugs', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    alert('Bug submitted! 🎉');
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('Error: ' + err.message);
  }
});

const fileInput = document.getElementById('images');
const preview   = document.getElementById('preview');

// Keep files across multiple selections
let fileBag = new DataTransfer();

fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) {
    if (!f.type.startsWith('image/')) continue;
    if (f.size > 5*1024*1024) { alert(`Too big: ${f.name}`); continue; }
    if (fileBag.items.length >= 5) { alert('Max 5 images'); break; }
    fileBag.items.add(f);
  }
  fileInput.files = fileBag.files;
  renderPreview();
});

function renderPreview() {
  preview.innerHTML = '';
  Array.from(fileInput.files).forEach((f, idx) => {
    const url = URL.createObjectURL(f);
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `
      <img src="${url}" alt="">
      <button type="button" class="remove" data-i="${idx}" aria-label="Remove">&times;</button>
    `;
    preview.appendChild(div);
  });
}

preview.addEventListener('click', (e) => {
  if (!e.target.classList.contains('remove')) return;
  const i = +e.target.dataset.i;
  const newBag = new DataTransfer();
  Array.from(fileInput.files).forEach((f, idx) => {
    if (idx !== i) newBag.items.add(f);
  });
  fileBag = newBag;
  fileInput.files = fileBag.files;
  renderPreview();
});

