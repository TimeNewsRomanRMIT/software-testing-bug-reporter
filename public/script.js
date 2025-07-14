const addBtn    = document.getElementById('add-bug');
const container = document.getElementById('bugs-container');
const tpl       = document.getElementById('bug-template').content;

// Add-bug: clone the template + wire up its remove button
addBtn.addEventListener('click', () => {
  const clone = tpl.cloneNode(true);
  container.appendChild(clone);

  const newCard = container.lastElementChild;
  newCard.querySelector('.remove-bug')
         .addEventListener('click', () => newCard.remove());
});

// Submit: gather all entries and POST to your API
document.getElementById('bug-form')
  .addEventListener('submit', async e => {
    e.preventDefault();

    const team = document.getElementById('team-email').value.trim();
    if (!team) {
      return alert('Please enter your team name or email.');
    }

    const bugs = Array.from(
      container.querySelectorAll('.bug-entry')
    ).map(card => ({
      team,
      email: team,  // you can separate if you like
      url: card.querySelector('input').value.trim(),
      description: card.querySelector('textarea').value.trim()
    }));

    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bugs })
      });
      if (!res.ok) throw await res.json();
      alert('Thanks! Your bugs have been submitted 🎉');
      window.location.reload();
    } catch (err) {
      alert('Error: ' + (err.error || err.message || res.statusText));
    }
  });
