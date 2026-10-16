async function loadProblemData(embeddedProblems, embeddedMeta) {
  if (embeddedProblems && embeddedMeta) {
    return {
      problems: JSON.parse(embeddedProblems.textContent),
      meta: JSON.parse(embeddedMeta.textContent),
    };
  }
  const [manifest, meta] = await Promise.all([
    fetch('data/manifest.json')
      .then(checkResponse)
      .then((r) => r.json()),
    fetch('data/site-meta.json')
      .then(checkResponse)
      .then((r) => r.json()),
  ]);
  const groups = await Promise.all(
    manifest.map((entry) =>
      fetch(`data/${entry.file}`)
        .then(checkResponse)
        .then((r) => r.json()),
    ),
  );
  return { problems: groups.flat(), meta };
}
function checkResponse(response) {
  if (!response.ok) throw new Error(`Unable to load dashboard data (${response.status})`);
  return response;
}
