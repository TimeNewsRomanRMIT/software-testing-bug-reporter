// Handle the single‐bug form submission
document.getElementById('bug-form')
  .addEventListener('submit', async e => {
    e.preventDefault();

    const team        = document.getElementById('team-email').value.trim();
    const url         = document.querySelector('input[name="url"]').value.trim();
    const description = document.querySelector('textarea[name="description"]').value.trim();
    const testSteps   = document.querySelector('textarea[name="testSteps"]').value.trim();

    if (!team || !url || !description) {
      return alert('Please fill in team, URL, and description.');
    }

    const bug = { team, email: team, url, description, testSteps };

    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bug)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || res.statusText);
      }
      alert('Bug submitted! 🎉');
      window.location.reload();
    } catch (err) {
      console.error('Submission error:', err);
      alert('Error: ' + err.message);
    }
  });
