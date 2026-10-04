const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function codeOk(given) {
  const expected = process.env.ACCESS_CODE || '';
  if (!expected || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { code, nom, action } = req.body || {};

  if (!process.env.ACCESS_CODE) {
    return res.status(500).json({ error: 'Variable ACCESS_CODE non configurée sur Vercel.' });
  }
  if (!codeOk(code)) {
    await sleep(900); // ralentit les essais au hasard
    return res.status(401).json({ error: 'Code incorrect.' });
  }
  if (action === 'login') return res.status(200).json({ ok: true });

  const client = String(nom || '').trim().slice(0, 60);
  if (!client) return res.status(400).json({ error: 'Nom du client manquant.' });

  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), 'assets', 'manuel.pdf'));
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const txt = 'Licence : ' + client;
    const size = 15;
    const w = font.widthOfTextAtSize(txt, size);

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      let row = 0;
      for (let y = -height * 0.2; y < height * 1.2; y += 130, row++) {
        const shift = row % 2 ? (w + 70) / 2 : 0;
        for (let x = -width * 0.2; x < width * 1.2; x += w + 70) {
          page.drawText(txt, {
            x: x + shift, y, size, font,
            color: rgb(0.5, 0.5, 0.5), opacity: 0.09, rotate: degrees(30),
          });
        }
      }
    }
    doc.setSubject('Licence personnelle : ' + client);
    const out = await doc.save();

    const safe = client.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'client';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Manuel_Trading_${safe}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(out));
  } catch (e) {
    return res.status(400).json({ error: 'Nom non pris en charge (utilise des lettres latines).' });
  }
};
