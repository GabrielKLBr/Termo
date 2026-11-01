// Resolve somente os dois arquivos oficiais da release do Termo no GitHub.
// Os downloads permanecem indisponíveis enquanto a release não for publicada.
const repo = 'GabrielKLBr/Termo';
const tag = 'v1.0.0';
const targets = {
  installer: 'Termo-Setup-1.0.0-x64.exe',
  portable: 'TermoWindows.zip',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido' });
  }
  // O CDN da Vercel evita consultas desnecessárias à API pública do GitHub.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Termo-Infinito-Downloads',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (response.status === 404) return res.status(200).json({ installer: null, portable: null });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const release = await response.json();
    const files = Array.isArray(release.assets) ? release.assets : [];
    const result = {};
    for (const [key, name] of Object.entries(targets)) {
      const asset = files.find(a => a.name === name && a.state === 'uploaded' &&
        typeof a.browser_download_url === 'string' &&
        a.browser_download_url.startsWith(`https://github.com/${repo}/releases/download/${tag}/`));
      result[key] = asset ? { url: asset.browser_download_url, size: asset.size } : null;
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('Falha ao consultar release do GitHub:', error?.message);
    return res.status(503).json({ error: 'Downloads temporariamente indisponíveis' });
  }
}
